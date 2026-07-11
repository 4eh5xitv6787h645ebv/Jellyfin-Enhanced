using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Tests.TestDoubles;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services
{
    public sealed class TagCacheConcurrencyTests
    {
        [Fact]
        public void PublishRebuild_ReplaysIncrementalUpsert()
        {
            var dir = NewTempDir();
            try
            {
                using var service = NewService(dir);
                var key = Guid.NewGuid().ToString("N");

                service.BeginRebuildForTest();
                service.UpsertEntryForTest(key, new TagCacheEntry { Type = "Movie" });
                service.PublishRebuildForTest(new Dictionary<string, TagCacheEntry>());

                Assert.True(service.ContainsKeyForTest(key));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }

        [Fact]
        public void PublishRebuild_ReplaysIncrementalRemovalAsTombstone()
        {
            var dir = NewTempDir();
            try
            {
                using var service = NewService(dir);
                var key = Guid.NewGuid().ToString("N");
                service.UpsertEntryForTest(key, new TagCacheEntry { Type = "Movie" });

                service.BeginRebuildForTest();
                service.RemoveEntryForTest(key);
                service.PublishRebuildForTest(new Dictionary<string, TagCacheEntry>
                {
                    [key] = new TagCacheEntry { Type = "Movie" },
                });

                Assert.False(service.ContainsKeyForTest(key));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }

        [Fact]
        public async Task SaveToDisk_DoesNotAcknowledgeUpdateAfterSnapshot()
        {
            var dir = NewTempDir();
            try
            {
                using var service = NewService(dir);
                var firstKey = Guid.NewGuid().ToString("N");
                var racingKey = Guid.NewGuid().ToString("N");
                service.UpsertEntryForTest(firstKey, new TagCacheEntry { Type = "Movie" });

                using var snapshotCaptured = new ManualResetEventSlim(false);
                using var mayFinishSave = new ManualResetEventSlim(false);
                service.SaveSnapshotCapturedForTest = () =>
                {
                    snapshotCaptured.Set();
                    mayFinishSave.Wait(TimeSpan.FromSeconds(5));
                };

                var saving = Task.Run(service.SaveToDisk);
                Assert.True(snapshotCaptured.Wait(TimeSpan.FromSeconds(5)));
                service.UpsertEntryForTest(racingKey, new TagCacheEntry { Type = "Episode" });
                mayFinishSave.Set();
                await saving.WaitAsync(TimeSpan.FromSeconds(5));

                Assert.True(service.HasUnsavedChangesForTest);

                service.SaveSnapshotCapturedForTest = null;
                service.SaveToDisk();
                Assert.False(service.HasUnsavedChangesForTest);

                var path = Path.Combine(
                    dir,
                    "configurations",
                    "Jellyfin.Plugin.JellyfinEnhanced",
                    "tag-cache.json");
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                var items = document.RootElement.GetProperty("Items");
                Assert.True(items.TryGetProperty(firstKey, out _));
                Assert.True(items.TryGetProperty(racingKey, out _));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }

        [Fact]
        public void PendingChanges_LastWriteWinsWithinOneBatch()
        {
            var pending = new TagCachePendingChanges();
            var id = Guid.NewGuid();

            pending.Record(id, removed: false);
            pending.Record(id, removed: true);

            var change = Assert.Single(pending.Drain());
            Assert.Equal(id, change.Id);
            Assert.True(change.Removed);
            Assert.True(pending.IsEmpty);
        }

        [Fact]
        public void PendingChanges_RecordDuringDrain_RemainsForNextBatch()
        {
            var pending = new TagCachePendingChanges();
            var id = Guid.NewGuid();
            pending.Record(id, removed: false);

            var first = pending.DrainForTest(() => pending.Record(id, removed: true));

            Assert.Empty(first);
            var change = Assert.Single(pending.Drain());
            Assert.Equal(id, change.Id);
            Assert.True(change.Removed);
        }

        [Fact]
        public void ComputeFlushDelay_UsesDebounceUntilHardCap()
        {
            var now = new DateTime(2026, 1, 1, 0, 0, 30, DateTimeKind.Utc);
            var debounce = TimeSpan.FromSeconds(3);
            var maxWait = TimeSpan.FromSeconds(30);

            Assert.Equal(
                TimeSpan.FromSeconds(1),
                TagCacheService.ComputeFlushDelay(now.AddSeconds(-29).Ticks, now, debounce, maxWait));
            Assert.Equal(
                TimeSpan.Zero,
                TagCacheService.ComputeFlushDelay(now.AddSeconds(-31).Ticks, now, debounce, maxWait));
            Assert.Equal(
                debounce,
                TagCacheService.ComputeFlushDelay(now.AddSeconds(-1).Ticks, now, debounce, maxWait));
        }

        [Fact]
        public void ReconciliationSweep_DoesNotDeleteEntryRebuiltAfterSnapshot()
        {
            var dir = NewTempDir();
            try
            {
                using var service = NewService(dir);
                var key = Guid.NewGuid().ToString("N");
                var snapshotted = new TagCacheEntry { Type = "Movie" };
                var rebuilt = new TagCacheEntry { Type = "Movie", LastUpdated = 42 };
                service.UpsertEntryForTest(key, snapshotted);

                // Models FlushPending replacing the entry after ReconcileCacheCore
                // captured its sweep snapshot but after the live-id query omitted it.
                service.UpsertEntryForTest(key, rebuilt);
                var removed = service.RemoveEntryIfUnchangedForTest(key, snapshotted);

                Assert.False(removed);
                Assert.Same(rebuilt, service.GetEntryForTest(key));
            }
            finally
            {
                Directory.Delete(dir, recursive: true);
            }
        }

        private static TagCacheService NewService(string dir)
            => new(null!, new StubAppPaths(dir), NullLogger<TagCacheService>.Instance);

        private static string NewTempDir()
        {
            var dir = Path.Combine(Path.GetTempPath(), "je-tagcache-race-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            return dir;
        }
    }
}
