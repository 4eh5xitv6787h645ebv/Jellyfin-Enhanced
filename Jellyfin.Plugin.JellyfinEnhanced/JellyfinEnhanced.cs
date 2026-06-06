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
using System.Linq;
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

        public JellyfinEnhanced(IApplicationPaths applicationPaths, IServerConfigurationManager serverConfigurationManager, IXmlSerializer xmlSerializer, Logger logger) : base(applicationPaths, xmlSerializer)
        {
            Instance = this;
            _applicationPaths = applicationPaths;
            _logger = logger;
            _logger.Info($"{PluginName} v{Version} initialized. Plugin logs will be written to: {_logger.CurrentLogFilePath}");
            // Set the User-Agent used by every Seerr/TMDB outbound HTTP call.
            // Cloudflare's Browser Integrity Check / Bot Fight Mode flags
            // empty UA as bot �            Helpers.Jellyseerr.SeerrHttpHelper.UserAgent = $"JellyfinEnhanced/{Version}";
            CleanupOldScript();
            CheckPluginPages(applicationPaths, serverConfigurationManager, 1);
            BackfillMissingDefaultShortcuts();
        }

        // Dedupes Shortcuts (XmlSerializer appends to constructor-initialized lists, doubling on each restart)
        // and backfills missing defaults. Reverse iteration so persisted XML rows win over constructor defaults.
        private void BackfillMissingDefaultShortcuts()
        {
            List<Shortcut>? originalShortcuts = null;
            try
            {
                var config = Configuration;
                if (config == null) return;
                config.Shortcuts ??= new List<Shortcut>();
                originalShortcuts = config.Shortcuts;

                var seen = new HashSet<string>(StringComparer.Ordinal);
                var dedupedReversed = new List<Shortcut>(originalShortcuts.Count);
                var emptyKeyNames = new HashSet<string>(StringComparer.Ordinal);
                for (int i = originalShortcuts.Count - 1; i >= 0; i--)
                {
                    var s = originalShortcuts[i];
                    var name = s?.Name ?? string.Empty;
                    if (string.IsNullOrEmpty(name)) continue;
                    if (string.IsNullOrEmpty(s?.Key))
                    {
                        emptyKeyNames.Add(name);
                        continue;
                    }
                    if (seen.Add(name)) dedupedReversed.Add(s!);
                }
                var deduped = new List<Shortcut>(dedupedReversed.Count);
                for (int i = dedupedReversed.Count - 1; i >= 0; i--) deduped.Add(dedupedReversed[i]);
                var malformed = emptyKeyNames.Where(n => !seen.Contains(n)).ToList();
                int duplicatesDropped = originalShortcuts.Count - deduped.Count - malformed.Count;

                var defaults = new PluginConfiguration().Shortcuts ?? new List<Shortcut>();
                var missing = defaults.Where(d => !seen.Contains(d.Name ?? string.Empty)).ToList();
                deduped.AddRange(missing);

                if (duplicatesDropped == 0 && missing.Count == 0 && malformed.Count == 0) return;

                config.Shortcuts = deduped;
                SaveConfiguration();
                _logger.Info(
                    $"Normalized shortcut list: dropped {duplicatesDropped} duplicate(s), " +
                    $"{malformed.Count} malformed entry/entries" +
                    (malformed.Count > 0 ? $" [{string.Join(", ", malformed)}]" : "") +
                    $", added {missing.Count} missing default(s)" +
                    (missing.Count > 0 ? $" [{string.Join(", ", missing.Select(s => s.Name))}]" : ""));
            }
            catch (IOException ex)
            {
                RollbackShortcuts(originalShortcuts);
                _logger.Error($"Failed to save normalized shortcut list to disk (check permissions and free space): {ex}");
            }
            catch (UnauthorizedAccessException ex)
            {
                RollbackShortcuts(originalShortcuts);
                _logger.Error($"Permission denied saving normalized shortcut list: {ex}");
            }
            catch (Exception ex)
            {
                RollbackShortcuts(originalShortcuts);
                _logger.Error($"Unexpected error normalizing shortcut list: {ex}");
            }
        }

        private void RollbackShortcuts(List<Shortcut>? original)
        {
            if (original == null) return;
            try
            {
                var config = Configuration;
                if (config != null) config.Shortcuts = original;
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to roll back shortcut list after save failure: {ex}");
            }
        }

        public override string Name => PluginName;
        public override Guid Id => Guid.Parse("f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b");
        public static JellyfinEnhanced? Instance { get; private set; }

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

        public override void OnUninstalling()
        {
            // The script is injected at request time by WebInjectionMiddleware — nothing is
            // written into index.html. This call only scrubs a legacy on-disk <script> tag left
            // by older Jellyfin Enhanced versions that did write to index.html, so an uninstall
            // leaves the web folder clean.
            CleanupOldScript();
            base.OnUninstalling();
        }

        // Serializes revision reads/bumps so two saves landing in the same
        // millisecond still produce strictly increasing revisions.
        private static readonly object _revisionLock = new object();

        // Compares two configurations while ignoring the revision bookkeeping fields (they
        // must never count as a material change, or every save would bump). Uses Newtonsoft
        // JObject + DeepEquals: property order does not matter for objects, but arrays
        // (Shortcuts etc.) compare element-by-element IN ORDER — a pure reorder counts as a
        // change. That errs toward refreshing clients, which is the safe direction. New
        // config properties are covered automatically (no field list to maintain).
        private static bool ConfigsMateriallyEqual(PluginConfiguration a, PluginConfiguration b)
        {
            var ja = JObject.FromObject(a);
            var jb = JObject.FromObject(b);
            // Neither bookkeeping counter is a material change — they must never make
            // a save look "changed" (would self-trigger) nor "unchanged" incorrectly.
            foreach (var field in new[] { nameof(PluginConfiguration.ClientConfigRevision), nameof(PluginConfiguration.ClientForceRefreshRevision) })
            {
                ja.Remove(field);
                jb.Remove(field);
            }
            return JToken.DeepEquals(ja, jb);
        }

        // Returns the next revision value: strictly greater than the previous one, and equal
        // to "now" in unix-epoch ms whenever that is already greater (so the value stays
        // human-readable as a timestamp in the common case).
        private static long NextRevision(long previous)
        {
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return Math.Max(previous + 1, nowMs);
        }

        // Bumps ClientConfigRevision and persists it, for config-adjacent changes that do not
        // flow through UpdateConfiguration (per-user settings resets, branding file uploads).
        // Returns false when the bump could not be persisted — callers can surface that to the
        // admin instead of implying connected clients will refresh. On a failed save the
        // in-memory value is reverted so what clients see stays consistent with disk.
        public bool BumpClientConfigRevision(string reason)
        {
            try
            {
                lock (_revisionLock)
                {
                    var config = Configuration;
                    if (config == null) return false;
                    var previous = config.ClientConfigRevision;
                    config.ClientConfigRevision = NextRevision(previous);
                    try
                    {
                        SaveConfiguration();
                    }
                    catch
                    {
                        config.ClientConfigRevision = previous;
                        throw;
                    }
                    _logger.Info($"Jellyfin Enhanced: client config revision bumped to {config.ClientConfigRevision} ({reason}).");
                    return true;
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Jellyfin Enhanced: failed to bump client config revision ({reason}); connected clients will NOT auto-refresh for this change: {ex.Message}");
                return false;
            }
        }

        // Bumps ClientForceRefreshRevision and persists it. Backs the admin "Force all clients
        // to refresh" action: connected web clients reload immediately on their next poll,
        // bypassing the safety gates. Returns the new value. A failed save reverts the
        // in-memory value and rethrows, so the endpoint 500s and no client acts on a value
        // that would vanish at the next restart.
        public long ForceClientRefresh()
        {
            lock (_revisionLock)
            {
                var config = Configuration;
                if (config == null) return 0;
                var previous = config.ClientForceRefreshRevision;
                config.ClientForceRefreshRevision = NextRevision(previous);
                try
                {
                    SaveConfiguration();
                }
                catch
                {
                    config.ClientForceRefreshRevision = previous;
                    throw;
                }
                _logger.Info($"Jellyfin Enhanced: FORCE client refresh triggered — force revision is now {config.ClientForceRefreshRevision}.");
                return config.ClientForceRefreshRevision;
            }
        }

        // Runs on every config save (admin page, API, other plugins' writes through the
        // plugin configuration endpoint):
        //  1. Bumps ClientConfigRevision when — and only when — the incoming config
        //     materially differs from the current one (ignoring the revision field
        //     itself), so connected clients know to refresh. No-op saves keep the
        //     old revision and never trigger client reloads.
        //  2. Flushes every Seerr-related cache. Without this, fixing a bad
        //     URL/key/blocklist takes 10-30 minutes to take effect because of the
        //     user-id and response caches — admins see "still broken" after their
        //     fix and assume it didn't work.
        public override void UpdateConfiguration(BasePluginConfiguration configuration)
        {
            lock (_revisionLock)
            {
                if (configuration is PluginConfiguration incoming && Configuration is PluginConfiguration previous)
                {
                    // The force counter is owned by ForceClientRefresh(), never the config
                    // form. Always carry the server's current value forward so a save that
                    // round-tripped a stale value can't roll back a force that happened in
                    // between (which would strand a forced reload mid-flight).
                    incoming.ClientForceRefreshRevision = previous.ClientForceRefreshRevision;

                    bool material;
                    try
                    {
                        material = !ConfigsMateriallyEqual(previous, incoming);
                    }
                    catch (Exception ex)
                    {
                        // If the comparison itself fails, err on the side of refreshing
                        // clients rather than leaving them on stale config.
                        _logger.Warning($"Jellyfin Enhanced: config comparison failed, treating save as a material change: {ex.Message}");
                        material = true;
                    }

                    if (material)
                    {
                        incoming.ClientConfigRevision = NextRevision(previous.ClientConfigRevision);
                        _logger.Info($"Jellyfin Enhanced: configuration materially changed — client config revision is now {incoming.ClientConfigRevision}.");
                    }
                    else
                    {
                        // Preserve the current revision verbatim; the client may have
                        // round-tripped a stale value (or zero) through the form.
                        incoming.ClientConfigRevision = previous.ClientConfigRevision;
                        _logger.Info("Jellyfin Enhanced: configuration saved with no material change — client config revision unchanged.");
                    }
                }

                base.UpdateConfiguration(configuration);
            }

            try
            {
                Controllers.JellyfinEnhancedController.ClearAllSeerrCachesOnConfigChange();
                _logger.Info("Jellyfin Enhanced: configuration updated — Seerr caches cleared.");
            }
            catch (Exception ex)
            {
                _logger.Warning($"Jellyfin Enhanced: failed to clear Seerr caches on config update: {ex.Message}");
            }
        }
        // One-time migration scrub: removes the <script> tag that pre-middleware versions of
        // this plugin wrote into index.html on disk. Purely cosmetic under the request-time
        // injection model — a stale on-disk tag is stripped from every served response by
        // TransformationPatches.IndexHtml anyway — so every failure here is harmless and
        // logged below Error severity.
        private void CleanupOldScript()
        {
            try
            {
                var indexPath = IndexHtmlPath;
                if (!File.Exists(indexPath))
                {
                    // Normal on servers that do not host the web client (HostWebClient=false,
                    // externally served jellyfin-web) — nothing to clean.
                    _logger.Info($"Legacy index.html cleanup skipped — no file at: {indexPath}");
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
                _logger.Warning($"Could not scrub the legacy Jellyfin Enhanced script tag from index.html (harmless — the served page is cleaned at request time; remove the <script plugin=\"Jellyfin Enhanced\"> line manually if you want the file clean): {ex.Message}");
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