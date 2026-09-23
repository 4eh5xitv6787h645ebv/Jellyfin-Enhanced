using System;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using System.Collections.Concurrent;
using MediaBrowser.Model.Globalization;
using Signature = Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalSignature;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrResponseReader;
using static Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalMetadataClient;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Owns signature resolution, fetch coalescing, tag upgrades, and bounded positive/negative caches.</summary>
    internal sealed class SeerrSignatureProvider
    {
        private const int MaxCacheEntries = 20000;
        // Failed verification is retried sooner than a successfully resolved rating.
        private static readonly TimeSpan NegativeCacheTtl = TimeSpan.FromMinutes(5);
        internal static TimeSpan CacheTtl() => TimeSpan.FromHours(24);
        private readonly SeerrParentalMetadataClient _metadata;
        private readonly ILocalizationManager _localization;
        private readonly Logger _logger;

        internal SeerrSignatureProvider(IHttpClientFactory httpClientFactory, ILocalizationManager localization, Logger logger)
        {
            _metadata = new SeerrParentalMetadataClient(httpClientFactory, logger);
            _localization = localization;
            _logger = logger;
        }

        // Resolved signature per "{mediaType}:{tmdbId}:{region}" — user-neutral.
        // Unresolved = the fetch failed (negative entry, short TTL); Sig with a null
        // Score and Unresolved false = fetched fine but the title is unrated.
        private readonly ConcurrentDictionary<string, (Signature? Sig, bool Unresolved, DateTime CachedAt)> _certCache = new(StringComparer.Ordinal);

        // Titles whose *tag* upgrade recently failed while a good rating-only entry
        // exists: tag-rule callers get "unverified" (hidden) without re-fetching
        // until NegativeCacheTtl passes; rating-only callers are unaffected.
        private readonly ConcurrentDictionary<string, DateTime> _tagFetchFailedAt = new(StringComparer.Ordinal);

        // Coalesces concurrent fetches of the same title (tag-bearing and
        // rating-only fetches coalesce separately: a rating-only fetch in flight
        // cannot satisfy a caller with tag rules).
        private readonly ConcurrentDictionary<string, Lazy<Task<Signature?>>> _inFlight = new(StringComparer.Ordinal);

        // ── Score resolution (cache -> in-flight -> fetch) ───────────────────

        /// <summary>
        /// Answers from the cache when it can: a fresh positive entry that satisfies
        /// the caller (tag data present when tag rules are active), or a fresh
        /// negative entry (null = still unverified). False = a fetch is needed.
        /// </summary>
        internal bool TryGetFreshSignature(string key, bool needTags, out Signature? signature)
        {
            signature = null;
            if (_certCache.TryGetValue(key, out var cached))
            {
                var age = DateTime.UtcNow - cached.CachedAt;
                if (cached.Unresolved)
                {
                    if (age < NegativeCacheTtl)
                    {
                        return true; // recently failed to verify -> still hidden, no refetch
                    }
                }
                else if (age < CacheTtl() && (!needTags || cached.Sig?.Keywords != null))
                {
                    // A rating-only entry can't satisfy a tag-rule caller; fall through to fetch.
                    signature = cached.Sig;
                    return true;
                }
            }

            if (needTags && _tagFetchFailedAt.TryGetValue(key, out var failedAt))
            {
                if (DateTime.UtcNow - failedAt < NegativeCacheTtl)
                {
                    return true; // tag data recently unavailable -> hidden for tag-rule users, no refetch
                }

                _tagFetchFailedAt.TryRemove(key, out _);
            }

            return false;
        }

        internal async Task<Signature?> GetSignatureAsync(string mediaType, int tmdbId, string region, bool needTags, CancellationToken ct)
        {
            var key = CacheKey(mediaType, tmdbId, region);
            if (TryGetFreshSignature(key, needTags, out var fresh))
            {
                return fresh;
            }

            // Coalesce concurrent fetches. The shared task carries its own timeout;
            // each caller bounds only its own wait, so one request's budget can't
            // cancel a fetch another request depends on.
            var inFlightKey = needTags ? key + "|tags" : key;
            var lazy = _inFlight.GetOrAdd(inFlightKey, _ => new Lazy<Task<Signature?>>(
                () => FetchAndCacheAsync(inFlightKey, key, mediaType, tmdbId, region, needTags),
                LazyThreadSafetyMode.ExecutionAndPublication));

            try
            {
                return await lazy.Value.WaitAsync(ct).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                // Over budget or fetch faulted -> cannot verify -> fail closed.
                if (ex is not OperationCanceledException)
                {
                    _logger.Debug($"Parental filter: lookup for {mediaType}/{tmdbId} failed: {ex.Message}");
                }

                return null;
            }
        }

        private async Task<Signature?> FetchAndCacheAsync(string inFlightKey, string key, string mediaType, int tmdbId, string region, bool needTags)
        {
            try
            {
                JsonElement? detail = null;
                var hasTagData = false;
                try
                {
                    using var cts = new CancellationTokenSource(PerFetchTimeout);
                    (detail, hasTagData) = await _metadata.FetchDetailAsync(mediaType, tmdbId, needTags, cts.Token).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    // Timeouts and transport faults count as "could not verify" too.
                    _logger.Debug($"Parental filter: lookup failed for {mediaType}/{tmdbId}: {ex.Message}");
                }

                var now = DateTime.UtcNow;
                var ttl = CacheTtl();
                if (detail == null)
                {
                    if (needTags)
                    {
                        _tagFetchFailedAt[key] = now;
                    }

                    // Negative entry (retried after NegativeCacheTtl) — unless a fresh
                    // positive entry exists, which a failed *tag* upgrade must not erase:
                    // rating-only users would otherwise lose a title Seerr merely
                    // failed to answer for a moment.
                    _certCache.AddOrUpdate(
                        key,
                        _ => (null, true, now),
                        (_, current) => !current.Unresolved && current.Sig != null && now - current.CachedAt < ttl
                            ? current
                            : (null, true, now));
                    TrimCache();
                    return null;
                }

                var resolved = SignatureFromDetail(detail.Value, mediaType, region, includeTags: hasTagData);
                if (hasTagData)
                {
                    _tagFetchFailedAt.TryRemove(key, out _);
                }

                StoreSignature(key, resolved, now, ttl);
                return resolved;
            }
            finally
            {
                _inFlight.TryRemove(inFlightKey, out _);
            }
        }

        private int _trimCounter;

        /// <summary>
        /// Caches a resolved signature. A rating-only refresh must not erase tags a
        /// concurrent full fetch just cached — but must not resurrect EXPIRED tags
        /// either (that would extend them another TTL and let an upstream keyword
        /// change bypass a tag-restricted user), so existing tags are kept only
        /// while the existing entry is itself still fresh.
        /// </summary>
        internal void StoreSignature(string key, Signature resolved, DateTime now, TimeSpan ttl)
        {
            _certCache.AddOrUpdate(
                key,
                _ => (resolved, false, now),
                (_, current) =>
                {
                    if (resolved.Keywords == null && current.Sig?.Keywords != null && !current.Unresolved && now - current.CachedAt < ttl)
                    {
                        return (resolved with { Keywords = current.Sig.Keywords, Genres = current.Sig.Genres }, false, now);
                    }

                    return (resolved, false, now);
                });
            TrimCache();
        }

        private void TrimCache()
        {
            // Cheap amortised maintenance: every 500 inserts drop expired entries,
            // and if the cache is still over its hard cap evict the oldest quarter.
            // (Gated on the counter alone: ConcurrentDictionary.Count takes every
            // bucket lock, far too much for a check on the fetch hot path.)
            if (Interlocked.Increment(ref _trimCounter) % 500 != 0)
            {
                return;
            }

            var now = DateTime.UtcNow;
            var ttl = CacheTtl();
            foreach (var kv in _certCache)
            {
                var limit = kv.Value.Unresolved ? NegativeCacheTtl : ttl;
                if (now - kv.Value.CachedAt > limit)
                {
                    _certCache.TryRemove(kv.Key, out _);
                }
            }

            foreach (var kv in _tagFetchFailedAt)
            {
                if (now - kv.Value > NegativeCacheTtl)
                {
                    _tagFetchFailedAt.TryRemove(kv.Key, out _);
                }
            }

            if (_certCache.Count >= MaxCacheEntries)
            {
                foreach (var kv in _certCache.OrderBy(kv => kv.Value.CachedAt).Take(MaxCacheEntries / 4).ToList())
                {
                    _certCache.TryRemove(kv.Key, out _);
                }
            }
        }

        internal Signature SignatureFromDetail(JsonElement detail, string mediaType, string region, bool includeTags)
        {
            string[]? keywords = null;
            string[]? genres = null;
            if (includeTags)
            {
                var extracted = SeerrTagSignatureExtractor.Extract(detail);
                keywords = extracted.Keywords.ToArray();
                genres = extracted.Genres.ToArray();
            }

            var cert = SeerrCertificationExtractor.Extract(detail, mediaType, region);
            if (string.IsNullOrWhiteSpace(cert.Certification))
            {
                return new Signature(null, null, keywords, genres); // known-unrated
            }

            try
            {
                var score = _localization.GetRatingScore(cert.Certification, cert.Iso ?? region);
                return score == null
                    ? new Signature(null, null, keywords, genres)
                    : new Signature(score.Score, score.SubScore, keywords, genres);
            }
            catch (Exception ex)
            {
                _logger.Debug($"Parental filter: could not score certification '{cert.Certification}' ({cert.Iso}): {ex.Message}");
                return new Signature(null, null, keywords, genres);
            }
        }

    }
}
