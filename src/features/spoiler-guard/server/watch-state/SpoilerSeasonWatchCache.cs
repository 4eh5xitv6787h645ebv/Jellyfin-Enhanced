using System.Collections.Concurrent;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Owns the season watched cache and its user-data event subscription for the filter lifetime.
    /// </summary>
    internal sealed class SpoilerSeasonWatchCache : IDisposable
    {
        private readonly IUserDataManager _userDataManager;
        private readonly SpoilerUserResolver _resolver;
        private readonly Logger _logger;

        internal SpoilerSeasonWatchCache(IUserDataManager userDataManager, SpoilerUserResolver resolver, Logger logger)
        {
            _userDataManager = userDataManager;
            _resolver = resolver;
            _logger = logger;
            _userDataManager.UserDataSaved += OnUserDataSaved;
        }

        // Per-(user, season) "any episode watched?" cache. Home-page rows can
        // request the same season's Primary + Backdrop + Thumb in quick
        // succession; without caching we'd hit the library DB three times for
        // the same answer. The cache TTL is short because a user marking an
        // episode watched should flip the season's poster from blurred to
        // clear on next page load — too long a TTL means stale state. 30s is
        // long enough to cover a full home-page render but short enough that
        // mark-watched → next-navigation roundtrips see fresh data.
        private static readonly TimeSpan SeasonWatchedCacheTtl = TimeSpan.FromSeconds(30);

        private sealed class WatchedCacheEntry
        {
            public required bool AnyWatched { get; init; }
            public required DateTime ExpiresAt { get; init; }
        }

        private static readonly ConcurrentDictionary<string, WatchedCacheEntry> _watchedCache = new();

        private void OnUserDataSaved(object? sender, MediaBrowser.Controller.Library.UserDataSaveEventArgs e)
        {
            // Dispatch off the IUserDataManager publish thread. Other
            // UserDataSaved consumers (resume tracking, scheduled tasks,
            // integrations) share that thread; a malicious user
            // burst-toggling Played would otherwise pile up synchronous
            // O(K) cache scans on the publish path. Task.Run drops the
            // work onto the threadpool — fire-and-forget is safe because
            // a missed eviction just leaves stale cache for ≤30s (TTL).
            if (e?.Item == null || e.UserId == Guid.Empty) return;

            // Snapshot the values we need so the lambda captures don't
            // race against post-event mutation.
            var userId = e.UserId;
            Guid? seasonId = null;
            Guid? seriesId = null;
            switch (e.Item)
            {
                case Episode ep:
                    seasonId = ep.SeasonId;
                    seriesId = ep.SeriesId;
                    break;
                case Season s:
                    seasonId = s.Id;
                    seriesId = s.SeriesId;
                    break;
                case Series ser:
                    seriesId = ser.Id;
                    break;
                // Explicit Movie no-op. The Movie image path doesn't use
                // _watchedCache (it reads UserData.Played directly per
                // request), so there's nothing to invalidate here. Listed
                // for future-proofing — if a movie-level server cache is
                // added later, this is the hook.
                case MediaBrowser.Controller.Entities.Movies.Movie:
                    return;
            }

            if (!seasonId.HasValue && !seriesId.HasValue) return;

            // Per-(user, scope) coalesce. A "Mark season watched" sweep on
            // a 24-episode season fires 24 events → 24 queued threadpool
            // tasks all racing the same _watchedCache; coalescing per-user
            // only would collapse cross-season events (seasons A and B for
            // the same user collide and drop B's eviction). Keyed by
            // (userId, scopeId) where scopeId is seasonId for
            // episode/season events and seriesId for series events.
            // Same-season repeats coalesce; cross-season events each get
            // their own dispatch.
            var scopeId = seasonId.HasValue && seasonId.Value != Guid.Empty
                ? seasonId.Value
                : seriesId!.Value;
            var dedupKey = (userId, scopeId);
            if (!_pendingInvalidations.TryAdd(dedupKey, 0))
            {
                return;
            }

            // Protect the dispatcher itself. If Task.Run throws
            // synchronously (OOM, threadpool denial-of-service), the
            // lambda's `finally` never runs — the dedup key would stay
            // in the dictionary forever and that scope's events would
            // be silently dropped until process restart. Catch + remove.
            try
            {
                Task.Run(() =>
                {
                    try
                    {
                        // Instance-field _disposed read at execution time
                        // so post-Dispose lambdas no-op fast.
                        if (_disposed) return;
                        if (seasonId.HasValue && seasonId.Value != Guid.Empty)
                        {
                            var key = userId.ToString("N") + ":" + seasonId.Value.ToString("N");
                            // Surface eviction-key-mismatch as a debug
                            // breadcrumb. If a future refactor desyncs the
                            // build-key from the read-key, evictions
                            // silently become no-ops; counting the
                            // no-removal cases makes that observable.
                            if (!_watchedCache.TryRemove(key, out _))
                            {
                                // Hit may not exist (cold cache); not an error.
                                // _logger.Info($"[SpoilerBlur] UserDataSaved: no cache entry for season key {key} (cold cache or already evicted).");
                            }
                        }
                        else if (seriesId.HasValue && seriesId.Value != Guid.Empty)
                        {
                            // Series-level event — invalidate every cached season
                            // for this user (keys are "{userN}:{seasonN}", so we
                            // iterate). Cheap: cache is small (≤512) and this is
                            // rare. ToArray so the snapshot survives a concurrent
                            // insert and future framework changes to Keys.
                            var prefix = userId.ToString("N") + ":";
                            foreach (var k in _watchedCache.Keys.ToArray())
                            {
                                if (k.StartsWith(prefix, StringComparison.Ordinal))
                                    _watchedCache.TryRemove(k, out _);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _resolver.WarnRateLimited(
                            "userdata-saved-handler:" + ex.GetType().FullName,
                            $"Spoiler Guard: failed to invalidate season cache on UserDataSaved: {ex.Message}");
                    }
                    finally
                    {
                        _pendingInvalidations.TryRemove(dedupKey, out _);
                    }
                });
            }
            catch (Exception ex)
            {
                // Synchronous Task.Run failure (rare). Release the dedup
                // slot so subsequent events for this scope can dispatch
                // again, and surface the failure with rate-limited warn.
                _pendingInvalidations.TryRemove(dedupKey, out _);
                _resolver.WarnRateLimited(
                    "userdata-saved-dispatch:" + ex.GetType().FullName,
                    $"Spoiler Guard: Task.Run dispatch threw synchronously: {ex.Message}");
            }
        }

        // Per-(user, scope) dedup gate for the OnUserDataSaved Task.Run
        // dispatch. Scope is seasonId for episode/season events, seriesId
        // for series events. Static so a hot-reload preserves the dedup
        // state across plugin instances (matches _watchedCache,
        // _warnedShapeAt pattern in this file).
        private static readonly ConcurrentDictionary<(Guid, Guid), byte> _pendingInvalidations = new();

        // Owned by the singleton filter and subscribed to
        // IUserDataManager.UserDataSaved. Without an unsubscribe path,
        // hot-reload / plugin disable+re-enable leaks the event handler
        // delegate (memory leak + double-fire on next event). DI containers
        // dispose Singletons at host shutdown; the plugin's OnUninstalling
        // also calls Dispose via the service provider.
        private bool _disposed;
        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            try
            {
                _userDataManager.UserDataSaved -= OnUserDataSaved;
            }
            catch (Exception ex)
            {
                _logger.Warning($"SpoilerBlurImageFilter: unsubscribe on Dispose threw: {ex.Message}");
            }
        }

        internal bool HasWatchedAnyEpisodeInSeason(JUser user, Season season)
        {
            var key = user.Id.ToString("N") + ":" + season.Id.ToString("N");
            var now = DateTime.UtcNow;
            if (_watchedCache.TryGetValue(key, out var hit) && hit.ExpiresAt > now)
            {
                return hit.AnyWatched;
            }

            bool anyWatched = false;
            bool determinationFailed = false;
            // Diagnostic counters kept for the commented _logger.Info below —
            // uncomment to troubleshoot unexpected blur/passthrough decisions.
            int total = 0, withUd = 0;
            try
            {
                // `shouldIncludeMissingEpisodes: false` skips episodes Jellyfin
                // has metadata for but no media file — they can't have been
                // "played", so iterating them just wastes work.
                foreach (var child in season.GetEpisodes(user, new MediaBrowser.Controller.Dto.DtoOptions(false), shouldIncludeMissingEpisodes: false))
                {
                    total++;
                    if (child is not Episode ep) continue;
                    var ud = _userDataManager.GetUserData(user, ep);
                    if (ud != null) withUd++;
                    if (ud?.Played == true)
                    {
                        anyWatched = true;
                        break;
                    }
                }
                // _logger.Info($"[seasondiag] season={season.Id} {season.Name} total={total} withUd={withUd} anyWatched={anyWatched}");
            }
            catch (Exception ex)
            {
                // Fail CLOSED (assume not watched → BLUR). The user opted
                // into spoiler protection for this series; defaulting to
                // pass-through on a transient DB-contention exception
                // can produce a real bug pattern: 24 simultaneous
                // season-image requests overwhelm GetEpisodes for the
                // late seasons in the burst, exceptions cache as
                // "watched" for 30s, and the user sees later seasons
                // unblurred until the cache TTL expires. If the user
                // enabled Spoiler Guard, they want blur on uncertainty,
                // not exposure.
                _resolver.WarnRateLimited(
                    "season-watched:" + ex.GetType().FullName,
                    $"Spoiler Guard: HasWatchedAnyEpisodeInSeason failed for season {season.Id} — failing CLOSED (blur). {ex.Message}");
                anyWatched = false;
                determinationFailed = true;
            }

            // Don't cache exception results. Caching a fail-open
            // `anyWatched=true` for 30s would make one transient DB
            // hiccup persist across the full TTL even after the
            // contention subsided. Only cache successful determinations;
            // let the next call retry, which under typical conditions
            // succeeds.
            if (!determinationFailed)
            {
                _watchedCache[key] = new WatchedCacheEntry
                {
                    AnyWatched = anyWatched,
                    ExpiresAt = now + SeasonWatchedCacheTtl,
                };
            }

            // Periodic eviction so the dictionary doesn't grow unbounded
            // across long server uptimes. Snapshot via ToArray so a
            // concurrent insert during the scan can't trip
            // InvalidOperationException — `ConcurrentDictionary` enumerator
            // only guarantees stable iteration when snapshotted.
            if (_watchedCache.Count > 512)
            {
                foreach (var kvp in _watchedCache.ToArray())
                {
                    if (kvp.Value.ExpiresAt < now) _watchedCache.TryRemove(kvp.Key, out _);
                }
            }

            return anyWatched;
        }

    }
}
