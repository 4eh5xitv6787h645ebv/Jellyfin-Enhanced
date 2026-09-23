using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Owns the on-disk cache contract and streaming, atomic replacement. Callers
    /// serialize access and handle failures so dirty state and retry timing remain
    /// part of the cache coordinator's publication protocol.
    /// </summary>
    internal sealed class TagCacheSnapshotStore
    {
        // Bump whenever persisted cache data or its semantics change in a way
        // that makes entries created by an older build incorrect. v2 added
        // SeriesId for Spoiler Guard stripping. v3 preserves authoritative
        // Matroska LanguageBCP47/LanguageIETF audio languages instead of the
        // region-less values exposed by Jellyfin/FFmpeg.
        // v4 picks a real episode with streams as the Series/Season tag source.
        // A schema mismatch discards the stale cache so it can be rebuilt.
        public const int CurrentSchemaVersion = 4;

        public TagCacheSnapshotStore(string filePath) => FilePath = filePath;

        public string FilePath { get; }

        public TagCacheSnapshot? Read()
        {
            using var stream = File.OpenRead(FilePath);
            return JsonSerializer.Deserialize<TagCacheSnapshot>(stream);
        }

        public void Write(TagCacheSnapshot snapshot)
        {
            var directory = Path.GetDirectoryName(FilePath);
            if (directory != null) Directory.CreateDirectory(directory);

            // Streaming avoids a second full UTF-16 copy of large libraries.
            var tempPath = FilePath + ".tmp";
            using (var stream = File.Create(tempPath))
            {
                JsonSerializer.Serialize(stream, snapshot, new JsonSerializerOptions { WriteIndented = false });
            }

            File.Move(tempPath, FilePath, overwrite: true);
        }
    }

    /// <summary>
    /// Persisted JSON envelope. Property names and defaults are an upgrade contract.
    /// A missing schema reads as zero and is rejected by the cache coordinator.
    /// </summary>
    internal sealed class TagCacheSnapshot
    {
        public int SchemaVersion { get; set; }
        public long Version { get; set; }
        public long LastModified { get; set; }
        public long LastReconciledUtcTicks { get; set; }
        public Dictionary<string, TagCacheEntry> Items { get; set; } = new();
    }
}
