using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    public class StartupService : IScheduledTask
    {
        private readonly Logger _logger;
        private readonly IApplicationPaths _applicationPaths;
        private readonly AutoSeasonRequestMonitor _autoSeasonRequestMonitor;
        private readonly AutoMovieRequestMonitor _autoMovieRequestMonitor;
        private readonly WatchlistMonitor _watchlistMonitor;
        private readonly TagCacheService _tagCacheService;
        private readonly TagCacheMonitor _tagCacheMonitor;
        private readonly SeerrScanTriggerService _seerrScanTriggerService;

        public string Name => "Jellyfin Enhanced Startup";
        public string Key => "JellyfinEnhancedStartup";
        public string Description => "Initializes Jellyfin Enhanced background services and performs necessary cleanups. The web script is injected at request time by the plugin's IStartupFilter (no on-disk edit, no File Transformation plugin required).";
        public string Category => "Jellyfin Enhanced";

        public StartupService(Logger logger, IApplicationPaths applicationPaths, AutoSeasonRequestMonitor autoSeasonRequestMonitor, AutoMovieRequestMonitor autoMovieRequestMonitor, WatchlistMonitor watchlistMonitor, TagCacheService tagCacheService, TagCacheMonitor tagCacheMonitor, SeerrScanTriggerService seerrScanTriggerService)
        {
            _logger = logger;
            _applicationPaths = applicationPaths;
            _autoSeasonRequestMonitor = autoSeasonRequestMonitor;
            _autoMovieRequestMonitor = autoMovieRequestMonitor;
            _watchlistMonitor = watchlistMonitor;
            _tagCacheService = tagCacheService;
            _tagCacheMonitor = tagCacheMonitor;
            _seerrScanTriggerService = seerrScanTriggerService;
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            await Task.Run(() =>
            {
                _logger.Info("Jellyfin Enhanced Startup Task run successfully.");

                // Script injection is handled in-process by WebInjectionStartupFilter /
                // WebInjectionMiddleware (registered in PluginServiceRegistrator). Nothing to
                // register here, and no index.html edit on disk.

                // Initialize auto season request monitoring
                _autoSeasonRequestMonitor.Initialize();

                // Initialize auto movie request monitoring
                _autoMovieRequestMonitor.Initialize();

                // Initialize watchlist monitoring
                _watchlistMonitor.Initialize();

                // Initialize on-demand Seerr recently-added scan trigger
                _seerrScanTriggerService.Initialize();

                // Load tag cache from disk. New/changed items are picked up by the
                // monitor via Jellyfin's library scan events (ItemAdded/ItemUpdated).
                // A full rebuild runs daily at 3 AM or can be triggered manually.
                // Wrapped in try/catch so a cache failure never prevents the rest of
                // the plugin from working (tags just fall back to batch mode).
                try
                {
                    _tagCacheService.LoadFromDisk();
                    _tagCacheMonitor.Initialize();

                    // First install: if no cache exists, build it now so tags work immediately
                    if (_tagCacheService.Count == 0)
                    {
                        _logger.Info("[TagCache] No cache on disk, building initial cache...");
                        _tagCacheService.BuildFullCache(null, CancellationToken.None);
                    }
                }
                catch (System.Exception ex)
                {
                    _logger.Error($"[TagCache] Failed to initialize tag cache (tags will use batch fallback): {ex.Message}");
                }

                _logger.Info("Jellyfin Enhanced Startup Task completed successfully.");
            }, cancellationToken);
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            yield return new TaskTriggerInfo()
            {
                Type = TaskTriggerInfoType.StartupTrigger
            };
        }
    }
}
