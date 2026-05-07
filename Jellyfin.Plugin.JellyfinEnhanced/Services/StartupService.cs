using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Wires up long-running monitor services on Jellyfin startup. Script
    /// injection now happens in <c>Web/HtmlInjectionMiddleware</c> at request
    /// time, so this task no longer registers anything with the (removed)
    /// File Transformation dependency.
    /// </summary>
    public class StartupService : IScheduledTask
    {
        private readonly Logger _logger;
        private readonly IApplicationPaths _applicationPaths;
        private readonly AutoSeasonRequestMonitor _autoSeasonRequestMonitor;
        private readonly AutoMovieRequestMonitor _autoMovieRequestMonitor;
        private readonly WatchlistMonitor _watchlistMonitor;
        private readonly SeerrScanTriggerService _seerrScanTriggerService;

        public string Name => "Jellyfin Enhanced Startup";
        public string Key => "JellyfinEnhancedStartup";
        public string Description => "Initializes Jellyfin Enhanced background services.";
        public string Category => "Jellyfin Enhanced";

        public StartupService(
            Logger logger,
            IApplicationPaths applicationPaths,
            AutoSeasonRequestMonitor autoSeasonRequestMonitor,
            AutoMovieRequestMonitor autoMovieRequestMonitor,
            WatchlistMonitor watchlistMonitor,
            SeerrScanTriggerService seerrScanTriggerService)
        {
            _logger = logger;
            _applicationPaths = applicationPaths;
            _autoSeasonRequestMonitor = autoSeasonRequestMonitor;
            _autoMovieRequestMonitor = autoMovieRequestMonitor;
            _watchlistMonitor = watchlistMonitor;
            _seerrScanTriggerService = seerrScanTriggerService;
        }

        public Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            return Task.Run(() =>
            {
                _logger.Info("Jellyfin Enhanced startup task running.");
                _autoSeasonRequestMonitor.Initialize();
                _autoMovieRequestMonitor.Initialize();
                _watchlistMonitor.Initialize();
                _seerrScanTriggerService.Initialize();
                _logger.Info("Jellyfin Enhanced startup task completed.");
            }, cancellationToken);
        }

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            yield return new TaskTriggerInfo { Type = TaskTriggerInfoType.StartupTrigger };
        }
    }
}
