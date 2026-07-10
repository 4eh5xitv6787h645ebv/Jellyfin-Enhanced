using Microsoft.Extensions.Logging;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using Microsoft.Extensions.Hosting;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    // Promotes pending Spoiler Guard entries (UserSpoilerBlur.PendingTmdb) into
    // real Series/Movies entries when matching library items land via Seerr or
    // any other source. Hooks ILibraryManager.ItemAdded + ItemUpdated.
    //
    // Load discipline: library events fire in rapid bursts while a season is
    // importing (each episode add refreshes the parent Series, so one download
    // batch can raise dozens of Series ItemUpdated events in under a minute).
    // Everything here is therefore designed to stay OFF the scanner's hot path
    // and OFF the library database during those bursts:
    //
    //   1. _pendingUsersByKey maps "tv:{tmdb}"/"movie:{tmdb}" -> the set of
    //      users who actually have that key pending. A sweep only ever touches
    //      those users (usually exactly one) — never the whole user table.
    //   2. Sweeps are coalesced per key: one in-flight sweep at a time, a
    //      rerun flag for events that arrive mid-sweep, and a short settle
    //      delay so an import burst collapses into a single sweep instead of
    //      one library read + file RMW per event.
    //   3. Keys are UNREGISTERED once no user holds them anymore (promotion,
    //      user delete, or pending-DELETE endpoint), so a promoted show stops
    //      costing anything on subsequent library events. The gate is a pure
    //      performance optimization — per-user spoilerblur.json files remain
    //      the source of truth, and sweeps re-verify against them.
    //
    // Per-user library access is checked via GetItemById(id, user) — a user
    // who can't see the new item won't get the Spoiler Guard entry promoted
    // for them (they stay registered and are retried on later events), which
    // would otherwise be a UX bug (entry shows up in their management UI for
    // a title they can't access).
    public sealed class SpoilerSeerrPendingPromoter : IHostedService
    {
        // Populated on StartAsync from the per-user spoilerblur.json files and
        // kept in sync by the controller endpoints + the sweeps below.
        private sealed class PendingUserSet
        {
            public object SyncRoot { get; } = new object();
            public HashSet<Guid> Users { get; } = new HashSet<Guid>();
        }

        private static readonly ConcurrentDictionary<string, PendingUserSet> _pendingUsersByKey
            = new(StringComparer.OrdinalIgnoreCase);

        // Per-key sweep coalescing. _sweepRunning holds keys with an active
        // background sweep; _sweepRerun holds keys that saw another library
        // event while their sweep was running (or scheduled) and need one more
        // pass afterwards.
        private static readonly ConcurrentDictionary<string, byte> _sweepRunning
            = new(StringComparer.OrdinalIgnoreCase);
        private static readonly ConcurrentDictionary<string, byte> _sweepRerun
            = new(StringComparer.OrdinalIgnoreCase);

        // How long a scheduled sweep waits before running. Two purposes:
        // lets the burst of ItemAdded/ItemUpdated events a season import
        // fires coalesce into one sweep, and keeps our library reads away
        // from the exact moment the scanner is writing the item that raised
        // the event. Promotion is not latency-sensitive — the entry only
        // needs to flip before the user next browses the title.
        private const int SweepSettleDelayMs = 2000;

        // Exposed so the controller's POST/DELETE endpoints can keep the gate
        // accurate without coupling to the hosted-service instance.
        public static void RegisterPending(string pendingKey, Guid userId)
            => RegisterPendingCore(pendingKey, userId, afterLookup: null);

        // Deterministic concurrency seam used by the gate regression test. The
        // callback runs once after the outer entry lookup and before its lock.
        internal static void RegisterPendingWithLookupHookForTest(
            string pendingKey,
            Guid userId,
            Action afterLookup)
            => RegisterPendingCore(pendingKey, userId, afterLookup);

        private static void RegisterPendingCore(string pendingKey, Guid userId, Action? afterLookup)
        {
            if (string.IsNullOrEmpty(pendingKey) || userId == Guid.Empty) return;
            var invokedHook = false;
            while (true)
            {
                var users = _pendingUsersByKey.GetOrAdd(pendingKey, _ => new PendingUserSet());
                if (!invokedHook)
                {
                    invokedHook = true;
                    afterLookup?.Invoke();
                }

                lock (users.SyncRoot)
                {
                    // An unregister can detach an empty set after this thread's
                    // GetOrAdd but before the lock. Never add to that orphan: retry
                    // against the currently mapped set instead.
                    if (!_pendingUsersByKey.TryGetValue(pendingKey, out var current)
                        || !ReferenceEquals(current, users))
                    {
                        continue;
                    }

                    users.Users.Add(userId);
                    return;
                }
            }
        }

        public static void UnregisterPending(string pendingKey, Guid userId)
        {
            if (string.IsNullOrEmpty(pendingKey) || userId == Guid.Empty) return;
            while (_pendingUsersByKey.TryGetValue(pendingKey, out var users))
            {
                lock (users.SyncRoot)
                {
                    if (!_pendingUsersByKey.TryGetValue(pendingKey, out var current)
                        || !ReferenceEquals(current, users))
                    {
                        continue;
                    }

                    users.Users.Remove(userId);
                    if (users.Users.Count == 0)
                    {
                        ((ICollection<KeyValuePair<string, PendingUserSet>>)_pendingUsersByKey)
                            .Remove(new KeyValuePair<string, PendingUserSet>(pendingKey, users));
                    }
                    return;
                }
            }
        }

        internal static bool IsPendingRegisteredForTest(string pendingKey, Guid userId)
        {
            while (_pendingUsersByKey.TryGetValue(pendingKey, out var users))
            {
                lock (users.SyncRoot)
                {
                    if (!_pendingUsersByKey.TryGetValue(pendingKey, out var current)
                        || !ReferenceEquals(current, users))
                    {
                        continue;
                    }
                    return users.Users.Contains(userId);
                }
            }
            return false;
        }

        private readonly ILibraryManager _libraryManager;
        private readonly IUserManager _userManager;
        private readonly UserConfigurationManager _configManager;
        private readonly IPluginConfigProvider _configProvider;
        private readonly IApplicationPaths _appPaths;
        private readonly ILogger<SpoilerSeerrPendingPromoter> _logger;

        public SpoilerSeerrPendingPromoter(
            ILibraryManager libraryManager,
            IUserManager userManager,
            UserConfigurationManager configManager,
            IPluginConfigProvider configProvider,
            IApplicationPaths appPaths,
            ILogger<SpoilerSeerrPendingPromoter> logger)
        {
            _libraryManager = libraryManager;
            _userManager = userManager;
            _configManager = configManager;
            _configProvider = configProvider;
            _appPaths = appPaths;
            _logger = logger;
        }

        public Task StartAsync(CancellationToken cancellationToken)
        {
            // Repopulate the in-memory gate from disk so a restart doesn't
            // silently break promotion for users with already-pending entries.
            try
            {
                ScanExistingPendingKeys();
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"SpoilerSeerrPromoter: startup scan failed (gate may miss already-pending entries until next write): {ex.Message}");
            }
            _libraryManager.ItemAdded += OnItemAdded;
            // ItemAdded fires before Jellyfin's TMDB provider has fetched
            // metadata — ProviderIds.Tmdb is typically empty at that moment.
            // ItemUpdated fires after metadata refresh, at which point
            // ProviderIds.Tmdb is populated, so we re-run the same logic.
            // The sweep is idempotent (gate + ContainsKey checks) so the
            // double-fire on items that arrive with metadata already in
            // place is harmless.
            _libraryManager.ItemUpdated += OnItemAdded;
            return Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken cancellationToken)
        {
            _libraryManager.ItemAdded -= OnItemAdded;
            _libraryManager.ItemUpdated -= OnItemAdded;
            return Task.CompletedTask;
        }

        // Best-effort startup scan — corrupt or missing files are skipped on
        // purpose: the gate is a performance optimization, not a correctness
        // invariant.
        private void ScanExistingPendingKeys()
        {
            var baseDir = Path.Combine(
                _appPaths.PluginsPath, "configurations", "Jellyfin.Plugin.JellyfinEnhanced");
            if (!Directory.Exists(baseDir)) return;

            int users = 0, keys = 0;
            foreach (var userDir in Directory.EnumerateDirectories(baseDir))
            {
                // Per-user dirs are named with the N-format user GUID; skip
                // anything else (stale dirs, unrelated folders).
                var dirName = Path.GetFileName(userDir);
                if (!Guid.TryParseExact(dirName, "N", out var userId)) continue;

                var path = Path.Combine(userDir, SpoilerBlurImageFilter.SpoilerBlurFileName);
                if (!File.Exists(path)) continue;
                users++;
                try
                {
                    var json = File.ReadAllText(path);
                    if (string.IsNullOrWhiteSpace(json)) continue;
                    var node = PersistedJson.ParseNode(json);
                    var state = PersistedJson.StripNullMembers(node) is JsonNode stripped
                        ? stripped.Deserialize<UserSpoilerBlur>(PersistedJson.ReadOptions)
                        : null;
                    if (state?.PendingTmdb == null) continue;
                    foreach (var key in state.PendingTmdb.Keys)
                    {
                        if (string.IsNullOrEmpty(key)) continue;
                        RegisterPending(key, userId);
                        keys++;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"SpoilerSeerrPromoter: skipping unreadable {path}: {ex.GetType().Name}");
                }
            }
            if (keys > 0)
            {
                _logger.LogInformation($"SpoilerSeerrPromoter: gate primed with {keys} pending key(s) across {users} user file(s)");
            }
        }

        private void OnItemAdded(object? sender, ItemChangeEventArgs e)
        {
            try
            {
                var cfg = _configProvider.ConfigurationOrNull;
                if (cfg?.SpoilerBlurEnabled != true) return;

                var item = e?.Item;
                if (item is not Series && item is not Movie) return;

                if (item.ProviderIds == null
                    || !item.ProviderIds.TryGetValue("Tmdb", out var tmdbId)
                    || string.IsNullOrEmpty(tmdbId))
                {
                    return;
                }
                var mediaType = item is Series ? "tv" : "movie";
                var pendingKey = $"{mediaType}:{tmdbId}";

                // Fast-path gate: if NO user has this key pending, we're done —
                // this is the path every library event for non-pending items
                // takes, so it must stay allocation- and I/O-free.
                if (!_pendingUsersByKey.ContainsKey(pendingKey)) return;

                ScheduleSweep(pendingKey, item.Id, item.Name ?? string.Empty, item is Series);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"SpoilerSeerrPromoter: handler failed before scheduling: {ex.Message}");
            }
        }

        // Coalesced background sweep scheduler. At most one sweep per key runs
        // at a time; events that arrive while one is running (or settling) set
        // the rerun flag and are folded into a single follow-up pass. This is
        // what keeps a rapid-fire episode import (Series ItemUpdated storms)
        // from turning into dozens of concurrent library reads + file RMWs
        // racing the scanner.
        private void ScheduleSweep(string pendingKey, Guid itemId, string itemName, bool isSeries)
        {
            _sweepRerun[pendingKey] = 0;
            if (!_sweepRunning.TryAdd(pendingKey, 0)) return; // active sweep picks up the rerun flag

            _ = Task.Run(async () =>
            {
                try
                {
                    await Task.Delay(SweepSettleDelayMs).ConfigureAwait(false);
                    while (_sweepRerun.TryRemove(pendingKey, out _))
                    {
                        SweepPendingUsers(pendingKey, itemId, itemName, isSeries);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"SpoilerSeerrPromoter: sweep for {pendingKey} failed: {ex.Message}");
                }
                finally
                {
                    _sweepRunning.TryRemove(pendingKey, out _);
                    // Late-arrival race: an event may have set the rerun flag
                    // after the loop's last check but before the running flag
                    // cleared. Reschedule so it isn't lost.
                    if (_sweepRerun.ContainsKey(pendingKey) && _pendingUsersByKey.ContainsKey(pendingKey))
                    {
                        ScheduleSweep(pendingKey, itemId, itemName, isSeries);
                    }
                }
            });
        }

        private void SweepPendingUsers(string pendingKey, Guid itemId, string itemName, bool isSeries)
        {
            if (!_pendingUsersByKey.TryGetValue(pendingKey, out var users)) return;

            Guid[] userSnapshot;
            lock (users.SyncRoot)
            {
                if (!_pendingUsersByKey.TryGetValue(pendingKey, out var current)
                    || !ReferenceEquals(current, users))
                {
                    return;
                }
                userSnapshot = users.Users.ToArray();
            }

            foreach (var userId in userSnapshot)
            {
                try
                {
                    PromoteForUser(userId, itemId, pendingKey, itemName, isSeries);
                }
                catch (Exception ex)
                {
                    // Keep the user registered so a later event retries them.
                    _logger.LogWarning($"SpoilerSeerrPromoter: per-user promotion failed for user {userId} on {pendingKey}: {ex.Message}");
                }
            }
        }

        private enum PromotionOutcome
        {
            Promoted,      // pending row consumed (or already promoted earlier)
            NotPending,    // user deleted / file no longer has the key
            StillPending,  // user can't see the item yet — retry on later events
        }

        private PromotionOutcome PromoteForUser(Guid userId, Guid itemId, string pendingKey, string itemName, bool isSeries)
        {
            var jUser = _userManager.GetUserById(userId);
            if (jUser == null)
            {
                UnregisterPending(pendingKey, userId);
                return PromotionOutcome.NotPending;
            }

            // Library-access gate: if the user can't see the item (filtered
            // by library access), don't promote — they'd never see a card
            // for it but would see a stranded entry in management UI.
            BaseItem? visibleItem;
            try
            {
                visibleItem = _libraryManager.GetItemById<BaseItem>(itemId, jUser);
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"SpoilerSeerrPromoter: GetItemById({itemId},{userId}) threw {ex.GetType().Name}: {ex.Message}");
                return PromotionOutcome.StillPending;
            }
            if (visibleItem == null) return PromotionOutcome.StillPending;

            var userKey = userId.ToString("N");
            var fileName = SpoilerBlurImageFilter.SpoilerBlurFileName;
            var itemKey = itemId.ToString("N");

            try
            {
                var stillHadPending = new[] { false };
                lock (_configManager.GetUserFileLock(userKey, fileName))
                {
                    _configManager.RmwUserConfiguration<UserSpoilerBlur>(
                        userKey, fileName, state =>
                        {
                            if (!state.PendingTmdb.Remove(pendingKey)) return 0;
                            stillHadPending[0] = true;
                            if (isSeries)
                            {
                                if (state.Series.ContainsKey(itemKey)) return 1;
                                state.Series[itemKey] = new SpoilerBlurSeriesEntry
                                {
                                    SeriesId = itemKey,
                                    SeriesName = itemName,
                                    EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                                };
                            }
                            else
                            {
                                if (state.Movies.ContainsKey(itemKey)) return 1;
                                state.Movies[itemKey] = new SpoilerBlurMovieEntry
                                {
                                    MovieId = itemKey,
                                    MovieName = itemName,
                                    EnabledAt = DateTime.UtcNow.ToString("o", System.Globalization.CultureInfo.InvariantCulture),
                                };
                            }
                            return 1;
                        });

                    // Whether promoted or already absent, the authoritative file
                    // no longer has this key. Reconcile before releasing its lock.
                    UnregisterPending(pendingKey, userId);
                }
                if (stillHadPending[0])
                {
                    _logger.LogInformation($"SpoilerSeerrPromoter: promoted {pendingKey} -> {(isSeries ? "series" : "movie")} {itemKey} for user {userId}");
                    return PromotionOutcome.Promoted;
                }
                // File no longer holds the key (promoted via the controller's
                // TOCTOU path, or removed by the user) — nothing to do.
                return PromotionOutcome.NotPending;
            }
            catch (InvalidDataException ex)
            {
                _logger.LogWarning($"SpoilerSeerrPromoter: skipping {userId}/{pendingKey} due to corrupt spoilerblur.json: {ex.Message}");
                // Keep the user registered so a repaired or recreated file can
                // recover on a later event.
                return PromotionOutcome.StillPending;
            }
        }
    }
}
