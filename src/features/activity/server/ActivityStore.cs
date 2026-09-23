using System;
using System.IO;
using System.Linq;
using Newtonsoft.Json;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>Owns server-wide activity persistence and its process-wide write lock.</summary>
    internal sealed class ActivityStore
    {
        private readonly string _configBaseDir;
        private readonly Logger _logger;

        internal ActivityStore(string configBaseDir, Logger logger)
        {
            _configBaseDir = configBaseDir;
            _logger = logger;
        }

        private static readonly object _activityFileLock = new object();
        private static readonly JsonSerializerSettings _activityReadSettings = new JsonSerializerSettings { CheckAdditionalContent = true };

        // Bounds activity.json's growth on a busy, long-running server -- the
        // Activity Feed only ever shows the newest handful anyway, so entries
        // beyond this are pure dead weight.
        private const int MaxActivityEntries = 500;

        private string ActivityFilePath => Path.Combine(_configBaseDir, "activity.json");

        private AllActivityStore ReadActivityStoreUnlocked(bool throwOnCorruption = false)
        {
            var filePath = ActivityFilePath;
            if (!File.Exists(filePath)) return new AllActivityStore();

            try
            {
                var json = File.ReadAllText(filePath);
                if (string.IsNullOrWhiteSpace(json))
                    throw new InvalidDataException("activity.json is empty.");
                // Populate with no default dictionary so a missing Entries
                // property is rejected instead of silently becoming empty.
                var store = new AllActivityStore { Entries = null! };
                JsonConvert.PopulateObject(json, store, _activityReadSettings);
                if (store.Entries == null || store.Entries.Values.Any(entry => entry == null))
                    throw new InvalidDataException("activity.json contains an invalid activity store.");
                return store;
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to read shared activity.json: {ex.Message}");
                // Keep the original file intact for recovery. A failed read
                // must never turn the next event into a destructive reset.
                if (throwOnCorruption) throw;
                return new AllActivityStore();
            }
        }

        private void WriteActivityStoreUnlocked(AllActivityStore store)
        {
            var temporaryPath = ActivityFilePath + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                // Prune oldest-first once over the cap, same trim point every
                // write so the file can't creep up unbounded between prunes.
                if (store.Entries.Count > MaxActivityEntries)
                {
                    var toDrop = store.Entries
                        .OrderBy(kvp => kvp.Value.OccurredAt, StringComparer.Ordinal)
                        .Take(store.Entries.Count - MaxActivityEntries)
                        .Select(kvp => kvp.Key)
                        .ToList();
                    foreach (var key in toDrop) store.Entries.Remove(key);
                }

                var json = JsonConvert.SerializeObject(store, Formatting.Indented);
                // The temporary file is on the same filesystem as the store.
                // Readers see either complete version if writing is interrupted.
                using (var stream = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    using (var writer = new StreamWriter(stream, new System.Text.UTF8Encoding(false), 4096, leaveOpen: true))
                    {
                        writer.Write(json);
                    }
                    stream.Flush(flushToDisk: true);
                }
                File.Move(temporaryPath, ActivityFilePath, overwrite: true);
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save shared activity.json: {ex.Message}");
                throw;
            }
            finally
            {
                try { File.Delete(temporaryPath); }
                catch (IOException ex) { _logger.Warning($"Failed to clean up temporary activity file: {ex.Message}"); }
                catch (UnauthorizedAccessException ex) { _logger.Warning($"Failed to clean up temporary activity file: {ex.Message}"); }
            }
        }

        /// Reads the server-wide activity store from the shared activity.json file.
        public AllActivityStore GetAllActivity()
        {
            lock (_activityFileLock)
            {
                return ReadActivityStoreUnlocked();
            }
        }

        /// <summary>
        /// Records a watched/favorited activity entry for a user+item.
        /// Re-watching updates OccurredAt. Favorites keep their original
        /// timestamp until removed, so unrelated user-data saves cannot
        /// invent a new favorite event. Re-favoriting after removal resurfaces it.
        /// </summary>
        public void RecordActivity(string userIdN, string itemIdN, string activityType, string nowIso, bool completed = false, double progress = 0)
        {
            lock (_activityFileLock)
            {
                var store = ReadActivityStoreUnlocked(throwOnCorruption: true);
                var key = $"{userIdN}:{itemIdN}:{activityType}";
                // Completed and Progress never downgrade: a later partial
                // re-watch of something already finished (or watched
                // further) once shouldn't erase that.
                store.Entries.TryGetValue(key, out var existing);
                if (existing != null && activityType == Services.ActivityService.ActivityTypeFavorited) return;
                var wasCompleted = existing?.Completed == true;
                var priorProgress = existing?.Progress ?? 0;
                store.Entries[key] = new ActivityEntry
                {
                    UserId = userIdN,
                    ItemId = itemIdN,
                    ActivityType = activityType,
                    OccurredAt = nowIso,
                    Completed = completed || wasCompleted,
                    Progress = Math.Max(priorProgress, progress)
                };
                WriteActivityStoreUnlocked(store);
            }
        }

        /// <summary>
        /// Removes an activity entry (e.g. on unfavorite, so the feed doesn't
        /// keep showing something the user un-did). No-op if it isn't there.
        /// </summary>
        public void RemoveActivity(string userIdN, string itemIdN, string activityType)
        {
            lock (_activityFileLock)
            {
                var store = ReadActivityStoreUnlocked(throwOnCorruption: true);
                var key = $"{userIdN}:{itemIdN}:{activityType}";
                if (!store.Entries.Remove(key)) return;
                WriteActivityStoreUnlocked(store);
            }
        }

    }
}
