// Adapted from Jellyfin Canopy's GPL-3.0 parental filter at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f. Enhanced-specific adaptations:
// bounded local metadata cache, automatic config generations, issue routes,
// strict failure handling, and operation without Seerr when TMDB is available.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Globalization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Jellyseerr
{
    /// <summary>Server-side parental enforcement for all title-bearing Seerr surfaces.</summary>
    public sealed class SeerrParentalFilter : ISeerrParentalFilter
    {
        private const int MaximumCacheEntries = 4096;
        private const int MaximumConcurrentFetches = 20;
        private const int MaximumCacheTtlMinutes = 10080;
        private static readonly TimeSpan OverallBudget = TimeSpan.FromSeconds(12);
        private static readonly TimeSpan PerFetchTimeout = TimeSpan.FromSeconds(8);

        private readonly IHttpClientFactory _httpClientFactory;
        private readonly Logger _logger;
        private readonly IUserManager _userManager;
        private readonly ILocalizationManager _localization;
        private readonly Func<PluginConfiguration?> _configurationAccessor;
        private readonly ConcurrentDictionary<string, CacheEntry> _metadataCache = new(StringComparer.Ordinal);
        private readonly ConcurrentDictionary<string, Lazy<Task<TitleSignature?>>> _inFlight = new(StringComparer.Ordinal);
        private readonly SemaphoreSlim _globalFetchThrottle = new(MaximumConcurrentFetches, MaximumConcurrentFetches);
        private readonly object _cacheLock = new();
        private readonly object _generationLock = new();
        private long _configurationGeneration = 1;
        private long _cacheSequence;
        private string? _observedConfigurationFingerprint;

        public SeerrParentalFilter(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            ILocalizationManager localization)
            : this(
                httpClientFactory,
                logger,
                userManager,
                localization,
                () => JellyfinEnhanced.Instance?.Configuration)
        {
        }

        internal SeerrParentalFilter(
            IHttpClientFactory httpClientFactory,
            Logger logger,
            IUserManager userManager,
            ILocalizationManager localization,
            Func<PluginConfiguration?> configurationAccessor)
        {
            _httpClientFactory = httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
            _userManager = userManager ?? throw new ArgumentNullException(nameof(userManager));
            _localization = localization ?? throw new ArgumentNullException(nameof(localization));
            _configurationAccessor = configurationAccessor ?? throw new ArgumentNullException(nameof(configurationAccessor));
        }

        private readonly record struct TitleSignature(
            int? Score,
            int? SubScore,
            string[]? Keywords,
            string[]? Genres,
            bool? Adult);

        private readonly record struct CacheEntry(TitleSignature Signature, DateTime ExpiresAtUtc, long Sequence);

        private readonly record struct ConfigurationSnapshot(
            bool FeatureEnabled,
            bool RespectTags,
            bool SeerrEnabled,
            string[] SeerrUrls,
            string SeerrApiKey,
            string TmdbApiKey,
            string Region,
            TimeSpan CacheTtl,
            string SourceIdentity,
            string Fingerprint);

        private readonly record struct PolicySnapshot(
            int? MaxScore,
            int? MaxSubScore,
            IReadOnlyCollection<UnratedItem> BlockUnrated,
            IReadOnlyCollection<string> BlockedTags,
            IReadOnlyCollection<string> AllowedTags)
        {
            internal bool HasTagRules => BlockedTags.Count > 0 || AllowedTags.Count > 0;

            internal bool HasRestrictions
                => MaxScore is not null
                    || BlockUnrated.Contains(UnratedItem.Movie)
                    || BlockUnrated.Contains(UnratedItem.Series)
                    || HasTagRules;
        }

        private readonly record struct GateContext(
            PolicySnapshot Policy,
            ConfigurationSnapshot Configuration,
            long Generation);

        private enum GateResolutionKind
        {
            NotApplicable,
            Active,
            Failed,
        }

        private readonly record struct GateResolution(GateResolutionKind Kind, GateContext Gate);

        private enum EndpointCategory
        {
            None,
            Deny,
            List,
            ListOrNestedDetail,
            DirectDetail,
            NestedDetail,
            ParentSubresource,
        }

        private enum ListContainer
        {
            Results,
            Parts,
            CombinedCredits,
        }

        private sealed record EndpointPlan
        {
            internal EndpointCategory Category { get; init; }

            internal ListContainer Container { get; init; }

            internal string IdField { get; init; } = "id";

            internal string? MediaTypeHint { get; init; }

            internal bool NestedMedia { get; init; }

            internal bool RequireTitle { get; init; }

            internal string? ParentMediaType { get; init; }

            internal int ParentTmdbId { get; init; }

            internal int ExpectedEntityId { get; init; }
        }

        private enum ItemKind
        {
            Unknown,
            NonTitle,
            Movie,
            Tv,
        }

        public async Task<SeerrParentalResult> ApplyAsync(string json, string apiPath, SeerrCaller caller)
        {
            try
            {
                var resolution = ResolveGate(caller);
                if (resolution.Kind == GateResolutionKind.NotApplicable)
                {
                    return new SeerrParentalResult(false, json);
                }

                if (resolution.Kind == GateResolutionKind.Failed)
                {
                    return new SeerrParentalResult(false, string.Empty, Succeeded: false);
                }

                var gate = resolution.Gate;
                var plan = ClassifyPath(apiPath);
                switch (plan.Category)
                {
                    case EndpointCategory.None:
                        return new SeerrParentalResult(false, json);
                    case EndpointCategory.Deny:
                        return new SeerrParentalResult(true, string.Empty);
                    case EndpointCategory.DirectDetail:
                        return EvaluateDirectDetail(json, plan, gate);
                    case EndpointCategory.NestedDetail:
                        return await EvaluateNestedDetailAsync(json, plan, gate).ConfigureAwait(false);
                    case EndpointCategory.ParentSubresource:
                        return await IsTitleBlockedAsync(
                            plan.ParentMediaType!,
                            plan.ParentTmdbId,
                            gate).ConfigureAwait(false)
                                ? new SeerrParentalResult(true, string.Empty)
                                : new SeerrParentalResult(false, json);
                    case EndpointCategory.ListOrNestedDetail:
                        return await FilterListOrNestedDetailAsync(json, plan, gate).ConfigureAwait(false);
                    case EndpointCategory.List:
                        if (plan.ParentTmdbId > 0
                            && await IsTitleBlockedAsync(
                                plan.ParentMediaType!,
                                plan.ParentTmdbId,
                                gate).ConfigureAwait(false))
                        {
                            return new SeerrParentalResult(true, string.Empty);
                        }

                        var filtered = await FilterListAsync(json, plan, gate).ConfigureAwait(false);
                        return filtered.Success
                            ? new SeerrParentalResult(false, filtered.Body)
                            : new SeerrParentalResult(false, string.Empty, Succeeded: false);
                    default:
                        return new SeerrParentalResult(false, string.Empty, Succeeded: false);
                }
            }
            catch (Exception ex)
            {
                _logger.Warning($"Seerr parental filtering failed for {SafePath(apiPath)}: {ex.GetType().Name}. Failing closed.");
                return new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }
        }

        public async Task<bool> IsBlockedAsync(string mediaType, int tmdbId, SeerrCaller caller)
        {
            try
            {
                var resolution = ResolveGate(caller);
                if (resolution.Kind == GateResolutionKind.NotApplicable)
                {
                    return false;
                }

                var normalized = NormalizeMediaType(mediaType);
                if (resolution.Kind == GateResolutionKind.Failed || normalized is null || tmdbId <= 0)
                {
                    return true;
                }

                return await IsTitleBlockedAsync(normalized, tmdbId, resolution.Gate).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Seerr parental mutation gate failed for {SafeMediaType(mediaType)}/{tmdbId}: {ex.GetType().Name}. Blocking.");
                return true;
            }
        }

        public async Task<bool> IsSeerrProxyPathBlockedAsync(string seerrApiPath, SeerrCaller caller)
        {
            try
            {
                var resolution = ResolveGate(caller);
                if (resolution.Kind == GateResolutionKind.NotApplicable)
                {
                    return false;
                }

                if (resolution.Kind == GateResolutionKind.Failed)
                {
                    return true;
                }

                var plan = ClassifyPath(seerrApiPath);
                if (plan.Category == EndpointCategory.Deny)
                {
                    return true;
                }

                if (plan.ParentTmdbId <= 0
                    || string.IsNullOrEmpty(plan.ParentMediaType)
                    || (plan.Category != EndpointCategory.DirectDetail
                        && plan.Category != EndpointCategory.ParentSubresource
                        && plan.Category != EndpointCategory.List))
                {
                    return false;
                }

                return await IsTitleBlockedAsync(
                    plan.ParentMediaType,
                    plan.ParentTmdbId,
                    resolution.Gate).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Seerr parental proxy gate failed for {SafePath(seerrApiPath)}: {ex.GetType().Name}. Blocking.");
                return true;
            }
        }

        public async Task<bool> IsTmdbProxyPathBlockedAsync(string tmdbApiPath, SeerrCaller caller)
        {
            try
            {
                var resolution = ResolveGate(caller);
                if (resolution.Kind == GateResolutionKind.NotApplicable)
                {
                    return false;
                }

                if (resolution.Kind == GateResolutionKind.Failed)
                {
                    return true;
                }

                var decision = TmdbProxyPathClassifier.Classify(tmdbApiPath);
                return decision.Gate switch
                {
                    TmdbProxyGate.Neutral => false,
                    TmdbProxyGate.Restricted => true,
                    TmdbProxyGate.DetailGate => await IsTitleBlockedAsync(
                        decision.MediaType,
                        decision.TmdbId,
                        resolution.Gate).ConfigureAwait(false),
                    _ => true,
                };
            }
            catch (Exception ex)
            {
                _logger.Warning($"TMDB parental proxy gate failed for {SafePath(tmdbApiPath)}: {ex.GetType().Name}. Blocking.");
                return true;
            }
        }

        public void InvalidateConfiguration()
        {
            long generation;
            lock (_generationLock)
            {
                generation = NextGenerationLocked();
                _observedConfigurationFingerprint = null;
            }

            ClearCacheCore();
            _logger.Info($"Seerr parental metadata configuration invalidated (generation {generation.ToString(CultureInfo.InvariantCulture)}).");
        }

        public void ClearCache()
        {
            long generation;
            lock (_generationLock)
            {
                // A cache clear also fences already-running lookups. Without a
                // generation bump, a pre-clear flight could republish its result
                // immediately after the dictionaries were emptied.
                generation = NextGenerationLocked();
            }

            ClearCacheCore();
            _logger.Debug($"Seerr parental metadata cache cleared (generation {generation.ToString(CultureInfo.InvariantCulture)}).");
        }

        private GateResolution ResolveGate(SeerrCaller caller)
        {
            var snapshot = CaptureConfiguration();
            if (snapshot is null)
            {
                return new GateResolution(GateResolutionKind.NotApplicable, default);
            }

            var generation = ObserveConfiguration(snapshot.Value);
            if (!snapshot.Value.FeatureEnabled || caller.IsAdmin)
            {
                return new GateResolution(GateResolutionKind.NotApplicable, default);
            }

            if (string.IsNullOrWhiteSpace(caller.JellyfinUserId)
                || !Guid.TryParse(caller.JellyfinUserId, out var userId))
            {
                _logger.Warning("Seerr parental policy could not resolve the authenticated Jellyfin user ID.");
                return new GateResolution(GateResolutionKind.Failed, default);
            }

            try
            {
                var user = _userManager.GetUserById(userId);
                if (user is null)
                {
                    _logger.Warning("Seerr parental policy could not find the authenticated Jellyfin user.");
                    return new GateResolution(GateResolutionKind.Failed, default);
                }

                var dtoPolicy = _userManager.GetUserDto(user, string.Empty)?.Policy;
                if (dtoPolicy is null)
                {
                    _logger.Warning("Seerr parental policy DTO was unavailable for the authenticated Jellyfin user.");
                    return new GateResolution(GateResolutionKind.Failed, default);
                }

                IReadOnlyCollection<UnratedItem> blockUnrated = dtoPolicy.BlockUnratedItems is { Length: > 0 } blocked
                    ? blocked
                    : Array.Empty<UnratedItem>();
                IReadOnlyCollection<string> blockedTags = Array.Empty<string>();
                IReadOnlyCollection<string> allowedTags = Array.Empty<string>();
                if (snapshot.Value.RespectTags)
                {
                    blockedTags = ParentalTagDecision.CleanTags(dtoPolicy.BlockedTags);
                    allowedTags = ParentalTagDecision.CleanTags(dtoPolicy.AllowedTags);
                }

                var policy = new PolicySnapshot(
                    user.MaxParentalRatingScore,
                    user.MaxParentalRatingSubScore,
                    blockUnrated,
                    blockedTags,
                    allowedTags);
                return policy.HasRestrictions
                    ? new GateResolution(
                        GateResolutionKind.Active,
                        new GateContext(policy, snapshot.Value, generation))
                    : new GateResolution(GateResolutionKind.NotApplicable, default);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Seerr parental policy resolution failed: {ex.GetType().Name}.");
                return new GateResolution(GateResolutionKind.Failed, default);
            }
        }

        private ConfigurationSnapshot? CaptureConfiguration()
        {
            var config = _configurationAccessor();
            if (config is null)
            {
                return null;
            }

            var urls = ParseSeerrUrls(config.JellyseerrUrls);
            var seerrApiKey = config.JellyseerrApiKey ?? string.Empty;
            var tmdbApiKey = config.TMDB_API_KEY ?? string.Empty;
            var region = string.IsNullOrWhiteSpace(config.DEFAULT_REGION)
                ? "US"
                : config.DEFAULT_REGION.Trim().ToUpperInvariant();
            var cacheMinutes = Math.Clamp(
                config.SeerrParentalRatingCacheTtlMinutes,
                1,
                MaximumCacheTtlMinutes);
            var sourceIdentity = Digest(new
            {
                SeerrEnabled = config.JellyseerrEnabled,
                SeerrUrls = urls,
                SeerrApiKey = seerrApiKey,
                TmdbApiKey = tmdbApiKey,
                Region = region,
            });
            var fingerprint = Digest(new
            {
                config.SeerrRespectParentalRatings,
                config.SeerrRespectBlockedTags,
                CacheMinutes = cacheMinutes,
                SourceIdentity = sourceIdentity,
            });

            return new ConfigurationSnapshot(
                config.SeerrRespectParentalRatings,
                config.SeerrRespectBlockedTags,
                config.JellyseerrEnabled,
                urls,
                seerrApiKey,
                tmdbApiKey,
                region,
                TimeSpan.FromMinutes(cacheMinutes),
                sourceIdentity,
                fingerprint);
        }

        private long ObserveConfiguration(ConfigurationSnapshot snapshot)
        {
            bool changed;
            long generation;
            lock (_generationLock)
            {
                changed = _observedConfigurationFingerprint is not null
                    && !string.Equals(
                        _observedConfigurationFingerprint,
                        snapshot.Fingerprint,
                        StringComparison.Ordinal);
                if (changed)
                {
                    NextGenerationLocked();
                }

                _observedConfigurationFingerprint = snapshot.Fingerprint;
                generation = _configurationGeneration;
            }

            if (changed)
            {
                ClearCacheCore();
                _logger.Info($"Seerr parental metadata configuration changed; cache invalidated (generation {generation.ToString(CultureInfo.InvariantCulture)}).");
            }

            return generation;
        }

        private bool IsCurrent(GateContext gate)
        {
            var snapshot = CaptureConfiguration();
            if (snapshot is null)
            {
                return false;
            }

            var generation = ObserveConfiguration(snapshot.Value);
            return generation == gate.Generation
                && string.Equals(snapshot.Value.Fingerprint, gate.Configuration.Fingerprint, StringComparison.Ordinal);
        }

        private long NextGenerationLocked()
        {
            if (_configurationGeneration == long.MaxValue)
            {
                _configurationGeneration = 1;
            }
            else
            {
                _configurationGeneration++;
            }

            return _configurationGeneration;
        }

        private void ClearCacheCore()
        {
            lock (_cacheLock)
            {
                _metadataCache.Clear();
            }

            _inFlight.Clear();
        }

        private SeerrParentalResult EvaluateDirectDetail(string json, EndpointPlan plan, GateContext gate)
        {
            try
            {
                using var document = JsonDocument.Parse(json);
                var detail = document.RootElement;
                if (detail.ValueKind != JsonValueKind.Object
                    || !HasSingleExpectedId(detail, plan.ParentTmdbId)
                    || !TryReadAdult(detail, out var adult)
                    || adult == true)
                {
                    return new SeerrParentalResult(true, string.Empty);
                }

                var signature = SignatureFromDetail(
                    detail,
                    plan.ParentMediaType!,
                    gate.Configuration.Region,
                    requireTags: gate.Policy.HasTagRules,
                    captureTags: gate.Policy.HasTagRules);
                if (signature is null || !IsCurrent(gate))
                {
                    return new SeerrParentalResult(true, string.Empty);
                }

                return IsAllowed(signature.Value, plan.ParentMediaType!, gate.Policy)
                    ? new SeerrParentalResult(false, json)
                    : new SeerrParentalResult(true, string.Empty);
            }
            catch (JsonException)
            {
                return new SeerrParentalResult(true, string.Empty);
            }
        }

        private async Task<SeerrParentalResult> EvaluateNestedDetailAsync(
            string json,
            EndpointPlan plan,
            GateContext gate)
        {
            if (!SeerrRequestMediaParser.TryParseNestedDetail(
                    json,
                    plan.ExpectedEntityId,
                    out var media))
            {
                return new SeerrParentalResult(true, string.Empty);
            }

            return await IsTitleBlockedAsync(media.MediaType, media.TmdbId, gate).ConfigureAwait(false)
                ? new SeerrParentalResult(true, string.Empty)
                : new SeerrParentalResult(false, json);
        }

        private async Task<SeerrParentalResult> FilterListOrNestedDetailAsync(
            string json,
            EndpointPlan plan,
            GateContext gate)
        {
            JsonNode? parsed;
            try
            {
                parsed = JsonNode.Parse(json);
            }
            catch (JsonException)
            {
                return new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }

            if (parsed is not JsonObject root)
            {
                return new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }

            var hasResults = root.ContainsKey("results");
            var hasMedia = root.ContainsKey("media");
            if (hasResults == hasMedia)
            {
                // A request endpoint is either a list or a single nested-media
                // detail. Accepting both (or neither) would let malformed JSON
                // choose whichever branch happened to be evaluated first.
                return new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }

            if (root["results"] is JsonArray)
            {
                var filtered = await FilterParsedListAsync(root, plan, gate).ConfigureAwait(false);
                return filtered.Success
                    ? new SeerrParentalResult(false, filtered.Body)
                    : new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }

            if (hasResults)
            {
                return new SeerrParentalResult(false, string.Empty, Succeeded: false);
            }

            if (hasMedia
                && SeerrRequestMediaParser.TryParseNestedDetail(json, null, out var media))
            {
                return await IsTitleBlockedAsync(media.MediaType, media.TmdbId, gate).ConfigureAwait(false)
                    ? new SeerrParentalResult(true, string.Empty)
                    : new SeerrParentalResult(false, json);
            }

            return new SeerrParentalResult(false, string.Empty, Succeeded: false);
        }

        private async Task<(bool Success, string Body)> FilterListAsync(
            string json,
            EndpointPlan plan,
            GateContext gate)
        {
            try
            {
                if (JsonNode.Parse(json) is not JsonObject root)
                {
                    return (false, string.Empty);
                }

                return await FilterParsedListAsync(root, plan, gate).ConfigureAwait(false);
            }
            catch (JsonException)
            {
                return (false, string.Empty);
            }
        }

        private async Task<(bool Success, string Body)> FilterParsedListAsync(
            JsonObject root,
            EndpointPlan plan,
            GateContext gate)
        {
            var arrays = CollectArrays(root, plan).ToList();
            if (arrays.Count == 0)
            {
                return (false, string.Empty);
            }

            var signatures = await ResolveSignaturesAsync(arrays, plan, gate).ConfigureAwait(false);
            if (!IsCurrent(gate))
            {
                return (false, string.Empty);
            }

            var removed = 0;
            foreach (var array in arrays)
            {
                var before = array.Count;
                RemoveDisallowed(array, plan, gate, signatures);
                removed += before - array.Count;
            }

            if (!IsCurrent(gate))
            {
                return (false, string.Empty);
            }

            MarkFilteredPagination(root, removed);
            return (true, root.ToJsonString());
        }

        private async Task<Dictionary<string, TitleSignature?>> ResolveSignaturesAsync(
            IReadOnlyList<JsonArray> arrays,
            EndpointPlan plan,
            GateContext gate)
        {
            var titles = new Dictionary<string, (string MediaType, int TmdbId)>(StringComparer.Ordinal);
            foreach (var array in arrays)
            {
                foreach (var node in array)
                {
                    if (node is not JsonObject row)
                    {
                        continue;
                    }

                    var item = ResolveItemObject(row, plan);
                    if (item is not null
                        && TryResolveTitleIdentity(
                            item,
                            plan.IdField,
                            plan.MediaTypeHint,
                            out var mediaType,
                            out var tmdbId)
                        && TryReadAdult(item, out var adult)
                        && !adult)
                    {
                        titles[TitleCacheKey(mediaType, tmdbId, gate)] = (mediaType, tmdbId);
                    }

                    CollectKnownForTitles(row, gate, titles);
                }
            }

            var resolved = new Dictionary<string, TitleSignature?>(StringComparer.Ordinal);
            if (titles.Count == 0)
            {
                return resolved;
            }

            using var budget = new CancellationTokenSource(OverallBudget);
            using var requestThrottle = new SemaphoreSlim(MaximumConcurrentFetches, MaximumConcurrentFetches);
            var tasks = titles.Select(async title =>
            {
                try
                {
                    await requestThrottle.WaitAsync(budget.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    return (title.Key, (TitleSignature?)null);
                }

                try
                {
                    var signature = await GetSignatureAsync(
                        title.Value.MediaType,
                        title.Value.TmdbId,
                        gate,
                        gate.Policy.HasTagRules,
                        budget.Token).ConfigureAwait(false);
                    return (title.Key, signature);
                }
                finally
                {
                    requestThrottle.Release();
                }
            });

            foreach (var (key, signature) in await Task.WhenAll(tasks).ConfigureAwait(false))
            {
                resolved[key] = signature;
            }

            if (!IsCurrent(gate))
            {
                resolved.Clear();
            }

            return resolved;
        }

        private void RemoveDisallowed(
            JsonArray array,
            EndpointPlan plan,
            GateContext gate,
            IReadOnlyDictionary<string, TitleSignature?> signatures)
        {
            for (var index = array.Count - 1; index >= 0; index--)
            {
                if (array[index] is not JsonObject row)
                {
                    array.RemoveAt(index);
                    continue;
                }

                var item = ResolveItemObject(row, plan);
                if (item is null)
                {
                    array.RemoveAt(index);
                    continue;
                }

                var kind = ResolveItemKind(item, plan.MediaTypeHint);
                if (kind == ItemKind.NonTitle && !plan.RequireTitle)
                {
                    FilterKnownFor(row, gate, signatures);
                    continue;
                }

                if ((kind != ItemKind.Movie && kind != ItemKind.Tv)
                    || !TryReadAdult(item, out var adult)
                    || adult
                    || !TryGetPositiveId(item, plan.IdField, out var tmdbId))
                {
                    array.RemoveAt(index);
                    continue;
                }

                var mediaType = kind == ItemKind.Tv ? "tv" : "movie";
                if (!signatures.TryGetValue(TitleCacheKey(mediaType, tmdbId, gate), out var signature)
                    || signature is null
                    || !IsAllowed(signature.Value, mediaType, gate.Policy))
                {
                    array.RemoveAt(index);
                    continue;
                }

                FilterKnownFor(row, gate, signatures);
            }
        }

        private static JsonObject? ResolveItemObject(JsonObject row, EndpointPlan plan)
            => plan.NestedMedia ? row["media"] as JsonObject : row;

        private static void CollectKnownForTitles(
            JsonObject row,
            GateContext gate,
            IDictionary<string, (string MediaType, int TmdbId)> titles)
        {
            foreach (var property in new[] { "knownFor", "known_for" })
            {
                if (row[property] is not JsonArray knownFor)
                {
                    continue;
                }

                foreach (var node in knownFor)
                {
                    if (node is JsonObject item
                        && TryResolveTitleIdentity(item, "id", null, out var mediaType, out var tmdbId)
                        && TryReadAdult(item, out var adult)
                        && !adult)
                    {
                        titles[TitleCacheKey(mediaType, tmdbId, gate)] = (mediaType, tmdbId);
                    }
                }
            }
        }

        private static void FilterKnownFor(
            JsonObject row,
            GateContext gate,
            IReadOnlyDictionary<string, TitleSignature?> signatures)
        {
            foreach (var property in new[] { "knownFor", "known_for" })
            {
                if (row[property] is null)
                {
                    continue;
                }

                if (row[property] is not JsonArray knownFor)
                {
                    row.Remove(property);
                    continue;
                }

                for (var index = knownFor.Count - 1; index >= 0; index--)
                {
                    if (knownFor[index] is not JsonObject item
                        || !TryResolveTitleIdentity(item, "id", null, out var mediaType, out var tmdbId)
                        || !TryReadAdult(item, out var adult)
                        || adult
                        || !signatures.TryGetValue(TitleCacheKey(mediaType, tmdbId, gate), out var signature)
                        || signature is null
                        || !IsAllowed(signature.Value, mediaType, gate.Policy))
                    {
                        knownFor.RemoveAt(index);
                    }
                }
            }
        }

        private async Task<bool> IsTitleBlockedAsync(string mediaType, int tmdbId, GateContext gate)
        {
            if (tmdbId <= 0 || NormalizeMediaType(mediaType) is not { } normalized || !IsCurrent(gate))
            {
                return true;
            }

            using var timeout = new CancellationTokenSource(PerFetchTimeout);
            var signature = await GetSignatureAsync(
                normalized,
                tmdbId,
                gate,
                gate.Policy.HasTagRules,
                timeout.Token).ConfigureAwait(false);
            return signature is null
                || !IsCurrent(gate)
                || !IsAllowed(signature.Value, normalized, gate.Policy);
        }

        private static bool IsAllowed(TitleSignature signature, string mediaType, PolicySnapshot policy)
        {
            if (signature.Adult == true)
            {
                return false;
            }

            var unratedType = mediaType == "tv" ? UnratedItem.Series : UnratedItem.Movie;
            if (!ParentalRatingDecision.IsAllowed(
                    signature.Score,
                    signature.SubScore,
                    unratedType,
                    policy.MaxScore,
                    policy.MaxSubScore,
                    policy.BlockUnrated))
            {
                return false;
            }

            if (!policy.HasTagRules)
            {
                return true;
            }

            return signature.Keywords is not null
                && signature.Genres is not null
                && ParentalTagDecision.IsAllowed(
                    signature.Keywords,
                    signature.Genres,
                    policy.BlockedTags,
                    policy.AllowedTags);
        }

        private TitleSignature? SignatureFromDetail(
            JsonElement detail,
            string mediaType,
            string region,
            bool requireTags,
            bool captureTags)
        {
            if (detail.ValueKind != JsonValueKind.Object
                || !TryReadAdult(detail, out var adult)
                || !SeerrCertificationExtractor.HasAuthoritativeShape(detail, mediaType))
            {
                return null;
            }

            if (string.Equals(mediaType, "movie", StringComparison.OrdinalIgnoreCase)
                && adult is null)
            {
                // Movie mutation/detail decisions must carry TMDB's explicit
                // adult flag; a certification-only fragment is insufficient.
                return null;
            }

            string[]? keywords = null;
            string[]? genres = null;
            if (captureTags
                && SeerrTagSignatureExtractor.TryExtract(detail, out var extractedKeywords, out var extractedGenres))
            {
                keywords = extractedKeywords.ToArray();
                genres = extractedGenres.ToArray();
            }
            else if (requireTags)
            {
                return null;
            }

            var certification = SeerrCertificationExtractor.Extract(detail, mediaType, region);
            if (string.IsNullOrWhiteSpace(certification.Certification))
            {
                return new TitleSignature(null, null, keywords, genres, adult);
            }

            var score = _localization.GetRatingScore(
                certification.Certification,
                certification.Iso ?? region);
            return score is null
                ? new TitleSignature(null, null, keywords, genres, adult)
                : new TitleSignature(score.Score, score.SubScore, keywords, genres, adult);
        }

        private async Task<TitleSignature?> GetSignatureAsync(
            string mediaType,
            int tmdbId,
            GateContext gate,
            bool needTags,
            CancellationToken cancellationToken)
        {
            var cacheKey = TitleCacheKey(mediaType, tmdbId, gate);
            if (_metadataCache.TryGetValue(cacheKey, out var cached)
                && cached.ExpiresAtUtc > DateTime.UtcNow
                && (!needTags || cached.Signature.Keywords is not null)
                && IsCurrent(gate))
            {
                return cached.Signature;
            }

            if (!IsCurrent(gate))
            {
                return null;
            }

            var flightKey = needTags ? cacheKey + "|tags" : cacheKey + "|rating";
            var lazy = _inFlight.GetOrAdd(
                flightKey,
                _ => new Lazy<Task<TitleSignature?>>(
                    () => FetchSignatureAsync(cacheKey, mediaType, tmdbId, gate, needTags),
                    LazyThreadSafetyMode.ExecutionAndPublication));
            Task<TitleSignature?> task;
            try
            {
                task = lazy.Value;
            }
            catch
            {
                RemoveFlight(flightKey, lazy);
                return null;
            }

            _ = task.ContinueWith(
                _ => RemoveFlight(flightKey, lazy),
                CancellationToken.None,
                TaskContinuationOptions.ExecuteSynchronously,
                TaskScheduler.Default);
            try
            {
                var signature = await task.WaitAsync(cancellationToken).ConfigureAwait(false);
                return IsCurrent(gate) ? signature : null;
            }
            catch (Exception ex) when (ex is OperationCanceledException || ex is HttpRequestException || ex is JsonException)
            {
                return null;
            }
        }

        private void RemoveFlight(string key, Lazy<Task<TitleSignature?>> expected)
        {
            if (_inFlight.TryGetValue(key, out var current) && ReferenceEquals(current, expected))
            {
                _inFlight.TryRemove(key, out _);
            }
        }

        private async Task<TitleSignature?> FetchSignatureAsync(
            string cacheKey,
            string mediaType,
            int tmdbId,
            GateContext gate,
            bool needTags)
        {
            using var timeout = new CancellationTokenSource(PerFetchTimeout);
            try
            {
                await _globalFetchThrottle.WaitAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return null;
            }

            try
            {
                var fetched = await FetchDetailAsync(mediaType, tmdbId, gate, needTags, timeout.Token)
                    .ConfigureAwait(false);
                if (fetched.Detail is null
                    || !HasSingleExpectedId(fetched.Detail.Value, tmdbId)
                    || !IsCurrent(gate))
                {
                    return null;
                }

                var signature = SignatureFromDetail(
                    fetched.Detail.Value,
                    mediaType,
                    gate.Configuration.Region,
                    requireTags: needTags,
                    captureTags: fetched.TagBearing);
                if (signature is null || !IsCurrent(gate))
                {
                    return null;
                }

                PublishCache(cacheKey, signature.Value, gate);
                return IsCurrent(gate) ? signature : null;
            }
            catch (OperationCanceledException)
            {
                _logger.Debug($"Parental metadata lookup timed out for {mediaType}/{tmdbId}.");
                return null;
            }
            catch (Exception ex)
            {
                _logger.Debug($"Parental metadata lookup failed for {mediaType}/{tmdbId}: {ex.GetType().Name}.");
                return null;
            }
            finally
            {
                _globalFetchThrottle.Release();
            }
        }

        private async Task<(JsonElement? Detail, bool TagBearing)> FetchDetailAsync(
            string mediaType,
            int tmdbId,
            GateContext gate,
            bool needTags,
            CancellationToken cancellationToken)
        {
            var config = gate.Configuration;
            if (!IsCurrent(gate))
            {
                return (null, false);
            }

            if (needTags)
            {
                if (config.SeerrEnabled && config.SeerrUrls.Length > 0 && !string.IsNullOrEmpty(config.SeerrApiKey))
                {
                    var fromSeerr = await FetchDetailFromSeerrAsync(
                        mediaType,
                        tmdbId,
                        gate,
                        cancellationToken).ConfigureAwait(false);
                    if (fromSeerr is not null)
                    {
                        return (fromSeerr, true);
                    }
                }

                if (!IsCurrent(gate))
                {
                    return (null, false);
                }

                var fromTmdb = await FetchFullDetailFromTmdbAsync(
                    mediaType,
                    tmdbId,
                    config.TmdbApiKey,
                    cancellationToken).ConfigureAwait(false);
                return (fromTmdb, fromTmdb is not null);
            }

            if (!string.IsNullOrEmpty(config.TmdbApiKey))
            {
                var certification = await FetchCertificationFromTmdbAsync(
                    mediaType,
                    tmdbId,
                    config.TmdbApiKey,
                    cancellationToken).ConfigureAwait(false);
                if (certification is not null)
                {
                    return (certification, false);
                }
            }

            if (!IsCurrent(gate))
            {
                return (null, false);
            }

            if (config.SeerrEnabled && config.SeerrUrls.Length > 0 && !string.IsNullOrEmpty(config.SeerrApiKey))
            {
                var fromSeerr = await FetchDetailFromSeerrAsync(
                    mediaType,
                    tmdbId,
                    gate,
                    cancellationToken).ConfigureAwait(false);
                return (fromSeerr, fromSeerr is not null);
            }

            return (null, false);
        }

        private async Task<JsonElement?> FetchCertificationFromTmdbAsync(
            string mediaType,
            int tmdbId,
            string apiKey,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(apiKey))
            {
                return null;
            }

            var resource = mediaType == "tv" ? "content_ratings" : "release_dates";
            var append = Uri.EscapeDataString(resource);
            var uri = $"https://api.themoviedb.org/3/{mediaType}/{tmdbId.ToString(CultureInfo.InvariantCulture)}?api_key={Uri.EscapeDataString(apiKey)}&append_to_response={append}";
            return await FetchTmdbJsonAsync(uri, mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
        }

        private async Task<JsonElement?> FetchFullDetailFromTmdbAsync(
            string mediaType,
            int tmdbId,
            string apiKey,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrEmpty(apiKey))
            {
                return null;
            }

            var certification = mediaType == "tv" ? "content_ratings" : "release_dates";
            var append = Uri.EscapeDataString(certification + ",keywords");
            var uri = $"https://api.themoviedb.org/3/{mediaType}/{tmdbId.ToString(CultureInfo.InvariantCulture)}?api_key={Uri.EscapeDataString(apiKey)}&append_to_response={append}";
            return await FetchTmdbJsonAsync(uri, mediaType, tmdbId, cancellationToken).ConfigureAwait(false);
        }

        private async Task<JsonElement?> FetchTmdbJsonAsync(
            string requestUri,
            string mediaType,
            int tmdbId,
            CancellationToken cancellationToken)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
                request.Headers.UserAgent.ParseAdd(SeerrHttpHelper.UserAgent);
                using var response = await client.SendAsync(
                    request,
                    HttpCompletionOption.ResponseHeadersRead,
                    cancellationToken).ConfigureAwait(false);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.Debug($"TMDB parental metadata returned {(int)response.StatusCode} for {mediaType}/{tmdbId}.");
                    return null;
                }

                var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                using var document = JsonDocument.Parse(body);
                return document.RootElement.ValueKind == JsonValueKind.Object
                    ? document.RootElement.Clone()
                    : null;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                _logger.Debug($"TMDB parental metadata fetch failed for {mediaType}/{tmdbId}: {ex.GetType().Name}.");
                return null;
            }
        }

        private async Task<JsonElement?> FetchDetailFromSeerrAsync(
            string mediaType,
            int tmdbId,
            GateContext gate,
            CancellationToken cancellationToken)
        {
            var config = gate.Configuration;
            var relativePath = $"/api/v1/{mediaType}/{tmdbId.ToString(CultureInfo.InvariantCulture)}";
            var client = SeerrHttpHelper.CreateClient(_httpClientFactory);
            for (var index = 0; index < config.SeerrUrls.Length; index++)
            {
                if (!IsCurrent(gate))
                {
                    return null;
                }

                var requestUri = config.SeerrUrls[index] + relativePath;
                try
                {
                    using var request = SeerrHttpHelper.BuildRequest(
                        HttpMethod.Get,
                        requestUri,
                        config.SeerrApiKey);
                    using var response = await client.SendAsync(
                        request,
                        HttpCompletionOption.ResponseHeadersRead,
                        cancellationToken).ConfigureAwait(false);
                    if (!response.IsSuccessStatusCode || !SeerrHttpHelper.IsJsonContentType(response))
                    {
                        _logger.Debug($"Seerr parental metadata source {index + 1} returned {(int)response.StatusCode} for {mediaType}/{tmdbId}.");
                        continue;
                    }

                    if (response.Content.Headers.ContentLength is > 8_388_608)
                    {
                        _logger.Debug($"Seerr parental metadata source {index + 1} returned an oversized body for {mediaType}/{tmdbId}.");
                        continue;
                    }

                    var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                    if (string.IsNullOrEmpty(json) || json.Length > 8_388_608)
                    {
                        continue;
                    }

                    using var document = JsonDocument.Parse(json);
                    if (document.RootElement.ValueKind == JsonValueKind.Object)
                    {
                        return document.RootElement.Clone();
                    }
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    _logger.Debug($"Seerr parental metadata source {index + 1} failed for {mediaType}/{tmdbId}: {ex.GetType().Name}.");
                }
            }

            return null;
        }

        private void PublishCache(string key, TitleSignature signature, GateContext gate)
        {
            if (!IsCurrent(gate))
            {
                return;
            }

            lock (_cacheLock)
            {
                var now = DateTime.UtcNow;
                if (signature.Keywords is null
                    && _metadataCache.TryGetValue(key, out var current)
                    && current.ExpiresAtUtc > now
                    && current.Signature.Keywords is not null)
                {
                    signature = signature with
                    {
                        Keywords = current.Signature.Keywords,
                        Genres = current.Signature.Genres,
                    };
                }

                var sequence = Interlocked.Increment(ref _cacheSequence);
                _metadataCache[key] = new CacheEntry(
                    signature,
                    now + gate.Configuration.CacheTtl,
                    sequence);
                TrimCacheLocked(now);
            }

            if (!IsCurrent(gate))
            {
                _metadataCache.TryRemove(key, out _);
            }
        }

        private void TrimCacheLocked(DateTime now)
        {
            if (_metadataCache.Count >= MaximumCacheEntries)
            {
                foreach (var expired in _metadataCache
                    .Where(entry => entry.Value.ExpiresAtUtc <= now)
                    .Select(entry => entry.Key)
                    .ToArray())
                {
                    _metadataCache.TryRemove(expired, out _);
                }
            }

            var excess = _metadataCache.Count - MaximumCacheEntries;
            if (excess <= 0)
            {
                return;
            }

            foreach (var oldest in _metadataCache
                .OrderBy(entry => entry.Value.Sequence)
                .Take(excess)
                .Select(entry => entry.Key)
                .ToArray())
            {
                _metadataCache.TryRemove(oldest, out _);
            }
        }

        private static EndpointPlan ClassifyPath(string apiPath)
        {
            if (string.IsNullOrWhiteSpace(apiPath))
            {
                return new EndpointPlan { Category = EndpointCategory.None };
            }

            var queryIndex = apiPath.IndexOf('?');
            var hasQuery = queryIndex >= 0;
            var path = hasQuery ? apiPath.Substring(0, queryIndex) : apiPath;
            var segments = path.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length < 3
                || !Eq(segments[0], "api")
                || !Eq(segments[1], "v1"))
            {
                return new EndpointPlan { Category = EndpointCategory.None };
            }

            if (Eq(segments[2], "request") || Eq(segments[2], "issue"))
            {
                if (segments.Length == 3)
                {
                    return new EndpointPlan
                    {
                        Category = hasQuery ? EndpointCategory.List : EndpointCategory.ListOrNestedDetail,
                        Container = ListContainer.Results,
                        IdField = "tmdbId",
                        NestedMedia = true,
                        RequireTitle = true,
                    };
                }

                return segments.Length == 4 && TryParsePositiveId(segments[3], out var entityId)
                    ? new EndpointPlan
                    {
                        Category = EndpointCategory.NestedDetail,
                        ExpectedEntityId = entityId,
                    }
                    : new EndpointPlan { Category = EndpointCategory.Deny };
            }

            if (Eq(segments[2], "movie") || Eq(segments[2], "tv"))
            {
                if (segments.Length < 4 || !TryParsePositiveId(segments[3], out var parentId))
                {
                    return new EndpointPlan { Category = EndpointCategory.Deny };
                }

                var mediaType = Eq(segments[2], "tv") ? "tv" : "movie";
                if (segments.Length == 4)
                {
                    return new EndpointPlan
                    {
                        Category = EndpointCategory.DirectDetail,
                        ParentMediaType = mediaType,
                        ParentTmdbId = parentId,
                    };
                }

                if (segments.Length == 5
                    && (Eq(segments[4], "similar") || Eq(segments[4], "recommendations")))
                {
                    return new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Results,
                        MediaTypeHint = mediaType,
                        RequireTitle = true,
                        ParentMediaType = mediaType,
                        ParentTmdbId = parentId,
                    };
                }

                return new EndpointPlan
                {
                    Category = EndpointCategory.ParentSubresource,
                    ParentMediaType = mediaType,
                    ParentTmdbId = parentId,
                };
            }

            if (Eq(segments[2], "collection"))
            {
                return segments.Length >= 4 && TryParsePositiveId(segments[3], out _)
                    ? new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Parts,
                        MediaTypeHint = "movie",
                        RequireTitle = true,
                    }
                    : new EndpointPlan { Category = EndpointCategory.Deny };
            }

            if (Eq(segments[2], "person"))
            {
                return segments.Length == 5
                    && TryParsePositiveId(segments[3], out _)
                    && Eq(segments[4], "combined_credits")
                        ? new EndpointPlan
                        {
                            Category = EndpointCategory.List,
                            Container = ListContainer.CombinedCredits,
                            RequireTitle = true,
                        }
                        : new EndpointPlan { Category = EndpointCategory.None };
            }

            if (Eq(segments[2], "search"))
            {
                return segments.Length == 3
                    ? new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Results,
                    }
                    : new EndpointPlan { Category = EndpointCategory.None };
            }

            if (Eq(segments[2], "discover"))
            {
                if (segments.Length == 5
                    && Eq(segments[3], "genreslider")
                    && NormalizeMediaType(segments[4]) is not null)
                {
                    // Seerr returns a top-level array of genre descriptors
                    // ({id,name,backdrops}), not movie/TV result objects. The
                    // backdrop strings carry no title identity that this gate
                    // could classify, and this audited route is ordinary UI
                    // metadata rather than a generic title passthrough.
                    return new EndpointPlan { Category = EndpointCategory.None };
                }

                if (segments.Length == 4 && Eq(segments[3], "watchlist"))
                {
                    return new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Results,
                        IdField = "tmdbId",
                        RequireTitle = true,
                    };
                }

                if (segments.Length == 4 && Eq(segments[3], "trending"))
                {
                    return new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Results,
                    };
                }

                if (segments.Length >= 4
                    && (Eq(segments[3], "movies") || Eq(segments[3], "tv")))
                {
                    return new EndpointPlan
                    {
                        Category = EndpointCategory.List,
                        Container = ListContainer.Results,
                        MediaTypeHint = Eq(segments[3], "tv") ? "tv" : "movie",
                        RequireTitle = true,
                    };
                }

                // No other discover shape is exposed by Enhanced today. Keep
                // future/unknown discover paths fail-closed for restricted users.
                return new EndpointPlan { Category = EndpointCategory.Deny };
            }

            return new EndpointPlan { Category = EndpointCategory.None };
        }

        private static IEnumerable<JsonArray> CollectArrays(JsonObject root, EndpointPlan plan)
        {
            switch (plan.Container)
            {
                case ListContainer.Results:
                    if (root["results"] is JsonArray results)
                    {
                        yield return results;
                    }

                    break;
                case ListContainer.Parts:
                    if (root["parts"] is JsonArray parts)
                    {
                        yield return parts;
                    }

                    break;
                case ListContainer.CombinedCredits:
                    if (root["cast"] is JsonArray cast)
                    {
                        yield return cast;
                    }

                    if (root["crew"] is JsonArray crew)
                    {
                        yield return crew;
                    }

                    break;
            }
        }

        private static ItemKind ResolveItemKind(JsonObject item, string? hint)
        {
            var normalizedHint = NormalizeMediaType(hint);
            var hasCamelType = item.ContainsKey("mediaType");
            var hasSnakeType = item.ContainsKey("media_type");
            if (hasCamelType && hasSnakeType)
            {
                return ItemKind.Unknown;
            }

            var hasExplicitType = hasCamelType || hasSnakeType;
            var raw = hasCamelType
                ? ReadString(item, "mediaType")
                : hasSnakeType ? ReadString(item, "media_type") : null;
            var explicitKind = string.Equals(raw, "movie", StringComparison.OrdinalIgnoreCase)
                ? ItemKind.Movie
                : string.Equals(raw, "tv", StringComparison.OrdinalIgnoreCase)
                    ? ItemKind.Tv
                    : string.Equals(raw, "person", StringComparison.OrdinalIgnoreCase)
                        || string.Equals(raw, "collection", StringComparison.OrdinalIgnoreCase)
                            ? ItemKind.NonTitle
                            : ItemKind.Unknown;

            if (normalizedHint is not null)
            {
                var hintedKind = normalizedHint == "tv" ? ItemKind.Tv : ItemKind.Movie;
                return !hasExplicitType || explicitKind == hintedKind
                    ? hintedKind
                    : ItemKind.Unknown;
            }

            return explicitKind;
        }

        private static bool TryResolveTitleIdentity(
            JsonObject item,
            string idField,
            string? hint,
            out string mediaType,
            out int tmdbId)
        {
            mediaType = string.Empty;
            tmdbId = 0;
            var kind = ResolveItemKind(item, hint);
            if ((kind != ItemKind.Movie && kind != ItemKind.Tv)
                || !TryGetPositiveId(item, idField, out tmdbId))
            {
                return false;
            }

            mediaType = kind == ItemKind.Tv ? "tv" : "movie";
            return true;
        }

        private static string? NormalizeMediaType(string? value)
        {
            if (string.Equals(value, "movie", StringComparison.OrdinalIgnoreCase))
            {
                return "movie";
            }

            return string.Equals(value, "tv", StringComparison.OrdinalIgnoreCase) ? "tv" : null;
        }

        private static string? ReadString(JsonObject item, string property)
        {
            var value = item[property];
            return value?.GetValueKind() == JsonValueKind.String ? value.GetValue<string>() : null;
        }

        private static bool TryGetPositiveId(JsonObject item, string property, out int id)
        {
            id = 0;
            var value = item[property];
            if (value is null)
            {
                return false;
            }

            try
            {
                if (value.GetValueKind() == JsonValueKind.Number)
                {
                    id = value.GetValue<int>();
                    return id > 0;
                }

                return value.GetValueKind() == JsonValueKind.String
                    && TryParsePositiveId(value.GetValue<string>(), out id);
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static bool TryGetPositiveId(JsonElement item, string property, out int id)
        {
            id = 0;
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty(property, out var value))
            {
                return false;
            }

            if (value.ValueKind == JsonValueKind.Number)
            {
                return value.TryGetInt32(out id) && id > 0;
            }

            return value.ValueKind == JsonValueKind.String
                && TryParsePositiveId(value.GetString(), out id);
        }

        private static bool HasSingleExpectedId(JsonElement item, int expectedId)
        {
            if (item.ValueKind != JsonValueKind.Object || expectedId <= 0)
            {
                return false;
            }

            var idCount = 0;
            foreach (var property in item.EnumerateObject())
            {
                if (property.NameEquals("id"))
                {
                    idCount++;
                }
            }

            return idCount == 1
                && TryGetPositiveId(item, "id", out var actualId)
                && actualId == expectedId;
        }

        private static bool TryParsePositiveId(string? value, out int id)
        {
            id = 0;
            if (string.IsNullOrEmpty(value))
            {
                return false;
            }

            foreach (var character in value)
            {
                if (character < '0' || character > '9')
                {
                    return false;
                }
            }

            return int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out id) && id > 0;
        }

        private static bool TryReadAdult(JsonObject item, out bool adult)
        {
            adult = false;
            var value = item["adult"];
            if (value is null)
            {
                return true;
            }

            var kind = value.GetValueKind();
            if (kind == JsonValueKind.True)
            {
                adult = true;
                return true;
            }

            return kind == JsonValueKind.False;
        }

        private static bool TryReadAdult(JsonElement item, out bool? adult)
        {
            adult = null;
            if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("adult", out var value))
            {
                return true;
            }

            if (value.ValueKind == JsonValueKind.True)
            {
                adult = true;
                return true;
            }

            if (value.ValueKind == JsonValueKind.False)
            {
                adult = false;
                return true;
            }

            return false;
        }

        private static void MarkFilteredPagination(JsonObject root, int removed)
        {
            if (removed <= 0
                || (root["pageInfo"] is null
                    && root["totalResults"] is null
                    && root["totalPages"] is null))
            {
                return;
            }

            root["jellyfinEnhancedPagination"] = new JsonObject
            {
                ["contract"] = "upstream-total-upper-bound",
                ["totalExact"] = false,
                ["removedFromPage"] = removed,
            };
        }

        private static string TitleCacheKey(string mediaType, int tmdbId, GateContext gate)
            => string.Concat(
                gate.Generation.ToString(CultureInfo.InvariantCulture),
                ":",
                gate.Configuration.SourceIdentity,
                ":",
                mediaType,
                ":",
                tmdbId.ToString(CultureInfo.InvariantCulture),
                ":",
                gate.Configuration.Region);

        private static string[] ParseSeerrUrls(string? configured)
        {
            if (string.IsNullOrWhiteSpace(configured))
            {
                return Array.Empty<string>();
            }

            var result = new List<string>();
            foreach (var candidate in configured.Split(
                new[] { '\r', '\n', ',' },
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri)
                    || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
                    || !string.IsNullOrEmpty(uri.Query)
                    || !string.IsNullOrEmpty(uri.Fragment))
                {
                    continue;
                }

                var normalized = uri.GetLeftPart(UriPartial.Path).TrimEnd('/');
                if (!result.Contains(normalized, StringComparer.OrdinalIgnoreCase))
                {
                    result.Add(normalized);
                }
            }

            return result.ToArray();
        }

        private static string Digest<T>(T value)
            => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value)));

        private static bool Eq(string value, string expected)
            => string.Equals(value, expected, StringComparison.OrdinalIgnoreCase);

        private static string SafeMediaType(string? mediaType)
            => NormalizeMediaType(mediaType) ?? "invalid";

        private static string SafePath(string? apiPath)
        {
            if (string.IsNullOrEmpty(apiPath))
            {
                return "<empty>";
            }

            var query = apiPath.IndexOf('?');
            var path = query >= 0 ? apiPath.Substring(0, query) : apiPath;
            return path.Length <= 160 ? path : path.Substring(0, 160);
        }
    }
}
