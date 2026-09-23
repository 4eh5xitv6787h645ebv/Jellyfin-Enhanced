using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Library;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Requests;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    public class AutoMovieRequestService
    {
        private readonly Logger _logger;
        private readonly AutoRequestClient _requestClient;
        private readonly MovieCollectionClient _collectionClient;
        private readonly MovieQualityProfileResolver _qualityResolver;
        private readonly IUserManager _userManager;

        // Track which movies have already been requested to avoid duplicates (with timestamps for expiry)
        private readonly Dictionary<string, Dictionary<string, DateTime>> _requestedMovies = new();
        private readonly object _movieCacheLock = new();

        public AutoMovieRequestService(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            ILibraryManager libraryManager)
        {
            _logger = logger;
            _requestClient = new AutoRequestClient(httpClientFactory, logger, "[Auto-Movie-Request]");
            _userManager = userManager;
            _collectionClient = new MovieCollectionClient(httpClientFactory, logger);
            _qualityResolver = new MovieQualityProfileResolver(httpClientFactory, logger);
        }

        // Checks a movie to determine if the next movie in collection should be requested.
        // Event-driven entry point called when a user starts watching a movie.
        public async Task CheckMovieForCollectionRequestAsync(BaseItem movieItem, Guid userId)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.AutoMovieRequestEnabled || !config.JellyseerrEnabled)
            {
                return;
            }

            if (string.IsNullOrEmpty(config.TMDB_API_KEY))
            {
                _logger.Warning("[Auto-Movie-Request] TMDB API key is not configured. Auto movie requests require TMDB API access.");
                return;
            }

            var user = _userManager.GetUserById(userId);
            if (user == null)
            {
                return;
            }

            // Ensure this is a movie
            var movie = movieItem as Movie;
            if (movie == null)
            {
                return;
            }

            // Get TMDB ID
            var tmdbId = GetTmdbId(movie);
            if (string.IsNullOrEmpty(tmdbId))
            {
                _logger.Debug($"[Auto-Movie-Request] '{movie.Name}' has no TMDB ID");
                return;
            }

            // Get collection info from TMDB
            var collectionInfo = await _collectionClient.GetTmdbCollectionIdAsync(tmdbId);
            if (collectionInfo == null)
            {
                // _logger.Debug($"[Auto-Movie-Request] '{movie.Name}' is not part of a TMDB collection");
                return;
            }

            _logger.Info($"[Auto-Movie-Request] '{movie.Name}' is part of {collectionInfo.Name} (TMDB collection {collectionInfo.Id})");

            // Get collection details from Jellyseerr
            var nextMovieInfo = await _collectionClient.GetNextMovieInCollectionAsync(collectionInfo.Id, tmdbId);
            if (nextMovieInfo == null)
            {
                // _logger.Debug($"[Auto-Movie-Request] No next movie found or next movie is already available/requested");
                return;
            }

            // Check if we've already requested this movie (in-memory cache with 1-hour expiry)
            // Uses a sentinel pattern: write the entry before async work so concurrent
            // callers see it immediately, then remove on failure to allow retries.
            var requestKey = $"{user.Id}_{nextMovieInfo.TmdbId}";
            lock (_movieCacheLock)
            {
                // Clean up expired entries across all users
                foreach (var cachedUserId in _requestedMovies.Keys.ToList())
                {
                    var expired = _requestedMovies[cachedUserId]
                        .Where(kvp => (DateTime.Now - kvp.Value).TotalHours >= 1)
                        .Select(kvp => kvp.Key).ToList();
                    foreach (var key in expired) _requestedMovies[cachedUserId].Remove(key);
                    if (_requestedMovies[cachedUserId].Count == 0) _requestedMovies.Remove(cachedUserId);
                }

                if (!_requestedMovies.ContainsKey(user.Id.ToString()))
                {
                    _requestedMovies[user.Id.ToString()] = new Dictionary<string, DateTime>();
                }

                if (_requestedMovies[user.Id.ToString()].ContainsKey(requestKey))
                {
                    _logger.Debug($"[Auto-Movie-Request] Already requested '{nextMovieInfo.Title}' (cached)");
                    return;
                }

                // Reserve the slot so concurrent callers see it immediately
                _requestedMovies[user.Id.ToString()][requestKey] = DateTime.Now;
            }

            // Resolve quality profile settings based on configuration mode
            var qualitySettings = await _qualityResolver.ResolveQualityProfileAsync(tmdbId);

            // Request the movie
            var success = await RequestMovie(nextMovieInfo.TmdbId.ToString(), user.Id.ToString(), qualitySettings);

            if (success)
            {
                _logger.Info($"[Auto-Movie-Request] ✓ Requested '{nextMovieInfo.Title}' (TMDB {nextMovieInfo.TmdbId}) for {user.Username}");
            }
            else
            {
                // Remove sentinel so a future attempt can retry
                lock (_movieCacheLock)
                {
                    if (_requestedMovies.ContainsKey(user.Id.ToString()))
                    {
                        _requestedMovies[user.Id.ToString()].Remove(requestKey);
                    }
                }
                _logger.Warning($"[Auto-Movie-Request] ✗ Failed to request '{nextMovieInfo.Title}' (TMDB {nextMovieInfo.TmdbId}) for {user.Username}");
            }
        }

        // Gets TMDB ID from movie metadata
        private string? GetTmdbId(Movie movie)
        {
            if (movie.ProviderIds.TryGetValue("Tmdb", out var tmdbId))
            {
                return tmdbId;
            }
            return null;
        }

        private Task<bool> RequestMovie(string tmdbId, string jellyfinUserId, MovieQualityProfileResolver.QualityProfileSettings? qualitySettings = null)
        {
            return _requestClient.SubmitAsync(jellyfinUserId, "movie", () =>
            {
                var requestBody = new Dictionary<string, object>
                {
                    { "mediaType", "movie" },
                    { "mediaId", int.Parse(tmdbId) }
                };

                if (qualitySettings != null)
                {
                    if (qualitySettings.ServerId.HasValue && qualitySettings.ServerId.Value >= 0)
                        requestBody["serverId"] = qualitySettings.ServerId.Value;
                    if (qualitySettings.ProfileId.HasValue && qualitySettings.ProfileId.Value > 0)
                        requestBody["profileId"] = qualitySettings.ProfileId.Value;
                    if (!string.IsNullOrEmpty(qualitySettings.RootFolder))
                        requestBody["rootFolder"] = qualitySettings.RootFolder;
                    if (qualitySettings.Is4k)
                        requestBody["is4k"] = true;
                }

                return JsonSerializer.Serialize(requestBody);
            });
        }

        // Clears the request cache (useful for testing or resetting)
        public void ClearRequestCache()
        {
            lock (_movieCacheLock)
            {
                _requestedMovies.Clear();
            }
            _logger.Info("[Auto-Movie-Request] Cleared auto movie request cache");
        }
    }
}
