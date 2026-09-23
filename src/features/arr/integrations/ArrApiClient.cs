using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    /// <summary>
    /// Fetches and maps Sonarr, Radarr, and Shoko responses for links, downloads, and calendars.
    /// Owns outbound URL validation, authentication, timeouts, and upstream error reporting;
    /// callers own access checks and aggregation across configured instances.
    /// </summary>
    public sealed class ArrApiClient
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;

        public ArrApiClient(IHttpClientFactory httpClientFactory, Logger logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
        }

        // Async variant used by request-path fan-out helpers so the DNS resolution inside the
        // shared guard doesn't block the request thread before the first await — otherwise N
        // instances serialize their DNS lookups in the Select() prelude (Codex pass-3 P2).
        private async Task<bool> IsAllowedUrlAsync(string url, CancellationToken ct)
        {
            var allowed = await Jellyfin.Plugin.JellyfinEnhanced.Helpers.ArrUrlGuard.IsAllowedUrlAsync(url, ct).ConfigureAwait(false);
            if (!allowed && !string.IsNullOrWhiteSpace(url))
            {
                _logger.Error($"IsAllowedUrl rejected outbound URL: {url}");
            }
            return allowed;
        }

        public struct ArrFetchOutcome
        {
            public object? Match;
            public string? Error;
        }

        private async Task<(T Result, string? Error)> FetchAndMapAsync<T>(
            ArrInstance instance,
            string endpointPath,
            Func<dynamic?, T> mapper,
            T emptyResult,
            TimeSpan timeout,
            string contextLabel,
            CancellationToken ct,
            string authHeaderName = "X-Api-Key")
        {
            if (!await IsAllowedUrlAsync(instance.Url, ct).ConfigureAwait(false))
                return (emptyResult, "URL rejected by SSRF guard");

            try
            {
                var url = instance.Url.TrimEnd('/');
                // Arr (Sonarr/Radarr) instances are commonly fronted by reverse proxies that
                // 301/302 between http↔https or trailing-slash variants. Use the default
                // factory client so redirects are followed — the Seerr-specific named client
                // (SeerrHttpHelper.NamedClient, AllowAutoRedirect=false) is only appropriate
                // for Seerr where a 302 to a login URL is a security signal, not a normal
                // canonicalization.
                // DefaultRequestHeaders mutations remain thread-unsafe for pooled instances,
                // so the API key continues to be set per-request via HttpRequestMessage below.
                var client = _httpClientFactory.CreateClient();
                client.Timeout = timeout;

                var request = new HttpRequestMessage(HttpMethod.Get, $"{url}{endpointPath}");
                request.Headers.TryAddWithoutValidation(authHeaderName, instance.ApiKey);
                var response = await client.SendAsync(request, ct);

                if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized
                    || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
                {
                    // Before the FetchAndMapAsync consolidation this path only surfaced via the
                    // response envelope, so a bad API key would leave no server-side trail. Log
                    // at Error to keep diagnosability on par with the exception branches below.
                    _logger.Error($"Authentication failed for {contextLabel} from {instance.Name}: HTTP {(int)response.StatusCode}");
                    return (emptyResult, $"authentication failed ({(int)response.StatusCode})");
                }

                if (!response.IsSuccessStatusCode)
                {
                    _logger.Error($"Upstream error fetching {contextLabel} from {instance.Name}: HTTP {(int)response.StatusCode}");
                    return (emptyResult, $"HTTP {(int)response.StatusCode}");
                }

                var json = await response.Content.ReadAsStringAsync(ct);
                var data = Newtonsoft.Json.JsonConvert.DeserializeObject<dynamic>(json);
                return (mapper(data), null);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (HttpRequestException ex)
            {
                _logger.Error($"Network error fetching {contextLabel} from {instance.Name}: {ex.Message}");
                return (emptyResult, "network error");
            }
            catch (TaskCanceledException ex)
            {
                _logger.Error($"Timeout fetching {contextLabel} from {instance.Name}: {ex.Message}");
                return (emptyResult, "timeout");
            }
            catch (Newtonsoft.Json.JsonException ex)
            {
                _logger.Error($"Invalid JSON from {contextLabel} {instance.Name}: {ex.Message}");
                return (emptyResult, "invalid response");
            }
            catch (Exception ex)
            {
                _logger.Error($"Unexpected error fetching {contextLabel} from {instance.Name}: {ex.Message}");
                return (emptyResult, "internal error");
            }
        }

        private static dynamic? SingleItemOrNull(dynamic? data)
        {
            if (data is Newtonsoft.Json.Linq.JArray arr)
                return arr.Count > 0 ? arr[0] : null;
            return data;
        }

        public async Task<ArrFetchOutcome> FetchSeriesInfoFromInstance(ArrInstance instance, int tvdbId, CancellationToken ct)
        {
            var (match, error) = await FetchAndMapAsync<object?>(
                instance,
                $"/api/v3/series?tvdbId={tvdbId}",
                data =>
                {
                    var item = SingleItemOrNull(data);
                    if (item == null) return null;
                    var titleSlug = (string?)item.titleSlug;
                    // Treat empty/missing titleSlug as "no match" rather than returning a record
                    // that would render a broken `/series/null` link on the frontend. The legacy
                    // single-instance endpoint already had this guard; preserve it here.
                    if (string.IsNullOrEmpty(titleSlug)) return null;
                    return new
                    {
                        instanceName = instance.Name,
                        instanceUrl = instance.Url,
                        titleSlug,
                        urlMappings = instance.UrlMappings,
                        episodeFileCount = (int?)item.statistics?.episodeFileCount ?? 0,
                        episodeCount = (int?)item.statistics?.episodeCount ?? 0,
                        percentOfEpisodes = (double?)item.statistics?.percentOfEpisodes ?? 0,
                        sizeOnDisk = (long?)item.statistics?.sizeOnDisk ?? 0,
                        rootFolderPath = GetRootFolderFromPath((string?)item.path)
                    };
                },
                emptyResult: null,
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: $"Sonarr series (TVDB {tvdbId})",
                ct: ct).ConfigureAwait(false);
            return new ArrFetchOutcome { Match = match, Error = error };
        }

        public async Task<ArrFetchOutcome> FetchMovieInfoFromInstance(ArrInstance instance, int tmdbId, CancellationToken ct)
        {
            var (match, error) = await FetchAndMapAsync<object?>(
                instance,
                $"/api/v3/movie?tmdbId={tmdbId}",
                data =>
                {
                    var item = SingleItemOrNull(data);
                    if (item == null) return null;
                    return new
                    {
                        instanceName = instance.Name,
                        instanceUrl = instance.Url,
                        urlMappings = instance.UrlMappings,
                        hasFile = (bool?)item.hasFile ?? false,
                        sizeOnDisk = (long?)item.sizeOnDisk ?? 0,
                        rootFolderPath = GetRootFolderFromPath((string?)item.path)
                    };
                },
                emptyResult: null,
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: $"Radarr movie (TMDB {tmdbId})",
                ct: ct).ConfigureAwait(false);
            return new ArrFetchOutcome { Match = match, Error = error };
        }

        private static string? PosterFromImages(dynamic images)
        {
            if (images == null) return null;
            foreach (var img in images)
            {
                if ((string?)img.coverType == "poster")
                    return (string?)img.remoteUrl ?? (string?)img.url;
            }
            return null;
        }

        public Task<(List<object> Items, string? Error)> FetchSonarrQueue(ArrInstance instance, CancellationToken ct)
        {
            return FetchAndMapAsync<List<object>>(
                instance,
                "/api/v3/queue?includeEpisode=true&includeSeries=true&sortKey=timeleft&sortDirection=ascending&pageSize=1000",
                data =>
                {
                    var items = new List<object>();
                    if (data?.records == null) return items;
                    foreach (var record in data.records)
                    {
                        int? tmdbId = record.series?.tmdbId;

                        items.Add(new
                        {
                            id = (string?)record.id?.ToString(),
                            source = nameof(ArrType.Sonarr),
                            instanceName = instance.Name,
                            title = (string?)record.series?.title ?? "Unknown",
                            subtitle = $"S{record.episode?.seasonNumber:D2}E{record.episode?.episodeNumber:D2} - {record.episode?.title}",
                            seasonNumber = (int?)record.episode?.seasonNumber,
                            episodeNumber = (int?)record.episode?.episodeNumber,
                            status = ResolveQueueStatus((string?)record.status, (string?)record.trackedDownloadState, (string?)record.trackedDownloadStatus),
                            progress = CalculateProgress((double?)record.size, (double?)record.sizeleft),
                            totalSize = (long?)record.size,
                            sizeRemaining = (long?)record.sizeleft,
                            timeRemaining = (string?)record.timeleft,
                            posterUrl = PosterFromImages(record.series?.images),
                            tmdbId = tmdbId
                        });
                    }
                    return items;
                },
                emptyResult: new List<object>(),
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: "Sonarr queue",
                ct: ct);
        }

        public Task<(List<object> Items, string? Error)> FetchRadarrQueue(ArrInstance instance, CancellationToken ct)
        {
            return FetchAndMapAsync<List<object>>(
                instance,
                "/api/v3/queue?includeMovie=true&pageSize=1000",
                data =>
                {
                    var items = new List<object>();
                    if (data?.records == null) return items;
                    foreach (var record in data.records)
                    {
                        int? tmdbId = record.movie?.tmdbId;

                        items.Add(new
                        {
                            id = (string?)record.id?.ToString(),
                            source = nameof(ArrType.Radarr),
                            instanceName = instance.Name,
                            title = (string?)record.movie?.title ?? "Unknown",
                            subtitle = (string?)record.movie?.year?.ToString(),
                            seasonNumber = (int?)null,
                            episodeNumber = (int?)null,
                            status = ResolveQueueStatus((string?)record.status, (string?)record.trackedDownloadState, (string?)record.trackedDownloadStatus),
                            progress = CalculateProgress((double?)record.size, (double?)record.sizeleft),
                            totalSize = (long?)record.size,
                            sizeRemaining = (long?)record.sizeleft,
                            timeRemaining = (string?)record.timeleft,
                            posterUrl = PosterFromImages(record.movie?.images),
                            tmdbId = tmdbId
                        });
                    }
                    return items;
                },
                emptyResult: new List<object>(),
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: "Radarr queue",
                ct: ct);
        }

        private static double CalculateProgress(double? size, double? sizeleft)
        {
            if (size == null || size == 0) return 0;
            if (sizeleft == null) return 100;
            return Math.Round((1 - (sizeleft.Value / size.Value)) * 100, 1);
        }

        /// <summary>
        /// The Sonarr/Radarr queue "status" field (queued/downloading/paused/completed/...)
        /// only describes the transfer, not the import. Once the transfer finishes it sticks
        /// at "completed" even while Sonarr/Radarr is still importing (or stuck waiting for
        /// manual intervention). trackedDownloadState/trackedDownloadStatus carry that finer
        /// signal — this folds them in so the client sees "importing"/"warning"/"failed"
        /// instead of a frozen "completed".
        /// </summary>
        private static string ResolveQueueStatus(string? status, string? trackedDownloadState, string? trackedDownloadStatus)
        {
            if (string.Equals(trackedDownloadStatus, "warning", StringComparison.OrdinalIgnoreCase))
                return "warning";

            switch (trackedDownloadState?.ToLowerInvariant())
            {
                case "importpending":
                case "importing":
                    return "importing";
                case "failedpending":
                case "failed":
                    return "failed";
            }

            return status ?? "Unknown";
        }

        // History is intentionally a bounded window, not a full archive browser — pagination
        // is over this fixed-size merged/sorted pool, not the arr instances' entire history.
        public const int HistoryWindowSize = 200;

        public Task<(List<dynamic> Items, string? Error)> FetchSonarrHistory(ArrInstance instance, CancellationToken ct)
        {
            return FetchAndMapAsync<List<dynamic>>(
                instance,
                $"/api/v3/history?pageSize={HistoryWindowSize}&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true",
                data =>
                {
                    var entries = new List<(string Title, int? Season, int? Episode, string? EpisodeTitle, string EventType, DateTime? Date, string? DownloadId, string? Poster, int? TmdbId)>();
                    if (data?.records == null) return new List<dynamic>();
                    foreach (var record in data.records)
                    {
                        string? eventType = MapHistoryEventType((string?)record.eventType);
                        if (eventType == null) continue;

                        entries.Add((
                            (string?)record.series?.title ?? "Unknown",
                            (int?)record.episode?.seasonNumber,
                            (int?)record.episode?.episodeNumber,
                            (string?)record.episode?.title,
                            eventType,
                            (DateTime?)record.date,
                            (string?)record.downloadId,
                            PosterFromImages(record.series?.images),
                            (int?)record.series?.tmdbId
                        ));
                    }

                    // Sonarr emits one history record per episode, even for a single season-pack
                    // grab — group them back into one card by the shared downloadId so a partial
                    // import (some episodes imported, some failed) reads as one event, not N.
                    var items = new List<dynamic>();
                    var groups = entries
                        .Select((e, idx) => new { Entry = e, Key = string.IsNullOrEmpty(e.DownloadId) ? $"__single_{idx}" : e.DownloadId! })
                        .GroupBy(x => x.Key, x => x.Entry);

                    foreach (var group in groups)
                    {
                        var groupEntries = group.ToList();
                        var first = groupEntries[0];

                        if (groupEntries.Count == 1)
                        {
                            items.Add(new
                            {
                                source = nameof(ArrType.Sonarr),
                                instanceName = instance.Name,
                                title = first.Title,
                                subtitle = $"S{first.Season:D2}E{first.Episode:D2} - {first.EpisodeTitle}",
                                eventType = first.EventType,
                                date = first.Date,
                                posterUrl = first.Poster,
                                tmdbId = first.TmdbId
                            });
                            continue;
                        }

                        var importedCount = groupEntries.Count(e => e.EventType == "imported");
                        var failedCount = groupEntries.Count(e => e.EventType == "failed");
                        var episodeNumbers = groupEntries.Where(e => e.Episode.HasValue).Select(e => e.Episode!.Value).OrderBy(n => n).ToList();
                        var groupDate = groupEntries.Where(e => e.Date.HasValue).Select(e => e.Date!.Value).DefaultIfEmpty(DateTime.MinValue).Max();

                        items.Add(new
                        {
                            source = nameof(ArrType.Sonarr),
                            instanceName = instance.Name,
                            title = first.Title,
                            subtitle = episodeNumbers.Count > 0
                                ? $"S{first.Season:D2} · E{episodeNumbers[0]:D2}-E{episodeNumbers[^1]:D2}"
                                : $"S{first.Season:D2}",
                            eventType = importedCount > 0 && failedCount > 0 ? "partial" : (failedCount > 0 ? "failed" : "imported"),
                            date = (DateTime?)groupDate,
                            posterUrl = first.Poster,
                            tmdbId = first.TmdbId,
                            episodeCount = groupEntries.Count,
                            importedCount = importedCount,
                            failedCount = failedCount
                        });
                    }
                    return items;
                },
                emptyResult: new List<dynamic>(),
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: "Sonarr history",
                ct: ct);
        }

        public Task<(List<dynamic> Items, string? Error)> FetchRadarrHistory(ArrInstance instance, CancellationToken ct)
        {
            return FetchAndMapAsync<List<dynamic>>(
                instance,
                $"/api/v3/history?pageSize={HistoryWindowSize}&sortKey=date&sortDirection=descending&includeMovie=true",
                data =>
                {
                    var items = new List<dynamic>();
                    if (data?.records == null) return items;
                    foreach (var record in data.records)
                    {
                        string? eventType = MapHistoryEventType((string?)record.eventType);
                        if (eventType == null) continue;

                        items.Add(new
                        {
                            source = nameof(ArrType.Radarr),
                            instanceName = instance.Name,
                            title = (string?)record.movie?.title ?? "Unknown",
                            subtitle = (string?)record.movie?.year?.ToString(),
                            eventType = eventType,
                            date = (DateTime?)record.date,
                            posterUrl = PosterFromImages(record.movie?.images),
                            tmdbId = (int?)record.movie?.tmdbId
                        });
                    }
                    return items;
                },
                emptyResult: new List<dynamic>(),
                timeout: TimeSpan.FromSeconds(10),
                contextLabel: "Radarr history",
                ct: ct);
        }

        /// <summary>
        /// Only the two terminal, user-relevant history events are surfaced — everything else
        /// (grabbed, renamed, deleted, ignored, ...) is noise for a "recently downloaded" list.
        /// </summary>
        private static string? MapHistoryEventType(string? eventType)
        {
            return eventType?.ToLowerInvariant() switch
            {
                "downloadfolderimported" => "imported",
                "downloadfailed" => "failed",
                _ => null,
            };
        }

        public Task<(List<ArrItem> Items, string? Error)> FetchSonarrCalendar(
            ArrInstance instance, string startIso, string endIso,
            Func<object?, DateTime?> parseDate, CancellationToken ct)
        {
            return FetchAndMapAsync<List<ArrItem>>(
                instance,
                $"/api/v3/calendar?includeSeries=true&unmonitored=true&start={startIso}&end={endIso}",
                data =>
                {
                    var items = new List<ArrItem>();
                    if (data == null) return items;
                    foreach (var episode in data)
                    {
                        var airDate = parseDate((string?)episode.airDateUtc ?? (string?)episode.airDate);
                        if (!airDate.HasValue) continue;

                        string? seriesPosterUrl = null;
                        string? seriesBackdropUrl = null;
                        if (episode.series?.images != null)
                        {
                            foreach (var img in episode.series.images)
                            {
                                var coverType = (string?)img.coverType;
                                var imageUrl = (string?)img.remoteUrl ?? (string?)img.url;
                                if (string.IsNullOrWhiteSpace(imageUrl)) continue;
                                if (seriesBackdropUrl == null && (coverType == "fanart" || coverType == "banner"))
                                    seriesBackdropUrl = imageUrl;
                                else if (seriesPosterUrl == null && coverType == "poster")
                                    seriesPosterUrl = imageUrl;
                            }
                        }

                        var seasonNumber = (int?)episode.seasonNumber ?? 0;
                        var episodeNumber = (int?)episode.episodeNumber ?? 0;
                        var episodeTitle = (string?)episode.title ?? "Unknown Episode";

                        items.Add(new ArrItem
                        {
                            Id = (string?)episode.id?.ToString(),
                            Source = nameof(ArrType.Sonarr),
                            InstanceName = instance.Name,
                            Type = "Series",
                            Title = (string?)episode.series?.title ?? "Unknown Series",
                            Subtitle = $"S{seasonNumber:D2}E{episodeNumber:D2} - {episodeTitle}",
                            ReleaseDate = airDate.Value.ToUniversalTime().ToString("o"),
                            ReleaseType = "Episode",
                            HasFile = (bool?)episode.hasFile ?? false,
                            Monitored = (bool?)episode.monitored ?? false,
                            SeriesId = (int?)episode.seriesId,
                            SeasonNumber = seasonNumber,
                            EpisodeNumber = episodeNumber,
                            EpisodeTitle = episodeTitle,
                            Overview = (string?)episode.overview,
                            TvdbId = (int?)episode.series?.tvdbId,
                            ImdbId = (string?)episode.series?.imdbId,
                            TmdbId = (int?)episode.series?.tmdbId,
                            PosterUrl = seriesPosterUrl,
                            BackdropUrl = seriesBackdropUrl,
                            EpisodeTvdbId = (int?)episode.tvdbId,
                            EpisodeImdbId = (string?)episode.imdbId,
                            RootFolderPath = GetRootFolderFromPath((string?)episode.series?.path)
                        });
                    }
                    return items;
                },
                emptyResult: new List<ArrItem>(),
                // aligned with Radarr (15s) — was 30s, which doubled
                // the worst-case calendar latency under one slow instance.
                timeout: TimeSpan.FromSeconds(15),
                contextLabel: "Sonarr calendar",
                ct: ct);
        }

        public Task<(List<ArrItem> Items, string? Error)> FetchRadarrCalendar(
            ArrInstance instance, string startIso, string endIso,
            DateTime startDate, DateTime endDate,
            Func<object?, DateTime?> parseDate,
            Action<Dictionary<string, DateTime>, string, object?> addRelease,
            CancellationToken ct)
        {
            return FetchAndMapAsync<List<ArrItem>>(
                instance,
                $"/api/v3/calendar?unmonitored=true&start={startIso}&end={endIso}",
                data =>
                {
                    var items = new List<ArrItem>();
                    if (data == null) return items;
                    foreach (var movie in data)
                    {
                        var releaseDates = new Dictionary<string, DateTime>(StringComparer.OrdinalIgnoreCase);

                        string? posterUrl = null;
                        string? backdropUrl = null;
                        if (movie.images != null)
                        {
                            foreach (var img in movie.images)
                            {
                                var coverType = (string?)img.coverType;
                                var imageUrl = (string?)img.remoteUrl ?? (string?)img.url;
                                if (string.IsNullOrWhiteSpace(imageUrl)) continue;
                                if (posterUrl == null && coverType == "poster") { posterUrl = imageUrl; continue; }
                                if (backdropUrl == null && (coverType == "fanart" || coverType == "backdrop"))
                                    backdropUrl = imageUrl;
                            }
                        }

                        addRelease(releaseDates, "CinemaRelease", (string?)movie.inCinemas);
                        addRelease(releaseDates, "PhysicalRelease", (string?)movie.physicalRelease);
                        addRelease(releaseDates, "DigitalRelease", (string?)movie.digitalRelease);

                        if (movie.releases != null)
                        {
                            foreach (var release in movie.releases)
                            {
                                var releaseDate = (object?)release.releaseDate ?? release.date;
                                var type = Convert.ToString(release.type)?.ToLowerInvariant();
                                var isPhysical = (bool?)release.isPhysical ?? false;
                                if (isPhysical) addRelease(releaseDates, "PhysicalRelease", releaseDate);
                                else if (type == "digital") addRelease(releaseDates, "DigitalRelease", releaseDate);
                                else if (type == "theatrical" || type == "cinema" || type == "theater")
                                    addRelease(releaseDates, "CinemaRelease", releaseDate);
                            }
                        }

                        if (releaseDates.Count == 0) continue;

                        var movieTitle = (string?)movie.title ?? (string?)movie.originalTitle ?? "Unknown";
                        string? movieYear = null;
                        var yearValue = (object?)movie.year;
                        if (yearValue != null) movieYear = Convert.ToString(yearValue);

                        foreach (var kvp in releaseDates)
                        {
                            var releaseUtc = kvp.Value.ToUniversalTime();
                            if (releaseUtc < startDate || releaseUtc > endDate) continue;
                            items.Add(new ArrItem
                            {
                                Id = $"{movie.id}-{kvp.Key}",
                                Source = nameof(ArrType.Radarr),
                                InstanceName = instance.Name,
                                Type = "Movie",
                                Title = movieTitle,
                                Subtitle = movieYear,
                                ReleaseDate = releaseUtc.ToString("o"),
                                ReleaseType = kvp.Key,
                                HasFile = (bool?)movie.hasFile ?? false,
                                Monitored = (bool?)movie.monitored ?? false,
                                PosterUrl = posterUrl,
                                BackdropUrl = backdropUrl,
                                TmdbId = (int?)movie.tmdbId,
                                ImdbId = (string?)movie.imdbId,
                                RootFolderPath = GetRootFolderFromPath((string?)movie.path)
                            });
                        }
                    }
                    return items;
                },
                emptyResult: new List<ArrItem>(),
                // aligned with Sonarr (15s) — was 10s, which timed
                // out busy Radarr instances behind slow proxies.
                timeout: TimeSpan.FromSeconds(15),
                contextLabel: "Radarr calendar",
                ct: ct);
        }

        public Task<(List<ArrItem> Items, string? Error)> FetchShokoCalendar(
            ArrInstance instance, DateTime startDate, DateTime endDate,
            HashSet<string> includedTypes, Func<object?, DateTime?> parseDate, CancellationToken ct)
        {
            var startParam = startDate.ToString("yyyy-MM-dd");
            var endParam = endDate.ToString("yyyy-MM-dd");
            return FetchAndMapAsync<List<ArrItem>>(
                instance,
                $"/api/v3/Dashboard/CalendarEpisodes?startDate={startParam}&endDate={endParam}&includeMissing=false&includeRestricted=false",
                data =>
                {
                    var items = new List<ArrItem>();
                    if (data == null) return items;
                    foreach (var episode in data)
                    {
                        // Which AniDB episode types to show is admin-configurable (Shoko settings).
                        var episodeType = (string?)episode.Type;
                        if (episodeType == null || !includedTypes.Contains(episodeType)) continue;

                        var airDate = parseDate((string?)episode.AirDate);
                        if (!airDate.HasValue) continue;

                        int? shokoSeriesId = episode.IDs?.ShokoSeries;
                        int? shokoEpisodeId = episode.IDs?.ShokoEpisode;
                        int? shokoFileId = episode.IDs?.ShokoFile;
                        var seriesTitle = (string?)episode.SeriesTitle ?? "Unknown Series";
                        var episodeTitle = (string?)episode.Title ?? "Unknown Episode";
                        var episodeNumber = (int?)episode.Number ?? 0;

                        items.Add(new ArrItem
                        {
                            Id = shokoEpisodeId?.ToString() ?? $"shoko-{shokoSeriesId}-{episodeType}-{episodeNumber}",
                            Source = nameof(ArrType.Shoko),
                            InstanceName = "Shoko",
                            Type = "Series",
                            Title = seriesTitle,
                            EpisodeTitle = episodeTitle,
                            Subtitle = $"{episodeType} {episodeNumber} - {episodeTitle}",
                            ReleaseDate = airDate.Value.ToUniversalTime().ToString("o"),
                            ReleaseType = "Anime",
                            HasFile = shokoFileId.HasValue,
                            Monitored = true,
                            SeasonNumber = null,
                            EpisodeNumber = episodeNumber,
                            ShokoSeriesId = shokoSeriesId,
                            ShokoEpisodeId = shokoEpisodeId,
                            RootFolderPath = null
                        });
                    }
                    return items;
                },
                emptyResult: new List<ArrItem>(),
                timeout: TimeSpan.FromSeconds(15),
                contextLabel: "Shoko calendar",
                authHeaderName: "apikey",
                ct: ct);
        }

        private static string? GetRootFolderFromPath(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return null;

            var trimmed = path.TrimEnd('/');
            var lastSlash = trimmed.LastIndexOf('/');
            if (lastSlash <= 0)
                return trimmed;

            return trimmed.Substring(0, lastSlash);
        }
    }
}
