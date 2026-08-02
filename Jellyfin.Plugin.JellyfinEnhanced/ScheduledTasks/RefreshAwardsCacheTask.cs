using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using MediaBrowser.Model.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks
{
    /// <summary>
    /// Re-fetches awards records that have aged past the configured TTL.
    /// </summary>
    /// <remarks>
    /// Awards for a given title change a handful of times a year at most, so nothing
    /// here is urgent. The task runs daily but only touches entries older than the TTL
    /// (30 days by default), which spreads the refresh of a large library naturally
    /// across many days instead of producing a monthly burst of requests.
    ///
    /// Titles that have never been looked up are deliberately NOT pre-fetched: a record
    /// is created the first time someone opens the detail page, so the cache only ever
    /// holds titles people actually browse.
    /// </remarks>
    public class RefreshAwardsCacheTask : IScheduledTask
    {
        private readonly Logger _logger;
        private readonly Services.AwardsService _awardsService;

        public RefreshAwardsCacheTask(Logger logger, Services.AwardsService awardsService)
        {
            _logger = logger;
            _awardsService = awardsService;
        }

        public string Name => "Refresh Awards Cache";

        public string Key => "JellyfinEnhancedRefreshAwardsCache";

        public string Description => "Re-fetches cached award data that has aged past the configured cache lifetime. Only runs when the Awards feature is enabled.";

        public string Category => "Jellyfin Enhanced";

        public IEnumerable<TaskTriggerInfo> GetDefaultTriggers()
        {
            return new[]
            {
                new TaskTriggerInfo
                {
                    Type = TaskTriggerInfoType.DailyTrigger,
                    // Early morning, offset from the tag cache build at 03:00 so the two
                    // do not contend for the same window.
                    TimeOfDayTicks = TimeSpan.FromHours(4).Ticks
                }
            };
        }

        public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
        {
            if (JellyfinEnhanced.Instance?.Configuration?.AwardsEnabled != true)
            {
                progress?.Report(100);
                return;
            }

            try
            {
                var refreshed = await _awardsService.RefreshStaleAsync(progress, cancellationToken).ConfigureAwait(false);
                _logger.Info($"[Awards] Refreshed {refreshed} stale award records.");
            }
            catch (OperationCanceledException)
            {
                _logger.Info("[Awards] Refresh cancelled.");
                throw;
            }
            catch (Exception ex)
            {
                _logger.Error($"[Awards] Refresh failed: {ex.Message}");
            }
            finally
            {
                progress?.Report(100);
            }
        }
    }
}
