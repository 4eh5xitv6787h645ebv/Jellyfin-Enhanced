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
    public partial class UserConfigurationManager
    {
        private readonly ProcessedWatchlistStore _watchlist;

        public ProcessedWatchlistItems GetProcessedWatchlistItems(Guid userId)
            => _watchlist.GetProcessedWatchlistItems(userId);

        public void SaveProcessedWatchlistItems(Guid userId, ProcessedWatchlistItems items)
            => _watchlist.SaveProcessedWatchlistItems(userId, items);

        public void CleanupOldProcessedWatchlistItems(Guid userId, int daysToKeep = 365)
            => _watchlist.CleanupOldProcessedWatchlistItems(userId, daysToKeep);
    }
}
