// Adapted from Jellyfin Canopy's GPL-3.0 parental filter at
// 0a2678d6e7259adcdbbf6e5c724705be0700a58f.
using System.Collections.Generic;
using Jellyfin.Data.Enums;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr
{
    /// <summary>
    /// Applies Jellyfin's native parental-rating comparison to an external title.
    /// </summary>
    internal static class ParentalRatingDecision
    {
        internal static bool IsAllowed(
            int? itemScore,
            int? itemSubScore,
            UnratedItem unratedType,
            int? maxScore,
            int? maxSubScore,
            IReadOnlyCollection<UnratedItem>? blockUnrated)
        {
            if (itemScore is null)
            {
                return blockUnrated is null || !blockUnrated.Contains(unratedType);
            }

            if (maxScore is null)
            {
                return true;
            }

            if (itemScore.Value != maxScore.Value)
            {
                return itemScore.Value < maxScore.Value;
            }

            return maxSubScore is null || (itemSubScore ?? 0) <= maxSubScore.Value;
        }
    }
}
