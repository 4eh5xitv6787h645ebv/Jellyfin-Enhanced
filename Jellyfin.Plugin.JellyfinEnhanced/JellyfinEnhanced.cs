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
using Microsoft.Extensions.Logging;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Common.Net;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

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
            CleanupLegacyPluginPagesConfig();
            BackfillMissingDefaultShortcuts();
        }

        // One-time housekeeping for installs that previously had Plugin Pages
        // managing JE's sidebar entries. We strip those JE entries from PP's
        // config so users don't see broken links pointing at our deleted
        // wrapper pages. PP itself remains functional for any other plugins
        // that still rely on it.
        //
        // Writes go through a temp file + File.Replace so a crash mid-write
        // can't truncate the config that another plugin (e.g. HomeScreenSections)
        // also writes to. Last-writer-wins is still possible if PP is
        // concurrently writing too — accepted because PP only writes on its
        // own startup, and our cleanup is idempotent (next boot re-runs
        // until clean).
        private void CleanupLegacyPluginPagesConfig()
        {
            try
            {
                var ppConfigPath = Path.Combine(_applicationPaths.PluginConfigurationsPath, "Jellyfin.Plugin.PluginPages", "config.json");
                if (!File.Exists(ppConfigPath)) return;

                var raw = File.ReadAllText(ppConfigPath);
                if (string.IsNullOrWhiteSpace(raw)) return;

                var config = JObject.Parse(raw);
                var pages = config.Value<JArray>("pages");
                if (pages == null) return;

                var ourPrefix = typeof(JellyfinEnhanced).Namespace + ".";
                var toRemove = pages
                    .OfType<JObject>()
                    .Where(p => (p.Value<string>("Id") ?? string.Empty).StartsWith(ourPrefix, StringComparison.Ordinal))
                    .ToList();

                if (toRemove.Count == 0) return;

                foreach (var p in toRemove) pages.Remove(p);

                var tmpPath = ppConfigPath + ".je-tmp";
                File.WriteAllText(tmpPath, config.ToString(Formatting.Indented));
                File.Replace(tmpPath, ppConfigPath, ppConfigPath + ".je-bak");
                _logger.Info($"Removed {toRemove.Count} legacy JE entries from Plugin Pages config.");
            }
            catch (Exception ex)
            {
                _logger.Error($"Could not clean legacy Plugin Pages config: {ex.Message}");
            }
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

        // index.html injection now happens in Web/HtmlInjectionMiddleware at request time.
        // No on-disk mutation, no Plugin Pages config, no File Transformation dependency.

        public override void OnUninstalling()
        {
            CleanupLegacyOnDiskScript();
            base.OnUninstalling();
        }

        // One-time housekeeping for installs that previously wrote a script
        // tag into web/index.html via the now-deleted UpdateIndexHtml path.
        private void CleanupLegacyOnDiskScript()
        {
            try
            {
                var indexPath = IndexHtmlPath;
                if (!File.Exists(indexPath)) return;

                var content = File.ReadAllText(indexPath);
                var regex = new System.Text.RegularExpressions.Regex(
                    $"<script[^>]*plugin=[\"']{System.Text.RegularExpressions.Regex.Escape(Name)}[\"'][^>]*>\\s*</script>\\n?");

                if (regex.IsMatch(content))
                {
                    content = regex.Replace(content, string.Empty);
                    File.WriteAllText(indexPath, content);
                    _logger.Info("Removed legacy on-disk script tag from index.html.");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Could not clean legacy script tag from index.html: {ex.Message}");
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

        // GetViews() removed — JE no longer ships standalone wrapper pages
        // because we don't depend on Plugin Pages. Page rendering happens via
        // js/web/route-hijacker.js, which mounts the existing renderForCustomTab
        // implementations into the live SPA when the user navigates to
        // #/JellyfinEnhanced/<id>.
    }
}