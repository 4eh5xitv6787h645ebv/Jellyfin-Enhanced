using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Model.Entities;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Issue #544: enriches Jellyfin items with regional language variants by querying
    /// Sonarr/Radarr. The arrs parse release names for tokens like DUBLADO/LATINO/BR that
    /// ffprobe never sees, so they expose "Portuguese (Brazil)" and "Spanish (Latino)" as
    /// distinct language entries on episodeFile/movieFile records.
    ///
    /// Caches in memory by TVDB id (series) and TMDB id (movie). Refreshes lazily on a 6-hour
    /// schedule, also forced on TagCacheService.BuildFullCache. No disk persistence — the
    /// in-memory dict is cheap to rebuild and avoids stale data drift across plugin updates.
    /// </summary>
    public class LanguageEnrichmentService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        // tvdbId -> regional languages for the series. Reference is swapped atomically
        // by RefreshSonarrAsync (Interlocked.Exchange) so concurrent readers always see
        // either the previous full snapshot or the new full snapshot — never a partial state.
        private volatile Dictionary<int, List<TagRegionalLanguage>> _byTvdbId = new();
        // tmdbId -> regional languages for the movie (same atomic-swap discipline).
        private volatile Dictionary<int, List<TagRegionalLanguage>> _byTmdbId = new();

        // Lock prevents concurrent refreshes from hammering the arrs.
        private readonly SemaphoreSlim _refreshLock = new(1, 1);
        private DateTime _lastRefreshUtc = DateTime.MinValue;
        private static readonly TimeSpan RefreshInterval = TimeSpan.FromHours(6);
        // On a failed refresh, rate-limit retries to every ~5 minutes so many users
        // browsing the library simultaneously can't stampede a down arr.
        private static readonly TimeSpan FailedRetryBackoff = TimeSpan.FromMinutes(5);
        // Coalesces concurrent TryRefreshInBackground calls so N concurrent tag-data
        // requests spawn exactly ONE background task (instead of N waiting on the lock).
        private int _backgroundRefreshInFlight; // 0 = none, 1 = in flight

        // Map arr language NAMES to BCP-47 codes. The arr returns names like "Portuguese (Brazil)"
        // verbatim from its enum; the frontend's flag map keys off these BCP-47 codes.
        // Adding a new variant requires only one line here AND a country mapping in languagetags.js.
        private static readonly Dictionary<string, (string Code, string Name)> ArrNameToBcp47 =
            new(StringComparer.OrdinalIgnoreCase)
        {
            ["Portuguese (Brazil)"] = ("pt-BR", "Portuguese (Brazil)"),
            ["Spanish (Latino)"] = ("es-419", "Spanish (Latino)"),
            ["Spanish (Latin America)"] = ("es-419", "Spanish (Latino)"),
            ["Flemish"] = ("nl-BE", "Flemish"),
            ["Chinese (Mandarin)"] = ("zh-CN", "Chinese (Mandarin)"),
            ["Chinese (Cantonese)"] = ("zh-HK", "Chinese (Cantonese)")
        };

        public LanguageEnrichmentService(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        /// <summary>
        /// Returns regional languages for a Jellyfin item, or null if no enrichment applies.
        /// Looks up by TVDB id (Series/Season/Episode → series TVDB id) or TMDB id (Movie).
        /// Cheap synchronous lookup against the in-memory cache populated by RefreshAsync.
        /// The returned list is a DEFENSIVE COPY — the caller may freely mutate it without
        /// poisoning the shared cache.
        /// </summary>
        public List<TagRegionalLanguage>? GetForItem(BaseItem item)
        {
            if (item == null) return null;
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config?.EnableArrLanguageEnrichment != true) return null;

            try
            {
                // Capture local references — volatile fields can be swapped under us.
                var byTmdb = _byTmdbId;
                var byTvdb = _byTvdbId;

                // Movies → Radarr by TMDB id
                if (item is MediaBrowser.Controller.Entities.Movies.Movie)
                {
                    if (TryGetIntProviderId(item, MetadataProvider.Tmdb, out var tmdbId)
                        && byTmdb.TryGetValue(tmdbId, out var movieLangs))
                    {
                        return new List<TagRegionalLanguage>(movieLangs);
                    }
                    return null;
                }

                // Series / Season / Episode → Sonarr by TVDB id (resolve up to series level).
                // Season.Series / Episode.Series may throw or be null on partially-loaded items,
                // so we guard the navigation properties defensively.
                BaseItem? seriesItem = null;
                if (item is MediaBrowser.Controller.Entities.TV.Series)
                {
                    seriesItem = item;
                }
                else if (item is MediaBrowser.Controller.Entities.TV.Season seasonItem)
                {
                    try { seriesItem = seasonItem.Series; } catch { seriesItem = null; }
                }
                else if (item is MediaBrowser.Controller.Entities.TV.Episode epItem)
                {
                    try { seriesItem = epItem.Series; } catch { seriesItem = null; }
                }

                if (seriesItem != null
                    && TryGetIntProviderId(seriesItem, MetadataProvider.Tvdb, out var tvdbId)
                    && byTvdb.TryGetValue(tvdbId, out var seriesLangs))
                {
                    return new List<TagRegionalLanguage>(seriesLangs);
                }
                return null;
            }
            catch (Exception ex)
            {
                _logger.Debug($"[LangEnrichment] GetForItem failed for {item?.Id}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Trigger a background refresh if the cached data is stale. Non-blocking — fire-and-forget.
        /// Concurrent callers are coalesced via an in-flight flag so N simultaneous tag-data
        /// requests spawn exactly one background Task, not N. Callers can also await
        /// EnsureFreshAsync directly to block until populated.
        /// </summary>
        public void TryRefreshInBackground()
        {
            if (DateTime.UtcNow - _lastRefreshUtc < RefreshInterval) return;
            // Coalesce: only one background refresh can be in flight at a time.
            if (Interlocked.CompareExchange(ref _backgroundRefreshInFlight, 1, 0) != 0) return;
            _ = Task.Run(async () =>
            {
                try { await EnsureFreshAsync(CancellationToken.None).ConfigureAwait(false); }
                catch (Exception ex) { _logger.Warning($"[LangEnrichment] Background refresh failed: {ex.Message}"); }
                finally { Interlocked.Exchange(ref _backgroundRefreshInFlight, 0); }
            });
        }

        /// <summary>
        /// Ensures the in-memory cache is fresh; if stale, fetches from Sonarr+Radarr now.
        /// Called by TagCacheService.BuildFullCache so a manual rebuild always picks up new data.
        /// Pass force=true to bypass the 6-hour TTL — BuildFullCache uses this so a deliberate
        /// rebuild always re-pulls from the arrs.
        /// </summary>
        public async Task EnsureFreshAsync(CancellationToken cancellationToken, bool force = false)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config?.EnableArrLanguageEnrichment != true) return;

            if (!force && DateTime.UtcNow - _lastRefreshUtc < RefreshInterval) return;

            await _refreshLock.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                // Re-check inside the lock — another caller may have just refreshed.
                if (!force && DateTime.UtcNow - _lastRefreshUtc < RefreshInterval) return;

                var sw = System.Diagnostics.Stopwatch.StartNew();

                // Refresh Radarr (1 bulk call) and Sonarr (per-series episodeFile calls) in parallel.
                // Each returns >=0 on success (entry count) or -1 when the cache was intentionally
                // preserved (transient failure) so we don't advance _lastRefreshUtc and suppress retries.
                var radarrTask = RefreshRadarrAsync(config, cancellationToken);
                var sonarrTask = RefreshSonarrAsync(config, cancellationToken);
                await Task.WhenAll(radarrTask, sonarrTask).ConfigureAwait(false);
                int radarrCount = radarrTask.Result;
                int sonarrCount = sonarrTask.Result;

                bool anyFailed = radarrCount < 0 || sonarrCount < 0;
                if (anyFailed)
                {
                    // Backoff: pretend the last successful refresh was (RefreshInterval - FailedRetryBackoff)
                    // ago, so the next attempt is allowed in FailedRetryBackoff minutes instead of either
                    // "right now" (stampedes the arr) or "6 hours from now" (hides the outage).
                    _lastRefreshUtc = DateTime.UtcNow - RefreshInterval + FailedRetryBackoff;
                }
                else
                {
                    _lastRefreshUtc = DateTime.UtcNow;
                }
                sw.Stop();
                var radarrLabel = radarrCount < 0 ? "preserved" : radarrCount.ToString();
                var sonarrLabel = sonarrCount < 0 ? "preserved" : sonarrCount.ToString();
                _logger.Info($"[LangEnrichment] Refresh complete in {sw.Elapsed.TotalSeconds:F1}s — movies: {radarrLabel}, series: {sonarrLabel}");
            }
            finally
            {
                _refreshLock.Release();
            }
        }

        private async Task<int> RefreshRadarrAsync(Configuration.PluginConfiguration config, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(config.RadarrUrl) || string.IsNullOrWhiteSpace(config.RadarrApiKey))
                return 0;

            try
            {
                var url = config.RadarrUrl.TrimEnd('/');
                using var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Add("X-Api-Key", config.RadarrApiKey);
                client.Timeout = TimeSpan.FromSeconds(60);

                using var response = await client.GetAsync($"{url}/api/v3/movie", cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    // -1 signals "keep previous cache, don't update _lastRefreshUtc" so a
                    // broken API key doesn't suppress retries for 6 hours.
                    _logger.Warning($"[LangEnrichment] Radarr /movie returned {(int)response.StatusCode} — keeping previous cache");
                    return -1;
                }

                var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                var movies = JArray.Parse(json);

                // Guard: if Radarr returns an empty movie list but we had cached entries,
                // preserve the cache. Empty response can mean mid-reindex, auth scope change,
                // root folder moved, etc. — not "delete everything."
                if (movies.Count == 0 && _byTmdbId.Count > 0)
                {
                    _logger.Warning($"[LangEnrichment] Radarr /movie returned empty list but cache has {_byTmdbId.Count} entries — keeping previous cache");
                    return -1;
                }

                var newMap = new Dictionary<int, List<TagRegionalLanguage>>();
                foreach (var movie in movies)
                {
                    var tmdbId = movie.Value<int?>("tmdbId");
                    if (tmdbId == null || tmdbId.Value <= 0) continue;
                    var movieFile = movie["movieFile"] as JObject;
                    if (movieFile == null) continue;

                    var regional = ExtractRegionalLanguages(movieFile["languages"] as JArray);
                    if (regional.Count > 0)
                    {
                        newMap[tmdbId.Value] = regional;
                    }
                }

                // Atomic reference swap: readers see the old or new dict, never a transient mix.
                _byTmdbId = newMap;
                return newMap.Count;
            }
            catch (OperationCanceledException) { throw; }
            catch (HttpRequestException ex)
            {
                _logger.Warning($"[LangEnrichment] Radarr connectivity error: {ex.Message} — keeping previous cache");
                return -1;
            }
            catch (Newtonsoft.Json.JsonReaderException ex)
            {
                _logger.Warning($"[LangEnrichment] Radarr JSON parse error: {ex.Message} — keeping previous cache");
                return -1;
            }
        }

        private async Task<int> RefreshSonarrAsync(Configuration.PluginConfiguration config, CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(config.SonarrUrl) || string.IsNullOrWhiteSpace(config.SonarrApiKey))
                return 0;

            try
            {
                var url = config.SonarrUrl.TrimEnd('/');
                using var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Add("X-Api-Key", config.SonarrApiKey);
                client.Timeout = TimeSpan.FromSeconds(60);

                // Step 1: bulk fetch all series (1 call) to get sonarr id → tvdb id mapping
                using var seriesResp = await client.GetAsync($"{url}/api/v3/series", cancellationToken).ConfigureAwait(false);
                if (!seriesResp.IsSuccessStatusCode)
                {
                    _logger.Warning($"[LangEnrichment] Sonarr /series returned {(int)seriesResp.StatusCode} — keeping previous cache");
                    return -1;
                }
                var seriesJson = await seriesResp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                var seriesArray = JArray.Parse(seriesJson);

                var sonarrIdToTvdbId = new Dictionary<int, int>();
                foreach (var s in seriesArray)
                {
                    var sonarrId = s.Value<int?>("id");
                    var tvdbId = s.Value<int?>("tvdbId");
                    if (sonarrId.HasValue && tvdbId.HasValue && tvdbId.Value > 0)
                        sonarrIdToTvdbId[sonarrId.Value] = tvdbId.Value;
                }

                // Guard: if Sonarr returns an empty series list but we previously had cached
                // entries, preserve the cache. An empty response can mean mid-reindex, auth
                // scope change, root folder moved, etc. — not "delete everything."
                if (sonarrIdToTvdbId.Count == 0 && _byTvdbId.Count > 0)
                {
                    _logger.Warning($"[LangEnrichment] Sonarr /series returned empty list but cache has {_byTvdbId.Count} entries — keeping previous cache");
                    return -1;
                }

                // Step 2: fetch episode files per series, parallel batches of 5 to avoid hammering Sonarr.
                // The /api/v3/episodefile endpoint requires seriesId, so there's no bulk shortcut.
                // Using a ConcurrentDictionary as a staging buffer (multiple parallel tasks write
                // into it); the final swap into the service's exposed dict is atomic-by-reference.
                var staging = new ConcurrentDictionary<int, List<TagRegionalLanguage>>();
                int failureCount = 0;
                int successCount = 0;
                var batches = sonarrIdToTvdbId.Chunk(5);

                foreach (var batch in batches)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var tasks = batch.Select(async kvp =>
                    {
                        try
                        {
                            using var efResp = await client.GetAsync(
                                $"{url}/api/v3/episodefile?seriesId={kvp.Key}",
                                cancellationToken).ConfigureAwait(false);
                            if (!efResp.IsSuccessStatusCode)
                            {
                                Interlocked.Increment(ref failureCount);
                                return;
                            }

                            var efJson = await efResp.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                            var files = JArray.Parse(efJson);
                            Interlocked.Increment(ref successCount);

                            // Union the regional languages across every episode file in the series.
                            // We dedupe by code so a series with mixed-region episodes shows all flags.
                            var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            var combined = new List<TagRegionalLanguage>();
                            foreach (var f in files)
                            {
                                var perFile = ExtractRegionalLanguages(f["languages"] as JArray);
                                foreach (var lang in perFile)
                                {
                                    if (seenCodes.Add(lang.Code)) combined.Add(lang);
                                }
                            }
                            if (combined.Count > 0)
                            {
                                staging[kvp.Value] = combined;
                            }
                        }
                        catch (OperationCanceledException) { throw; }
                        catch (HttpRequestException ex)
                        {
                            Interlocked.Increment(ref failureCount);
                            _logger.Warning($"[LangEnrichment] Sonarr episodeFile fetch for series {kvp.Key} failed: {ex.Message}");
                        }
                        catch (Newtonsoft.Json.JsonReaderException ex)
                        {
                            Interlocked.Increment(ref failureCount);
                            _logger.Warning($"[LangEnrichment] Sonarr episodeFile JSON parse for series {kvp.Key} failed: {ex.Message}");
                        }
                    }).ToList();
                    await Task.WhenAll(tasks).ConfigureAwait(false);
                }

                // If every per-series call failed (Sonarr down mid-refresh), preserve the
                // previous good cache instead of wiping it. Only swap when we got at least
                // one successful episodefile response.
                if (sonarrIdToTvdbId.Count > 0 && successCount == 0)
                {
                    _logger.Warning($"[LangEnrichment] Sonarr refresh: all {failureCount} episodefile calls failed — keeping previous cache");
                    return -1;
                }

                // Atomic reference swap — readers see the old or new snapshot, never a partial.
                var newMap = new Dictionary<int, List<TagRegionalLanguage>>(staging);
                _byTvdbId = newMap;
                return newMap.Count;
            }
            catch (OperationCanceledException) { throw; }
            catch (HttpRequestException ex)
            {
                _logger.Warning($"[LangEnrichment] Sonarr connectivity error: {ex.Message} — keeping previous cache");
                return -1;
            }
            catch (Newtonsoft.Json.JsonReaderException ex)
            {
                _logger.Warning($"[LangEnrichment] Sonarr JSON parse error: {ex.Message} — keeping previous cache");
                return -1;
            }
        }

        /// <summary>
        /// Map a JSON languages array (from arr) to TagRegionalLanguage entries — only the
        /// names that we have an explicit BCP-47 mapping for. Generic entries like "English"
        /// or "French" without region info are skipped (no enrichment value).
        /// </summary>
        private static List<TagRegionalLanguage> ExtractRegionalLanguages(JArray? arr)
        {
            var result = new List<TagRegionalLanguage>();
            if (arr == null) return result;

            foreach (var entry in arr)
            {
                var name = entry.Value<string>("name");
                if (string.IsNullOrEmpty(name)) continue;
                if (ArrNameToBcp47.TryGetValue(name, out var mapping))
                {
                    result.Add(new TagRegionalLanguage { Code = mapping.Code, Name = mapping.Name });
                }
            }
            return result;
        }

        private static bool TryGetIntProviderId(BaseItem item, MetadataProvider provider, out int id)
        {
            id = 0;
            if (item.ProviderIds == null) return false;
            if (!item.ProviderIds.TryGetValue(provider.ToString(), out var raw)) return false;
            return int.TryParse(raw, out id) && id > 0;
        }
    }
}
