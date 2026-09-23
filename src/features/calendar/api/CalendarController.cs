using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Model.Arr;
using Jellyfin.Plugin.JellyfinEnhanced.Extensions;
using Jellyfin.Database.Implementations;
using Microsoft.EntityFrameworkCore;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Api;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class CalendarController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly IUserDataManager _userDataManager;
        private readonly ILibraryManager _libraryManager;
        private readonly IDbContextFactory<JellyfinDbContext> _dbContextFactory;
        private readonly ArrApiClient _arrClient;
        private readonly OutboundApiPolicy _outboundPolicy;

        public CalendarController(
            Logger logger,
            IUserManager userManager,
            IUserDataManager userDataManager,
            ILibraryManager libraryManager,
            IDbContextFactory<JellyfinDbContext> dbContextFactory,
            ArrApiClient arrClient,
            OutboundApiPolicy outboundPolicy) : base(userManager)
        {
            _logger = logger;
            _userDataManager = userDataManager;
            _libraryManager = libraryManager;
            _dbContextFactory = dbContextFactory;
            _arrClient = arrClient;
            _outboundPolicy = outboundPolicy;
        }

        [HttpGet("arr/calendar")]
        [Authorize]
        public async Task<IActionResult> GetCalendarEvents()
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
                return StatusCode(500, "Plugin configuration not available");

            var events = new List<ArrItem>();

            var todayUtc = DateTime.UtcNow.Date;
            DateTime startDate = todayUtc;
            DateTime endDate = todayUtc.AddDays(90);

            if (Request.Query.TryGetValue("start", out var startValues))
            {
                if (DateTime.TryParse(startValues.ToString(), out var parsedStart))
                {
                    startDate = parsedStart.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(parsedStart, DateTimeKind.Utc) : parsedStart.ToUniversalTime();
                }
            }

            if (Request.Query.TryGetValue("end", out var endValues))
            {
                if (DateTime.TryParse(endValues.ToString(), out var parsedEnd))
                {
                    endDate = parsedEnd.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(parsedEnd, DateTimeKind.Utc) : parsedEnd.ToUniversalTime();
                }
            }

            if (endDate < startDate)
            {
                (startDate, endDate) = (endDate, startDate);
            }

            // cap the requested range to prevent an authed
            // user from passing start=1900..end=2099 and triggering 200 years
            // worth of arr-side calendar fetches + dedup loops.
            const int maxCalendarRangeDays = 365;
            var requestedRange = (endDate - startDate).TotalDays;
            if (requestedRange > maxCalendarRangeDays)
            {
                _logger.Info($"Calendar range capped from {(int)requestedRange} days to {maxCalendarRangeDays} days.");
                endDate = startDate.AddDays(maxCalendarRangeDays);
            }

            var startIso = startDate.ToUniversalTime().ToString("o");
            var endIso = endDate.ToUniversalTime().ToString("o");

            DateTime? ParseDate(object? value)
            {
                if (value == null)
                {
                    return null;
                }

                if (value is DateTime dateTimeValue)
                {
                    return dateTimeValue.Kind == DateTimeKind.Unspecified
                        ? DateTime.SpecifyKind(dateTimeValue, DateTimeKind.Utc)
                        : dateTimeValue;
                }

                var asString = Convert.ToString(value);
                if (string.IsNullOrWhiteSpace(asString))
                {
                    return null;
                }

                // Try parsing with invariant culture and assume UTC to avoid local timezone interpretation
                if (DateTime.TryParse(asString, System.Globalization.CultureInfo.InvariantCulture,
                    System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                    out var parsed))
                {
                    return parsed;
                }

                // Fallback to regular parsing if above fails
                if (DateTime.TryParse(asString, out parsed))
                {
                    if (parsed.Kind == DateTimeKind.Unspecified)
                    {
                        parsed = DateTime.SpecifyKind(parsed, DateTimeKind.Utc);
                    }
                    return parsed;
                }

                return null;
            }

            void AddRelease(Dictionary<string, DateTime> releases, string type, object? value)
            {
                var parsed = ParseDate(value);
                if (!parsed.HasValue)
                {
                    return;
                }

                if (!releases.TryGetValue(type, out var existing) || parsed.Value < existing)
                {
                    releases[type] = parsed.Value;
                }
            }

            // Fetch calendar events from all configured instances in parallel
            _outboundPolicy.WarnIfArrInstancesCorrupt(config);
            var sonarrInstances = config.GetEnabledSonarrInstances();
            var radarrInstances = config.GetEnabledRadarrInstances();
            var ct = HttpContext.RequestAborted;

            var sonarrTasks = sonarrInstances.Select(i => _arrClient.FetchSonarrCalendar(i, startIso, endIso, ParseDate, ct)).ToList();
            var radarrTasks = radarrInstances.Select(i => _arrClient.FetchRadarrCalendar(i, startIso, endIso, startDate, endDate, ParseDate, AddRelease, ct)).ToList();

            // Shoko is single-instance (flat ShokoUrl/ShokoApiKey fields, no JSON instance list),
            // so it fans out alongside sonarrTasks/radarrTasks as at most one extra task rather
            // than a per-instance collection. Partial config (only one of URL/key set) surfaces
            // an error without attempting a fetch; both empty means Shoko isn't in use at all —
            // same as zero Sonarr/Radarr instances — and produces no error.
            var shokoUrlSet = !string.IsNullOrWhiteSpace(config.ShokoUrl);
            var shokoKeySet = !string.IsNullOrWhiteSpace(config.ShokoApiKey);
            string? shokoConfigError = (shokoUrlSet != shokoKeySet)
                ? "Shoko URL and API key must both be set"
                : null;
            // Admin-configurable set of AniDB episode types shown on the calendar (Shoko settings).
            var shokoIncludedTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (config.ShokoShowEpisodes) shokoIncludedTypes.Add("Episode");
            if (config.ShokoShowSpecials) shokoIncludedTypes.Add("Special");
            if (config.ShokoShowCredits) shokoIncludedTypes.Add("Credits");
            if (config.ShokoShowTrailers) shokoIncludedTypes.Add("Trailer");
            if (config.ShokoShowParodies) shokoIncludedTypes.Add("Parody");
            if (config.ShokoShowOther) shokoIncludedTypes.Add("Other");

            Task<(List<ArrItem> Items, string? Error)>? shokoTask = config.IsShokoConfigured()
                ? _arrClient.FetchShokoCalendar(
                    new ArrInstance { Name = "Shoko", Url = config.ShokoUrl, ApiKey = config.ShokoApiKey, UrlMappings = config.ShokoUrlMappings ?? "" },
                    startDate, endDate, shokoIncludedTypes, ParseDate, ct)
                : null;

            var sonarrCalResults = await Task.WhenAll(sonarrTasks);
            var radarrCalResults = await Task.WhenAll(radarrTasks);
            var shokoCalResult = shokoTask != null ? await shokoTask : (Items: new List<ArrItem>(), Error: null);

            var errors = new List<object>();
            if (config.IsSonarrInstancesCorrupt())
                errors.Add(new { instanceName = "Sonarr", source = "Sonarr", reason = "config corrupt — see server logs" });
            else if (sonarrInstances.Count == 0 && config.GetSonarrInstances().Count > 0)
                errors.Add(new { instanceName = "Sonarr", source = "Sonarr", reason = "all Sonarr instances are disabled" });
            if (config.IsRadarrInstancesCorrupt())
                errors.Add(new { instanceName = "Radarr", source = "Radarr", reason = "config corrupt — see server logs" });
            else if (radarrInstances.Count == 0 && config.GetRadarrInstances().Count > 0)
                errors.Add(new { instanceName = "Radarr", source = "Radarr", reason = "all Radarr instances are disabled" });
            for (int i = 0; i < sonarrCalResults.Length; i++)
            {
                events.AddRange(sonarrCalResults[i].Items);
                if (sonarrCalResults[i].Error != null)
                    errors.Add(new { instanceName = sonarrInstances[i].Name, source = "Sonarr", reason = sonarrCalResults[i].Error });
            }
            for (int i = 0; i < radarrCalResults.Length; i++)
            {
                events.AddRange(radarrCalResults[i].Items);
                if (radarrCalResults[i].Error != null)
                    errors.Add(new { instanceName = radarrInstances[i].Name, source = "Radarr", reason = radarrCalResults[i].Error });
            }
            if (shokoConfigError != null)
                errors.Add(new { instanceName = "Shoko", source = "Shoko", reason = shokoConfigError });
            events.AddRange(shokoCalResult.Items);
            if (shokoCalResult.Error != null)
                errors.Add(new { instanceName = "Shoko", source = "Shoko", reason = shokoCalResult.Error });

            // Resolve ItemIds against Jellyfin's library BEFORE dedup so the dedup tie-breaker can
            // prefer candidates that the current user can actually access (H4). Without this, dedup
            // might pick an instance-B candidate with HasFile=true in a root folder the user can't
            // read, and then the subsequent access filter would hide the event entirely — even
            // though instance-A had the same episode in an accessible root folder.
            var providerKeys = events
                .SelectMany(ProviderHelper.GetAllProviders)
                .Distinct()
                .ToList();

            var itemMap = await _dbContextFactory.GetItemIdsByProvidersBatchAsync(providerKeys, _libraryManager);

            foreach (var evt in events)
            {
                evt.ItemId = ProviderHelper.GetBestItemId(ProviderHelper.GetProviders(evt), itemMap);
                evt.ItemEpisodeId = ProviderHelper.GetBestItemId(ProviderHelper.GetEpisodeProviders(evt), itemMap);
            }

            // Build access info now so the dedup step can consult it.
            HashSet<Guid>? accessibleIds = null;
            Dictionary<string, bool>? rootFolderAccessMap = null;
            if (config.CalendarFilterByLibraryAccess)
            {
                var calendarUserId = UserHelper.GetCurrentUserId(User);
                if (calendarUserId.HasValue)
                {
                    var calendarUserForFilter = _userManager.GetUserById(calendarUserId.Value);
                    if (calendarUserForFilter != null)
                    {
                        var uniqueItemIds = events
                            .Select(e => e.ItemId)
                            .Where(id => id.HasValue)
                            .Select(id => id!.Value)
                            .Distinct()
                            .ToList();

                        accessibleIds = new HashSet<Guid>();
                        foreach (var id in uniqueItemIds)
                        {
                            if (_libraryManager.GetItemById<BaseItem>(id, calendarUserForFilter) != null)
                                accessibleIds.Add(id);
                        }

                        rootFolderAccessMap = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
                        foreach (var evt in events.Where(e => e.ItemId.HasValue && !string.IsNullOrEmpty(e.RootFolderPath)))
                        {
                            var isAccessible = accessibleIds.Contains(evt.ItemId!.Value);
                            if (isAccessible || !rootFolderAccessMap.ContainsKey(evt.RootFolderPath!))
                                rootFolderAccessMap[evt.RootFolderPath!] = isAccessible;
                        }
                    }
                }
            }

            // Returns true when the filter is off, or when we have positive evidence the user can
            // access this event. "No information" defaults to true (same as the final filter).
            bool IsAccessible(ArrItem evt)
            {
                if (accessibleIds == null) return true;
                if (evt.ItemId.HasValue)
                    return accessibleIds.Contains(evt.ItemId.Value);
                if (!string.IsNullOrEmpty(evt.RootFolderPath)
                    && rootFolderAccessMap != null
                    && rootFolderAccessMap.TryGetValue(evt.RootFolderPath, out var a))
                    return a;
                return true;
            }

            // Deduplicate events across instances. Tie-break priority:
            //   1. Accessible to the current user (prevents H4 hide-accessible-event bug).
            //   2. HasFile=true (if one instance has the file downloaded, show that).
            // The losing candidate's InstanceName is preserved in AlsoInInstances so the UI
            // can show "also in: X, Y" context instead of silently erasing other instances.
            // normalize ReleaseDate to a calendar-day
            // bucket before using it in the dedup key. Different Sonarr/Radarr
            // versions emit different precision (`...000Z` vs `Z`, airDate vs
            // airDateUtc fallbacks with TZ drift); using the raw string fails
            // dedup and surfaces duplicate events on a per-instance basis.
            static string NormalizeDateForDedup(string? raw)
            {
                if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
                if (DateTimeOffset.TryParse(raw, System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal,
                        out var dto))
                {
                    return dto.UtcDateTime.ToString("yyyy-MM-dd");
                }
                // Fallback: strip everything after the first 10 chars when it
                // already looks like an ISO date prefix.
                return raw.Length >= 10 ? raw.Substring(0, 10) : raw;
            }

            var deduped = new Dictionary<string, ArrItem>();
            foreach (var evt in events)
            {
                string dedupeKey;
                var normalizedDate = NormalizeDateForDedup(evt.ReleaseDate);
                if (evt.Source == nameof(ArrType.Sonarr))
                {
                    var seriesKey = evt.TvdbId?.ToString() ?? $"title:{evt.Title}";
                    dedupeKey = $"sonarr|{seriesKey}|S{evt.SeasonNumber}E{evt.EpisodeNumber}|{normalizedDate}";
                }
                else if (evt.Source == nameof(ArrType.Shoko))
                {
                    // Never cross-matched against sonarr|/radarr| keys.
                    dedupeKey = $"shoko|{evt.ShokoSeriesId}|{evt.ShokoEpisodeId}|{normalizedDate}";
                }
                else
                {
                    var movieKey = evt.TmdbId?.ToString() ?? $"title:{evt.Title}";
                    dedupeKey = $"radarr|{movieKey}|{evt.ReleaseType}|{normalizedDate}";
                }

                if (!deduped.TryGetValue(dedupeKey, out var existing))
                {
                    deduped[dedupeKey] = evt;
                    continue;
                }

                var existingAccess = IsAccessible(existing);
                var newAccess = IsAccessible(evt);
                ArrItem winner, loser;
                if (newAccess && !existingAccess)
                {
                    winner = evt; loser = existing;
                }
                else if (newAccess == existingAccess && !existing.HasFile && evt.HasFile)
                {
                    winner = evt; loser = existing;
                }
                else
                {
                    winner = existing; loser = evt;
                }

                if (!ReferenceEquals(winner, existing))
                {
                    deduped[dedupeKey] = winner;
                }

                // Merge loser's instance name into winner's AlsoInInstances (dedup & skip self).
                if (!string.IsNullOrEmpty(loser.InstanceName)
                    && !string.Equals(loser.InstanceName, winner.InstanceName, StringComparison.Ordinal))
                {
                    winner.AlsoInInstances ??= new List<string>();
                    if (!winner.AlsoInInstances.Contains(loser.InstanceName))
                        winner.AlsoInInstances.Add(loser.InstanceName);
                }
                // Preserve loser's own AlsoInInstances entries too.
                if (loser.AlsoInInstances != null)
                {
                    winner.AlsoInInstances ??= new List<string>();
                    foreach (var name in loser.AlsoInInstances)
                    {
                        if (!string.Equals(name, winner.InstanceName, StringComparison.Ordinal)
                            && !winner.AlsoInInstances.Contains(name))
                            winner.AlsoInInstances.Add(name);
                    }
                }
            }
            events = deduped.Values.ToList();

            // Final safety-net access filter (defense in depth — dedup above already respects this,
            // but if the filter is on and a lone candidate is inaccessible, it must still be hidden).
            if (config.CalendarFilterByLibraryAccess && accessibleIds != null)
            {
                events = events.Where(e =>
                {
                    if (e.ItemId.HasValue)
                        return accessibleIds.Contains(e.ItemId.Value);
                    if (!string.IsNullOrEmpty(e.RootFolderPath)
                        && rootFolderAccessMap != null
                        && rootFolderAccessMap.TryGetValue(e.RootFolderPath, out var hasAccess))
                        return hasAccess;
                    return true;
                }).ToList();
            }

            return Ok(new { events, errors });
        }

        [HttpPost("arr/calendar/user-data")]
        [Authorize]
        public IActionResult GetCalendarUserDataForEvents([FromBody] CalendarUserDataRequest request)
        {
            var userId = UserHelper.GetCurrentUserId(User);
            if (userId == null)
                return Unauthorized("User not found");

            var user = _userManager.GetUserById(userId.Value);
            if (user == null)
                return Unauthorized("User not found");

            var results = new List<object>();

            try
            {
                if (request?.Events == null || request.Events.Count == 0)
                    return Ok(new { results });

                var ids = request.Events
                    .SelectMany(e => new Guid?[] { e.ItemId, e.ItemEpisodeId })
                    .Where(id => id.HasValue)
                    .Select(id => id!.Value)
                    .Distinct()
                    .ToList();

                var itemsById = new Dictionary<Guid, BaseItem>();
                if (ids.Count > 0)
                {
                    var items = _libraryManager.GetItemList(new InternalItemsQuery
                    {
                        User = user,
                        ItemIds = ids.ToArray(),
                        Recursive = true
                    });

                    foreach (var item in items)
                    {
                        if (!itemsById.ContainsKey(item.Id))
                            itemsById[item.Id] = item;
                    }
                }

                // Process each event using pre-fetched items
                foreach (var evt in request.Events)
                {
                    bool isFavorite = false;
                    bool isWatched = false;

                    BaseItem? item = null;
                    BaseItem? episodeItem = null;

                    if (evt.ItemId.HasValue)
                        itemsById.TryGetValue(evt.ItemId.Value, out item);
                    if (evt.ItemEpisodeId.HasValue)
                        itemsById.TryGetValue(evt.ItemEpisodeId.Value, out episodeItem);

                    if (item != null)
                    {
                        var itemData = _userDataManager.GetUserData(user, item);
                        isFavorite = itemData?.Likes == true;

                        if (evt.Type == "Movie")
                        {
                            isWatched = itemData?.Played == true || (itemData?.PlaybackPositionTicks ?? 0) > 0;
                        }
                    }

                    if (evt.Type == "Series" && episodeItem != null)
                    {
                        var epData = _userDataManager.GetUserData(user, episodeItem);
                        isWatched = epData?.Played == true || (epData?.PlaybackPositionTicks ?? 0) > 0;
                    }

                    results.Add(new
                    {
                        id = evt.Id,
                        isFavorite,
                        isWatched
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"Failed to get calendar user data: {ex.Message}");
            }

            return Ok(new { results });
        }

        public class CalendarUserDataRequest
        {
            public List<CalendarEventInfo> Events { get; set; } = new();
        }

        public class CalendarEventInfo
        {
            public string? Id { get; set; }
            public string? Type { get; set; }
            public string? Title { get; set; }
            public Guid? ItemId { get; set; }
            public Guid? ItemEpisodeId { get; set; }
            public int? TvdbId { get; set; }
            public string? ImdbId { get; set; }
            public int? TmdbId { get; set; }
            public int? SeasonNumber { get; set; }
            public int? EpisodeNumber { get; set; }
        }
    }
}
