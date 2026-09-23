using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Model;
using Jellyfin.Plugin.JellyfinEnhanced.Services;

var directory = Path.Combine(Path.GetTempPath(), "je-tag-cache-tests-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(directory);
try
{
    var path = Path.Combine(directory, "nested", "tag-cache.json");
    var store = new TagCacheSnapshotStore(path);
    var entry = new TagCacheEntry
    {
        Type = "Episode", SeriesId = "parent", TmdbId = "123", SeriesTmdbId = "456",
        SeasonNumber = 2, EpisodeNumber = 4, Genres = ["Drama"], AudioLanguages = ["pt-br"],
        CommunityRating = 8.7f, CriticRating = 91f, LastUpdated = 77,
        StreamData = new TagStreamData { ItemName = "Episode", ItemPath = "episode.mkv" }
    };
    var original = new TagCacheSnapshot
    {
        SchemaVersion = TagCacheSnapshotStore.CurrentSchemaVersion, Version = 12,
        LastModified = 88, LastReconciledUtcTicks = 99, Items = new() { ["item"] = entry }
    };
    store.Write(original);
    var read = store.Read() ?? throw new Exception("Snapshot was null");
    Check(read.SchemaVersion == 4 && read.Version == 12 && read.LastModified == 88 && read.LastReconciledUtcTicks == 99,
        "Existing snapshot metadata must round-trip with schema v4");
    Check(TagCacheEntry.ContentEquals(entry, read.Items["item"]), "All entry fields must round-trip");
    Check(read.Items["item"].LastUpdated == 77, "Delta timestamp must survive persistence");
    Check(!File.Exists(path + ".tmp"), "Atomic replacement must consume temporary file");
    using (var json = JsonDocument.Parse(File.ReadAllText(path)))
    {
        Check(json.RootElement.EnumerateObject().Select(p => p.Name).SequenceEqual(
            new[] { "SchemaVersion", "Version", "LastModified", "LastReconciledUtcTicks", "Items" }),
            "Persisted envelope names must match existing installations");
    }

    original.Version = 13;
    store.Write(original);
    Check(store.Read()!.Version == 13, "Writing an existing file must replace its contents");

    // System.Text.Json rejects NaN by default. A failed replacement must retain
    // the last good snapshot for startup recovery, and a later save can retry.
    original.Items["item"].CommunityRating = float.NaN;
    var failed = false;
    try { store.Write(original); }
    catch (ArgumentException) { failed = true; }
    Check(failed, "Invalid JSON numeric values must report failure to the coordinator");
    Check(store.Read()!.Items["item"].CommunityRating == 8.7f, "Failed writes must preserve the previous snapshot");
    original.Items["item"].CommunityRating = 9f;
    store.Write(original);
    Check(store.Read()!.Items["item"].CommunityRating == 9f, "Retry must replace an incomplete temporary file");

    File.WriteAllText(path, "{\"Version\":1,\"LastModified\":2,\"Items\":{}}");
    Check(store.Read()!.SchemaVersion == 0, "Legacy snapshots must retain zero schema for coordinator rejection");
    File.WriteAllText(path, "null");
    Check(store.Read() == null, "A null snapshot remains an absent snapshot");
    File.WriteAllText(path, "broken json");
    try { store.Read(); throw new Exception("Malformed JSON was accepted"); }
    catch (JsonException) { }

    var pending = new TagCachePendingChanges();
    var id = Guid.NewGuid();
    pending.Record(Guid.Empty, true);
    pending.Record(id, false);
    pending.Record(id, true);
    Check(pending.Count == 1, "A scan burst must coalesce by item and ignore empty IDs");
    var batch = pending.Drain();
    Check(batch.Count == 1 && batch[0] == (id, true) && pending.IsEmpty, "Latest removal must win and drain once");
    pending.Record(id, false);
    Check(pending.Drain().Single() == (id, false), "Updates following a drain must reach the next batch");
    Console.WriteLine("Tag cache persistence and pending-change compatibility checks passed.");
}
finally
{
    Directory.Delete(directory, recursive: true);
}

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}
