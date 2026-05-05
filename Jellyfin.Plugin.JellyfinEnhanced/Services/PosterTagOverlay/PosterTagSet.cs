using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public enum TagCorner { TopLeft, TopRight, BottomLeft, BottomRight }
    public enum TagKind { Genre, Rating, Language, Quality }

    // One drawable chip with its placement metadata.
    public sealed class TagChip
    {
        public TagKind Kind { get; init; }
        public string Label { get; init; } = string.Empty;
        public TagCorner Corner { get; init; }
        public ChipStyle Style { get; init; } = ChipStyle.Neutral;
        // Lower runs first within the corner stack (matches PR 585 semantics).
        public int Order { get; init; }
    }

    public enum ChipStyle { Neutral, RatingNormal, RatingHigh, Language, Quality }

    public sealed class PosterTagSet
    {
        public IReadOnlyList<TagChip> Chips { get; init; } = System.Array.Empty<TagChip>();
        public string Fingerprint { get; init; } = string.Empty;
        public bool IsEmpty => Chips.Count == 0;

        public static TagCorner ParseCorner(string? value, TagCorner fallback)
        {
            if (string.IsNullOrWhiteSpace(value)) return fallback;
            return value.ToLowerInvariant() switch
            {
                "top-left" => TagCorner.TopLeft,
                "top-right" => TagCorner.TopRight,
                "bottom-left" => TagCorner.BottomLeft,
                "bottom-right" => TagCorner.BottomRight,
                _ => fallback,
            };
        }
    }
}
