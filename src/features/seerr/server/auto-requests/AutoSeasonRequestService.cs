using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Querying;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Requests;
namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    public class AutoSeasonRequestService
    {
        private readonly Logger _logger;
        private readonly AutoRequestClient _requestClient;
        private readonly SeasonDetailsClient _seasonDetails;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;

        // In-memory cache of recently requested seasons to avoid duplicates (keyed by tmdbId_seasonNumber, global across all users)
        private readonly Dictionary<string, DateTime> _requestedSeasons = new();
        private readonly object _requestCacheLock = new();

        public AutoSeasonRequestService(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            IUserDataManager userDataManager,
            ILibraryManager libraryManager)
        {
            _logger = logger;
            _requestClient = new AutoRequestClient(httpClientFactory, logger, "[Auto-Season-Request]");
            _userManager = userManager;
            _seasonDetails = new SeasonDetailsClient(httpClientFactory, logger);
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
        }

        // Checks a completed episode to determine if next season should be requested.
        // Event-driven entry point called when a user finishes or starts watching an episode.
        public async Task CheckEpisodeCompletionAsync(BaseItem episodeItem, Guid userId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.AutoSeasonRequestEnabled || !config.JellyseerrEnabled)
            {
                return;
            }

            var user = _userManager.GetUserById(userId);
            if (user == null)
            {
                return;
            }

            // Get the series this episode belongs to
            var episode = episodeItem as Episode;
            if (episode == null || episode.Series == null || !episode.ParentIndexNumber.HasValue || !episode.IndexNumber.HasValue)
            {
                return;
            }

            var series = episode.Series;
            var seasonNumber = episode.ParentIndexNumber.Value;
            var episodeNumber = episode.IndexNumber.Value;

            _logger.Info($"[Auto-Season-Request] Checking '{series.Name}' S{seasonNumber}E{episodeNumber}");

            // Check this specific season for auto-season-request, passing the current episode number
            await CheckSeasonForAutoRequest(series, seasonNumber, episodeNumber, user);
        }

        // Checks if a specific season needs its next season requested
        private async Task CheckSeasonForAutoRequest(Series series, int currentSeasonNumber, int currentEpisodeNumber, JUser user)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return;
            }

            // Get TMDB ID first - we'll need it for Jellyseerr checks
            var tmdbId = GetTmdbId(series);
            if (string.IsNullOrEmpty(tmdbId))
            {
                _logger.Warning($"[Auto-Season-Request] Could not find TMDB ID for series '{series.Name}'");
                return;
            }

            // Get the total episode count for this season from TMDB/Jellyseerr
            var totalEpisodesInSeason = await _seasonDetails.GetTotalEpisodesInSeasonFromTmdb(tmdbId, currentSeasonNumber);
            if (totalEpisodesInSeason == null || totalEpisodesInSeason <= 0)
            {
                _logger.Warning($"[Auto-Season-Request] Could not determine total episodes for '{series.Name}' S{currentSeasonNumber} from TMDB");
                return;
            }

            // Calculate remaining episodes based on current episode position and TMDB total
            // If watching E8 out of 15 total episodes, remaining = 15 - 8 = 7 episodes left
            var remainingAfterCurrent = totalEpisodesInSeason.Value - currentEpisodeNumber;
            if (remainingAfterCurrent < 0) remainingAfterCurrent = 0;

            // Query episodes in Jellyfin for "require all watched" check if needed
            var availableEpisodesInJellyfin = 0;
            List<Episode> allEpisodes = new List<Episode>();

            if (config.AutoSeasonRequestRequireAllWatched)
            {
                var episodesQuery = new InternalItemsQuery(user)
                {
                    AncestorIds = new[] { series.Id },
                    IncludeItemTypes = new[] { BaseItemKind.Episode },
                    Recursive = true,
                    OrderBy = new[] { (ItemSortBy.ParentIndexNumber, JSortOrder.Ascending), (ItemSortBy.IndexNumber, JSortOrder.Ascending) }
                };

                allEpisodes = _libraryManager.GetItemsResult(episodesQuery).Items
                    .OfType<Episode>()
                    .Where(e => e.ParentIndexNumber == currentSeasonNumber)
                    .OrderBy(e => e.IndexNumber)
                    .ToList();

                availableEpisodesInJellyfin = allEpisodes.Count;
            }

            _logger.Info($"[Auto-Season-Request] Season {currentSeasonNumber}: E{currentEpisodeNumber}/{totalEpisodesInSeason} (TMDB total), {availableEpisodesInJellyfin} available in Jellyfin, {remainingAfterCurrent} episodes remaining after current (threshold: {config.AutoSeasonRequestThresholdValue})");

            // Check if threshold is met
            bool thresholdMet = remainingAfterCurrent <= config.AutoSeasonRequestThresholdValue;

            if (!thresholdMet)
            {
                _logger.Debug($"[Auto-Season-Request] Threshold not met for '{series.Name}' S{currentSeasonNumber}");
                return;
            }

            // If "Require All Episodes Watched" is enabled, verify all episodes before the threshold are watched
            bool shouldRequest = true;
            if (config.AutoSeasonRequestRequireAllWatched)
            {
                // Check that all episodes before the current one are marked as watched
                var episodesBeforeCurrent = allEpisodes.Where(e => e.IndexNumber.HasValue && e.IndexNumber.Value < currentEpisodeNumber).ToList();
                var unwatchedBeforeCurrent = episodesBeforeCurrent.Where(e =>
                {
                    var userData = _userDataManager.GetUserData(user, e);
                    return userData == null || !userData.Played;
                }).ToList();

                if (unwatchedBeforeCurrent.Any())
                {
                    shouldRequest = false;
                    var unwatchedEpisodeNumbers = string.Join(", ", unwatchedBeforeCurrent.Select(e => $"E{e.IndexNumber}"));
                    _logger.Debug($"[Auto-Season-Request] Threshold met but not all prior episodes watched for '{series.Name}' S{currentSeasonNumber}. Unwatched: {unwatchedEpisodeNumbers}");
                }
                else
                {
                    _logger.Info($"[Auto-Season-Request] Threshold met and all prior episodes watched for '{series.Name}' S{currentSeasonNumber} - requesting next season");
                }
            }

            if (!shouldRequest)
            {
                return;
            }

            // Threshold met - prepare to request next season
            var nextSeasonNumber = currentSeasonNumber + 1;

            // Check in-memory cache first (fast path to avoid redundant API calls)
            // Uses a sentinel pattern: write the entry before async work so concurrent
            // callers see it immediately, then remove on failure to allow retries.
            var cacheKey = $"{tmdbId}_S{nextSeasonNumber}";
            lock (_requestCacheLock)
            {
                // Clean up expired entries
                var expiredKeys = _requestedSeasons.Where(kvp => (DateTime.Now - kvp.Value).TotalHours > 1)
                    .Select(kvp => kvp.Key).ToList();
                foreach (var key in expiredKeys) _requestedSeasons.Remove(key);

                if (_requestedSeasons.ContainsKey(cacheKey))
                {
                    _logger.Debug($"[Auto-Season-Request] Already requested S{nextSeasonNumber} for TMDB {tmdbId} (cached)");
                    return;
                }

                // Reserve the slot so concurrent callers see it immediately
                _requestedSeasons[cacheKey] = DateTime.Now;
            }

            // Get episode count for next season to verify it has started
            var nextSeasonEpisodeCount = await _seasonDetails.GetTotalEpisodesInSeasonFromTmdb(tmdbId, nextSeasonNumber);

            if (nextSeasonEpisodeCount == null || nextSeasonEpisodeCount <= 0)
            {
                _logger.Info($"[Auto-Season-Request] Season {nextSeasonNumber} has not started yet (0 episodes) - not requesting");
                // drop the sentinel so the next check actually
                // re-evaluates instead of being stuck for an hour even after
                // TMDB updates with the new season's data.
                lock (_requestCacheLock)
                {
                    _requestedSeasons.Remove(cacheKey);
                }
                return;
            }

            // Check Jellyseerr for season availability/status - always query to get latest status
            var jellyseerrStatus = await _seasonDetails.GetSeasonStatusFromJellyseerr(tmdbId, nextSeasonNumber);

            if (jellyseerrStatus == null)
            {
                _logger.Debug($"[Auto-Season-Request] Season {nextSeasonNumber} does not exist for '{series.Name}' (not available on TMDB)");
                lock (_requestCacheLock)
                {
                    _requestedSeasons.Remove(cacheKey);
                }
                return;
            }

            if (jellyseerrStatus.IsAvailable)
            {
                _logger.Debug($"[Auto-Season-Request] Season {nextSeasonNumber} already available on Jellyfin for '{series.Name}'");
                return;
            }

            if (jellyseerrStatus.IsRequested)
            {
                _logger.Debug($"[Auto-Season-Request] Season {nextSeasonNumber} already requested in Jellyseerr for '{series.Name}'");
                return;
            }

            // Season exists, not available, not requested - proceed with request
            var success = await RequestNextSeason(tmdbId, nextSeasonNumber, user.Id.ToString());

            if (success)
            {
                _logger.Info($"[Auto-Season-Request] ✓ Requested '{series.Name}' S{nextSeasonNumber} (TMDB: {tmdbId}) for {user.Username}");
            }
            else
            {
                // Remove sentinel so a future attempt can retry
                lock (_requestCacheLock)
                {
                    _requestedSeasons.Remove(cacheKey);
                }
                _logger.Warning($"[Auto-Season-Request] ✗ Failed to request '{series.Name}' S{nextSeasonNumber} for {user.Username}");
            }
        }

        // Gets TMDB ID from series metadata
        private string? GetTmdbId(Series series)
        {
            if (series.ProviderIds.TryGetValue("Tmdb", out var tmdbId))
            {
                return tmdbId;
            }
            return null;
        }

        private Task<bool> RequestNextSeason(string tmdbId, int seasonNumber, string jellyfinUserId)
        {
            return _requestClient.SubmitAsync(jellyfinUserId, "season", () => JsonSerializer.Serialize(new
            {
                mediaType = "tv",
                mediaId = int.Parse(tmdbId),
                seasons = new[] { seasonNumber }
            }));
        }
    }
}
