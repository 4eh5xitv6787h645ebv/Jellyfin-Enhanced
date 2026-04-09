// Global aliases
global using JUser = Jellyfin.Database.Implementations.Entities.User;
global using JSortOrder = Jellyfin.Database.Implementations.Enums.SortOrder;

using System.Globalization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using System.IO;
using System.Collections.Generic;
using System;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using MediaBrowser.Controller.Configuration;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using MediaBrowser.Common.Net;
using System.Reflection;
using System.Runtime.Loader;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public class JellyfinEnhanced : BasePlugin<PluginConfiguration>, IHasWebPages
    {
        private readonly IApplicationPaths _applicationPaths;
        private readonly Logger _logger;
        private const string PluginName = "Jellyfin Enhanced";

        // Phase 0: cached content hash of the current plugin assembly.
        // Computed once at plugin construction via the same logic
        // AssetHashProvider uses, but inlined here because the plugin
        // class itself doesn't get DI-injected services. Used as the ?v=
        // query on the injected <script> URL so that when the plugin is
        // upgraded (new DLL bytes), the browser sees a new URL and drops
        // its cached copy — which is essential because the script endpoint
        // now ships Cache-Control: immutable for one year.
        //
        // Visible as an internal property so AssetHashProvider and any
        // test code can verify the two code paths agree on the hash.
        internal static string ComputedAssetHash { get; private set; } = "bootstrap";

        public JellyfinEnhanced(IApplicationPaths applicationPaths, IServerConfigurationManager serverConfigurationManager, IXmlSerializer xmlSerializer, Logger logger) : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            _applicationPaths = applicationPaths;
            _logger = logger;
            // Phase 0: compute the asset content hash before anything else so
            // InjectScript below has a stable, content-addressed URL to write
            // into index.html. The same hash is returned by
            // AssetHashProvider.Hash — both derive from the assembly file.
            ComputedAssetHash = ComputeAssetHash();
            _logger.Info($"{PluginName} v{Version} initialized. Asset hash: {ComputedAssetHash}. Plugin logs: {_logger.CurrentLogFilePath}");
            // Phase 1: ConfigurationChanged now fans out to both the
            // config-hash invalidation AND the runtime coordinator's
            // monitor lifecycle diff. The coordinator is a DI singleton
            // that may not exist yet when the plugin constructor runs (DI
            // services are registered AFTER the plugin class is constructed),
            // so we use a deferred lookup via RuntimeCoordinator property.
            ConfigurationChanged += (_, _) =>
            {
                Controllers.JellyfinEnhancedController.InvalidateConfigHash();
                RuntimeCoordinator?.OnConfigurationChanged();
            };
            CleanupOldScript();
            CheckPluginPages(applicationPaths, serverConfigurationManager, 1);
        }

        /// <summary>
        /// Computes the content hash of the current plugin assembly using the
        /// same strategy as <see cref="Services.AssetHashProvider"/>. Inlined
        /// here because the plugin class (this) is constructed by Jellyfin
        /// outside the DI container, so it cannot receive services via
        /// constructor injection.
        /// </summary>
        private static string ComputeAssetHash()
        {
            try
            {
                var assemblyPath = typeof(JellyfinEnhanced).Assembly.Location;
                if (!string.IsNullOrWhiteSpace(assemblyPath) && File.Exists(assemblyPath))
                {
                    using var stream = File.OpenRead(assemblyPath);
                    using var sha = System.Security.Cryptography.SHA256.Create();
                    var bytes = sha.ComputeHash(stream);
                    return Convert.ToHexString(bytes).ToLowerInvariant().Substring(0, 16);
                }
            }
            catch
            {
                // fall through to version-based fingerprint
            }
            var version = typeof(JellyfinEnhanced).Assembly.GetName().Version?.ToString() ?? "unknown";
            return version.Replace('.', '-');
        }

        public override string Name => PluginName;
        public override Guid Id => Guid.Parse("f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b");
        public static JellyfinEnhanced? Instance { get; private set; }

        /// <summary>
        /// Phase 1: reference to the DI-managed runtime coordinator.
        /// Set by <see cref="Services.StartupService"/> after DI resolution
        /// so the <see cref="ConfigurationChanged"/> handler can fan out
        /// lifecycle calls without holding a constructor dependency.
        /// </summary>
        internal static Services.JERuntimeCoordinator? RuntimeCoordinator { get; set; }

        private string IndexHtmlPath => Path.Combine(_applicationPaths.WebPath, "index.html");

        public static string BrandingDirectory
        {
            get
            {
                if (Instance == null)
                    return string.Empty;

                var configPath = Instance.ConfigurationFilePath;
                if (string.IsNullOrWhiteSpace(configPath))
                    return string.Empty;

                var configDir = Path.GetDirectoryName(configPath);
                if (string.IsNullOrWhiteSpace(configDir))
                    return string.Empty;

                var pluginFolderName = Path.GetFileNameWithoutExtension(configPath) ?? "Jellyfin.Plugin.JellyfinEnhanced";
                return Path.Combine(configDir, pluginFolderName, "custom_branding");
            }
        }

        public void InjectScript()
        {
            UpdateIndexHtml(true);
        }

        public override void OnUninstalling()
        {
            UpdateIndexHtml(false);
            base.OnUninstalling();
        }
        private void CleanupOldScript()
        {
            try
            {
                var indexPath = IndexHtmlPath;
                if (!File.Exists(indexPath))
                {
                    _logger.Error($"Could not find index.html at path: {indexPath}");
                    return;
                }

                var content = File.ReadAllText(indexPath);
                var regex = new Regex($"<script[^>]*plugin=[\"']{Name}[\"'][^>]*>\\s*</script>\\n?");

                if (regex.IsMatch(content))
                {
                    _logger.Info("Found old Jellyfin Enhanced script tag in index.html. Removing it now.");
                    content = regex.Replace(content, string.Empty);
                    File.WriteAllText(indexPath, content);
                    _logger.Info("Successfully removed old script tag.");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Error during cleanup of old script from index.html: {ex.Message}");
            }
        }
        private void CheckPluginPages(IApplicationPaths applicationPaths, IServerConfigurationManager serverConfigurationManager, int pluginPageConfigVersion)
        {
            try
            {
            string pluginPagesConfig = Path.Combine(applicationPaths.PluginConfigurationsPath, "Jellyfin.Plugin.PluginPages", "config.json");

            JObject config = new JObject();
            if (!File.Exists(pluginPagesConfig))
            {
                FileInfo info = new FileInfo(pluginPagesConfig);
                info.Directory?.Create();
            }
            else
            {
                config = JObject.Parse(File.ReadAllText(pluginPagesConfig));
            }

            if (!config.ContainsKey("pages"))
            {
                config.Add("pages", new JArray());
            }

            var namespaceName = typeof(JellyfinEnhanced).Namespace;

            JObject? hssPageConfig = config.Value<JArray>("pages")!.FirstOrDefault(x =>
                x.Value<string>("Id") == namespaceName) as JObject;

            if (hssPageConfig != null)
            {
                if ((hssPageConfig.Value<int?>("Version") ?? 0) < pluginPageConfigVersion)
                {
                    config.Value<JArray>("pages")!.Remove(hssPageConfig);
                }
            }

            Assembly? pluginPagesAssembly = AssemblyLoadContext.All.SelectMany(x => x.Assemblies).FirstOrDefault(x => x.FullName?.Contains("Jellyfin.Plugin.PluginPages") ?? false);

            Version earliestVersionWithSubUrls = new Version("2.4.1.0");
            bool supportsSubUrls = pluginPagesAssembly != null && pluginPagesAssembly.GetName().Version >= earliestVersionWithSubUrls;

            string rootUrl = serverConfigurationManager.GetNetworkConfiguration().BaseUrl.TrimStart('/').Trim();
            if (!string.IsNullOrEmpty(rootUrl))
            {
                rootUrl = $"/{rootUrl}";
            }

            var pluginConfig = Configuration;

            bool calendarExists = config.Value<JArray>("pages")!
                .Any(x => x.Value<string>("Id") == $"{namespaceName}.CalendarPage");

            bool downloadsExists = config.Value<JArray>("pages")!
                .Any(x => x.Value<string>("Id") == $"{namespaceName}.DownloadsPage");

            bool bookmarksExists = config.Value<JArray>("pages")!
                .Any(x => x.Value<string>("Id") == $"{namespaceName}.BookmarksPage");

            bool hiddenContentExists = config.Value<JArray>("pages")!
                .Any(x => x.Value<string>("Id") == $"{namespaceName}.HiddenContentPage");

            // Only add calendar page if it's enabled and using plugin pages
            if (!calendarExists && pluginConfig.CalendarPageEnabled && pluginConfig.CalendarUsePluginPages)
            {
                config.Value<JArray>("pages")!.Add(new JObject
                {
                    { "Id", $"{namespaceName}.CalendarPage" },
                    { "Url", $"{(supportsSubUrls ? "" : rootUrl)}/JellyfinEnhanced/calendarPage" },
                    { "DisplayText", "Calendar" },
                    { "Icon", "calendar_today" },
                    { "Version", pluginPageConfigVersion }
                });
            }
            // Remove calendar page if it exists but is now disabled or not using plugin pages
            else if (calendarExists && (!pluginConfig.CalendarPageEnabled || !pluginConfig.CalendarUsePluginPages))
            {
                var calendarPage = config.Value<JArray>("pages")!
                    .FirstOrDefault(x => x.Value<string>("Id") == $"{namespaceName}.CalendarPage");
                if (calendarPage != null)
                {
                    config.Value<JArray>("pages")!.Remove(calendarPage);
                }
            }

            // Only add downloads page if it's enabled and using plugin pages
            if (!downloadsExists && pluginConfig.DownloadsPageEnabled && pluginConfig.DownloadsUsePluginPages)
            {
                config.Value<JArray>("pages")!.Add(new JObject
                {
                    { "Id", $"{namespaceName}.DownloadsPage" },
                    { "Url", $"{(supportsSubUrls ? "" : rootUrl)}/JellyfinEnhanced/downloadsPage" },
                    { "DisplayText", "Requests" },
                    { "Icon", "download" },
                    { "Version", pluginPageConfigVersion }
                });
            }
            // Remove downloads page if it exists but is now disabled or not using plugin pages
            else if (downloadsExists && (!pluginConfig.DownloadsPageEnabled || !pluginConfig.DownloadsUsePluginPages))
            {
                var downloadsPage = config.Value<JArray>("pages")!
                    .FirstOrDefault(x => x.Value<string>("Id") == $"{namespaceName}.DownloadsPage");
                if (downloadsPage != null)
                {
                    config.Value<JArray>("pages")!.Remove(downloadsPage);
                }
            }

            // Only add bookmarks page if it's enabled and using plugin pages
            if (!bookmarksExists && pluginConfig.BookmarksEnabled && pluginConfig.BookmarksUsePluginPages)
            {
                config.Value<JArray>("pages")!.Add(new JObject
                {
                    { "Id", $"{namespaceName}.BookmarksPage" },
                    { "Url", $"{(supportsSubUrls ? "" : rootUrl)}/JellyfinEnhanced/bookmarksPage" },
                    { "DisplayText", "Bookmarks" },
                    { "Icon", "bookmark" },
                    { "Version", pluginPageConfigVersion }
                });
            }
            // Remove bookmarks page if it exists but is now disabled or not using plugin pages
            else if (bookmarksExists && (!pluginConfig.BookmarksEnabled || !pluginConfig.BookmarksUsePluginPages))
            {
                var bookmarksPage = config.Value<JArray>("pages")!
                    .FirstOrDefault(x => x.Value<string>("Id") == $"{namespaceName}.BookmarksPage");
                if (bookmarksPage != null)
                {
                    config.Value<JArray>("pages")!.Remove(bookmarksPage);
                }
            }

            // Only add hidden content page if it's enabled and using plugin pages
            if (!hiddenContentExists && pluginConfig.HiddenContentEnabled && pluginConfig.HiddenContentUsePluginPages)
            {
                config.Value<JArray>("pages")!.Add(new JObject
                {
                    { "Id", $"{namespaceName}.HiddenContentPage" },
                    { "Url", $"{(supportsSubUrls ? "" : rootUrl)}/JellyfinEnhanced/hiddenContentPage" },
                    { "DisplayText", "Hidden Content" },
                    { "Icon", "visibility_off" },
                    { "Version", pluginPageConfigVersion }
                });
            }
            // Remove hidden content page if it exists but is now disabled or not using plugin pages
            else if (hiddenContentExists && (!pluginConfig.HiddenContentEnabled || !pluginConfig.HiddenContentUsePluginPages))
            {
                var hiddenContentPage = config.Value<JArray>("pages")!
                    .FirstOrDefault(x => x.Value<string>("Id") == $"{namespaceName}.HiddenContentPage");
                if (hiddenContentPage != null)
                {
                    config.Value<JArray>("pages")!.Remove(hiddenContentPage);
                }
            }

            File.WriteAllText(pluginPagesConfig, config.ToString(Formatting.Indented));
            }
            catch (Exception ex)
            {
                _logger.Error($"Error while updating Plugin Pages configuration: {ex.Message}");
            }
        }
        private void UpdateIndexHtml(bool inject)
        {
            try
            {
                var indexPath = IndexHtmlPath;
                if (!File.Exists(indexPath))
                {
                    _logger.Error($"Could not find index.html at path: {indexPath}");
                    return;
                }

                var content = File.ReadAllText(indexPath);
                // Phase 0: include the content hash as a cache-busting query.
                // Required because /JellyfinEnhanced/script now responds with
                // Cache-Control: public, max-age=31536000, immutable — so
                // the URL itself must change when the plugin upgrades, or
                // the browser will keep serving the old bytes for a year.
                var scriptUrl = $"../JellyfinEnhanced/script?v={ComputedAssetHash}";
                var scriptTag = $"<script plugin=\"{Name}\" version=\"{Version}\" src=\"{scriptUrl}\" defer></script>";
                var regex = new Regex($"<script[^>]*plugin=[\"']{Name}[\"'][^>]*>\\s*</script>\\n?");

                // Remove any old versions of the script tag first
                content = regex.Replace(content, string.Empty);

                if (inject)
                {
                    var closingBodyTag = "</body>";
                    if (content.Contains(closingBodyTag))
                    {
                        content = content.Replace(closingBodyTag, $"{scriptTag}\n{closingBodyTag}");
                        _logger.Info($"Successfully injected/updated the {PluginName} script.");
                    }
                    else
                    {
                        _logger.Warning("Could not find </body> tag in index.html. Script not injected.");
                        return; // Return early if injection point not found
                    }
                }
                else
                {
                    _logger.Info($"Successfully removed the {PluginName} script from index.html during uninstall.");
                }

                File.WriteAllText(indexPath, content);
            }
            catch (Exception ex)
            {
                _logger.Error($"Error while trying to update index.html: {ex.Message}");
            }
        }

        public IEnumerable<PluginPageInfo> GetPages()
        {
            return new[]
            {
                new PluginPageInfo
                {
                    Name = this.Name,
                    DisplayName = "Jellyfin Enhanced",
                    EnableInMainMenu = true,
                    EmbeddedResourcePath = "Jellyfin.Plugin.JellyfinEnhanced.Configuration.configPage.html"
                    //Custom Icons are not supported - https://github.com/jellyfin/jellyfin-web/blob/38ac3355447a91bf280df419d745f5d49d05aa9b/src/apps/dashboard/components/drawer/sections/PluginDrawerSection.tsx#L61
                }
            };
        }

        public IEnumerable<PluginPageInfo> GetViews()
        {
            return new[]
            {
                new PluginPageInfo {
                    Name = "calendarPage",
                    EmbeddedResourcePath = $"{GetType().Namespace}.PluginPages.CalendarPage.html"
                },
                new PluginPageInfo {
                    Name = "downloadsPage",
                    EmbeddedResourcePath = $"{GetType().Namespace}.PluginPages.DownloadsPage.html"
                },
                new PluginPageInfo {
                    Name = "bookmarksPage",
                    EmbeddedResourcePath = $"{GetType().Namespace}.PluginPages.BookmarksPage.html"
                },
                new PluginPageInfo {
                    Name = "hiddenContentPage",
                    EmbeddedResourcePath = $"{GetType().Namespace}.PluginPages.HiddenContentPage.html"
                }
            };
        }
    }
}