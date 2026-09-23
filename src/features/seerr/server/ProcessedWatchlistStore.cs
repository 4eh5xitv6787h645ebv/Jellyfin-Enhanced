using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>Owns the processed-watchlist filename and retention policy using the shared user store.</summary>
    internal sealed class ProcessedWatchlistStore
    {
        private readonly UserConfigurationManager _store;
        private readonly Logger _logger;

        public ProcessedWatchlistStore(UserConfigurationManager store, Logger logger)
        {
            _store = store;
            _logger = logger;
        }

        /// Gets processed watchlist items for a user.
        public ProcessedWatchlistItems GetProcessedWatchlistItems(Guid userId)
        {
            return _store.GetUserConfiguration<ProcessedWatchlistItems>(userId.ToString(), "processed-watchlist-items.json");
        }

        /// Saves processed watchlist items for a user.
        public void SaveProcessedWatchlistItems(Guid userId, ProcessedWatchlistItems items)
        {
            _store.SaveUserConfiguration(userId.ToString(), "processed-watchlist-items.json", items);
        }

        /// Cleans up old processed watchlist items (older than specified days).
        public void CleanupOldProcessedWatchlistItems(Guid userId, int daysToKeep = 365)
        {
            try
            {
                var items = GetProcessedWatchlistItems(userId);
                var cutoffDate = System.DateTime.UtcNow.AddDays(-daysToKeep);

                var originalCount = items.Items.Count;
                var itemsToKeep = items.Items.Where(item => item.ProcessedAt > cutoffDate).ToList();

                if (itemsToKeep.Count != originalCount)
                {
                    items.Items = itemsToKeep;
                    SaveProcessedWatchlistItems(userId, items);
                    _logger.Info($"Cleaned up {originalCount - itemsToKeep.Count} old processed watchlist items for user {userId}");
                }
            }
            catch (Exception ex)
            {
                _logger.Error($"Error cleaning up processed watchlist items for user {userId}: {ex.Message}");
            }
        }
    }
}
