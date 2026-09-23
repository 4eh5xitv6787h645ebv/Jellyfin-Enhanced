using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Data;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Globalization;
using Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrEndpointClassifier;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrResponseReader;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalDecision;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrSignatureProvider;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrListFilter;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Enforces each Jellyfin user's parental-rating limit on the Seerr surfaces
    /// the plugin proxies (issue #581). Seerr/TMDB list responses carry no
    /// certification, so for a *restricted* user (MaxParentalRating set, or
    /// "block unrated" enabled) every movie/series row is resolved to a parental
    /// score — TMDB's tiny release_dates / content_ratings endpoints when a TMDB
    /// key is configured, otherwise Seerr's full detail — through a user-neutral
    /// cache (default 24 h), and rows above the limit are removed. Detail
    /// endpoints answer 403 for blocked titles and request POSTs are refused, so
    /// a restricted user can't reach a hidden title through a direct link.
    ///
    /// Users without a limit pay nothing: the filter returns before any lookup.
    /// Unresolvable titles fail closed for restricted users (hidden), because
    /// exposure is the failure mode that matters here.
    ///
    /// Rating semantics mirror Jellyfin's own <c>BaseItem.IsParentalAllowed</c>
    /// (see <see cref="ParentalRatingDecision"/>); certifications are resolved only
    /// for the configured rating country (<see cref="SeerrCertificationExtractor"/>).
    /// Design adapted from Jellyfin-Canopy's SeerrParentalFilter (GPL-3.0), rating branch only.
    /// </summary>
    public sealed class SeerrParentalFilter
    {
        /// <summary>Outcome of <see cref="ApplyAsync"/>.</summary>
        /// <param name="Block">True when the whole response must be refused (blocked detail / sub-resource).</param>
        /// <param name="Body">The (possibly filtered) JSON body to return when not blocked.</param>
        /// <param name="RetryLater">True when a paged feed could not be verified within the budget: the body is the safe partial page, but the caller should answer 504 so the client re-fetches once the pending lookups (which keep running) have landed in the cache.</param>
        public readonly record struct Result(bool Block, string Body, bool RetryLater = false);

        private readonly IUserManager _userManager;
        private readonly IServerConfigurationManager _serverConfig;
        private readonly Logger _logger;
        private readonly SeerrSignatureProvider _signatures;
        private readonly SeerrListFilter _lists;

        /// <summary>Creates the filter; registered as a singleton so its caches and fetch pool are shared.</summary>
        public SeerrParentalFilter(
            IHttpClientFactory httpClientFactory,
            IUserManager userManager,
            ILocalizationManager localization,
            IServerConfigurationManager serverConfig,
            Logger logger)
        {
            _userManager = userManager;
            _serverConfig = serverConfig;
            _logger = logger;
            _signatures = new SeerrSignatureProvider(httpClientFactory, localization, logger);
            _lists = new SeerrListFilter(_signatures, logger);
        }

        // ── Policy ───────────────────────────────────────────────────────────

        /// <summary>A user's effective parental limit (rating limit + cleaned tag rules).</summary>
        public readonly record struct Policy(
            int? MaxScore,
            int? MaxSubScore,
            bool BlockUnratedMovies,
            bool BlockUnratedSeries,
            HashSet<string> BlockedTags,
            HashSet<string> AllowedTags)
        {
            /// <summary>True when the user has any Blocked or Allowed Tags (keyword lookups are then needed).</summary>
            public bool HasTagRules => (BlockedTags?.Count ?? 0) > 0 || (AllowedTags?.Count ?? 0) > 0;

            /// <summary>True when anything at all may be hidden from this user.</summary>
            public bool IsRestricted => MaxScore.HasValue || BlockUnratedMovies || BlockUnratedSeries || HasTagRules;

            /// <summary>Whether unrated titles of the given kind ("movie" / "tv") are hidden.</summary>
            public bool BlocksUnrated(string mediaType) => mediaType == "tv" ? BlockUnratedSeries : BlockUnratedMovies;
        }

        // Always on (there is no admin toggle): a user's Jellyfin parental controls
        // are the policy, and the filter does nothing for users without any. Not
        // tied to JellyseerrEnabled: the TMDB passthrough is reachable without
        // Seerr and must be gated by the same policy.
        private static bool IsEnabled() => JellyfinEnhanced.Instance?.Configuration != null;

        /// <summary>
        /// Resolves the caller's parental policy. Returns false when the feature is
        /// off, the user is unknown, or the user has no limit — i.e. nothing to filter.
        /// </summary>
        public bool TryGetRestrictedPolicy(string? jellyfinUserId, out Policy policy)
        {
            policy = default;
            if (!IsEnabled() || string.IsNullOrEmpty(jellyfinUserId) || !Guid.TryParse(jellyfinUserId, out var userGuid))
            {
                return false;
            }

            var user = _userManager.GetUserById(userGuid);
            if (user == null)
            {
                return false;
            }

            // Same source Jellyfin's own gate reads (BaseItem.GetBlockUnratedValue);
            // no DTO materialisation on the hot path.
            var blocked = user.GetPreferenceValues<UnratedItem>(PreferenceKind.BlockUnratedItems);
            var blockMovies = blocked.Contains(UnratedItem.Movie);
            var blockSeries = blocked.Contains(UnratedItem.Series);

            // Tag branch of the native parental controls, compared the way core
            // compares tags (raw values, case-insensitive ordinal).
            var blockedTags = ParentalTagDecision.ToTagSet(user.GetPreference(PreferenceKind.BlockedTags));
            var allowedTags = ParentalTagDecision.ToTagSet(user.GetPreference(PreferenceKind.AllowedTags));

            policy = new Policy(user.MaxParentalRatingScore, user.MaxParentalRatingSubScore, blockMovies, blockSeries, blockedTags, allowedTags);
            return policy.IsRestricted;
        }

        private string Region()
        {
            var code = _serverConfig.Configuration.MetadataCountryCode;
            return string.IsNullOrWhiteSpace(code) ? "US" : code.Trim().ToUpperInvariant();
        }

        // ── Public entry points ──────────────────────────────────────────────

        /// <summary>
        /// Applies the caller's parental limit to a proxied Seerr response body.
        /// </summary>
        /// <param name="json">Upstream JSON body.</param>
        /// <param name="apiPath">Seerr API path (e.g. "/api/v1/search?query=x&amp;page=1").</param>
        /// <param name="jellyfinUserId">The calling Jellyfin user.</param>
        /// <param name="requestAborted">Stops the lookups when the caller has gone away.</param>
        /// <returns>Whether the response must be refused, the (filtered) body, and whether the client should re-fetch it.</returns>
        public async Task<Result> ApplyAsync(string json, string apiPath, string? jellyfinUserId, CancellationToken requestAborted = default)
        {
            if (string.IsNullOrEmpty(json))
            {
                return new Result(false, json);
            }

            // Classify first: paths that carry no titles cost nobody a policy lookup.
            var plan = ClassifyPath(apiPath);
            if (plan.Category == Category.None || !TryGetRestrictedPolicy(jellyfinUserId, out var policy))
            {
                return new Result(false, json);
            }

            try
            {
                switch (plan.Category)
                {
                    case Category.List:
                        // Similar / recommendations of a blocked title expose nothing of it.
                        if (plan.ParentId > 0 && plan.MediaType != null
                            && await IsTitleBlockedAsync(plan.MediaType, plan.ParentId, policy, requestAborted).ConfigureAwait(false))
                        {
                            return new Result(true, json);
                        }

                        var (filtered, retryLater) = await _lists.FilterListAsync(json, plan, policy, Region(), requestAborted).ConfigureAwait(false);
                        return new Result(false, filtered, retryLater);

                    case Category.Detail:
                        return new Result(IsDetailBodyBlocked(json, plan.MediaType!, policy), json);

                    case Category.SubResource:
                        return new Result(await IsTitleBlockedAsync(plan.MediaType!, plan.ParentId, policy, requestAborted).ConfigureAwait(false), json);

                    case Category.NestedDetail:
                        // e.g. /api/v1/issue/{id}: the title sits under `media`.
                        return new Result(await IsNestedMediaBlockedAsync(json, policy, requestAborted).ConfigureAwait(false), json);

                    default:
                        return new Result(false, json);
                }
            }
            catch (OperationCanceledException) when (requestAborted.IsCancellationRequested)
            {
                throw; // the browser went away; nothing to answer
            }
            catch (Exception ex)
            {
                // Never fail open on an unexpected error for a restricted user.
                _logger.Warning($"Parental filter failed for {apiPath}: {ex.Message}");
                return new Result(true, json);
            }
        }

        /// <summary>
        /// Whether a single title is blocked for the caller (request POSTs, TMDB
        /// passthrough). False for unrestricted users without any lookup.
        /// </summary>
        /// <param name="mediaType">"movie" or "tv" (anything else is not rating-gated).</param>
        /// <param name="tmdbId">The TMDB id of the title.</param>
        /// <param name="jellyfinUserId">The calling Jellyfin user.</param>
        /// <param name="requestAborted">Stops the lookup when the caller has gone away.</param>
        /// <returns>True when the title must be refused to this user.</returns>
        public async Task<bool> IsBlockedAsync(string? mediaType, int tmdbId, string? jellyfinUserId, CancellationToken requestAborted = default)
        {
            var type = NormalizeMediaType(mediaType);
            if (type == null || tmdbId <= 0 || !TryGetRestrictedPolicy(jellyfinUserId, out var policy))
            {
                return false;
            }

            try
            {
                return await IsTitleBlockedAsync(type, tmdbId, policy, requestAborted).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.Warning($"Parental filter lookup failed for {type}/{tmdbId}: {ex.Message}");
                return true;
            }
        }

        /// <summary>
        /// Recognises TMDB passthrough paths that expose a single title
        /// ("movie/123", "tv/123/season/1", ...) so the caller can gate them.
        /// </summary>
        public static bool TryParseTmdbTitlePath(string? tmdbApiPath, out string mediaType, out int tmdbId)
            => SeerrEndpointClassifier.TryParseTmdbTitlePath(tmdbApiPath, out mediaType, out tmdbId);

        /// <summary>How a restricted user may use a TMDB passthrough path.</summary>
        public enum TmdbAccess
        {
            /// <summary>Title-free lookup: forwarded as-is.</summary>
            Allow,
            /// <summary>A single title's own data: forwarded only if that title is allowed.</summary>
            GateTitle,
            /// <summary>Would return other titles unfiltered: refused.</summary>
            Deny
        }

        /// <summary>
        /// Classifies a TMDB passthrough path for a restricted user: title-free
        /// lookups the client needs are allowed, single-title lookups are gated on
        /// that title, everything else (search, discover, trending, lists...) is
        /// denied because it would return titles unfiltered.
        /// </summary>
        public static TmdbAccess ClassifyTmdbPassthrough(string? tmdbApiPath, out string mediaType, out int tmdbId)
            => SeerrEndpointClassifier.ClassifyTmdbPassthrough(tmdbApiPath, out mediaType, out tmdbId);

        private bool IsDetailBodyBlocked(string json, string mediaType, Policy policy)
        {
            JsonElement detail;
            try
            {
                using var doc = JsonDocument.Parse(json);
                detail = doc.RootElement.Clone();
            }
            catch (JsonException)
            {
                return true;
            }

            if (detail.ValueKind != JsonValueKind.Object)
            {
                return true;
            }

            if (detail.TryGetProperty("adult", out var adult) && adult.ValueKind == JsonValueKind.True)
            {
                return true;
            }

            // The detail body already carries the certification: score it directly
            // and seed the cache so list rows for this title need no fetch.
            var region = Region();
            // Seerr detail bodies carry certification AND (normally) keywords/genres;
            // without a keyword container the tags stay unknown rather than empty.
            var resolved = _signatures.SignatureFromDetail(detail, mediaType, region, includeTags: SeerrTagSignatureExtractor.HasKeywordData(detail));
            if (detail.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.Number && idEl.TryGetInt32(out var tmdbId))
            {
                _signatures.StoreSignature(CacheKey(mediaType, tmdbId, region), resolved, DateTime.UtcNow, CacheTtl());
            }

            return !IsAllowed(resolved, mediaType, policy);
        }

        private async Task<bool> IsNestedMediaBlockedAsync(string json, Policy policy, CancellationToken requestAborted)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != JsonValueKind.Object
                    || !doc.RootElement.TryGetProperty("media", out var media)
                    || media.ValueKind != JsonValueKind.Object)
                {
                    return false; // no title in the body -> nothing to leak
                }

                var mediaType = NormalizeMediaType(media.TryGetProperty("mediaType", out var mt) && mt.ValueKind == JsonValueKind.String ? mt.GetString() : null);
                if (mediaType == null || !media.TryGetProperty("tmdbId", out var idEl) || idEl.ValueKind != JsonValueKind.Number || !idEl.TryGetInt32(out var tmdbId))
                {
                    return true; // a title we cannot identify cannot be verified
                }

                return await IsTitleBlockedAsync(mediaType, tmdbId, policy, requestAborted).ConfigureAwait(false);
            }
            catch (JsonException)
            {
                return true;
            }
        }

        private async Task<bool> IsTitleBlockedAsync(string mediaType, int tmdbId, Policy policy, CancellationToken requestAborted = default)
        {
            if (tmdbId <= 0)
            {
                return true;
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(requestAborted);
            cts.CancelAfter(OverallBudget);
            var resolved = await _signatures.GetSignatureAsync(mediaType, tmdbId, Region(), policy.HasTagRules, cts.Token).ConfigureAwait(false);
            return !IsAllowed(resolved, mediaType, policy);
        }

    }
}
