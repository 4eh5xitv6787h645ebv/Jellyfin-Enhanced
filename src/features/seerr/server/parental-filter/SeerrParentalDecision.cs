using Jellyfin.Plugin.JellyfinEnhanced.Helpers.Jellyseerr;
using Signature = Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr.SeerrParentalSignature;
using Policy = Jellyfin.Plugin.JellyfinEnhanced.Services.SeerrParentalFilter.Policy;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>Combines Jellyfin rating and tag policy; unresolved data fails closed.</summary>
    internal static class SeerrParentalDecision
    {
        internal static bool IsAllowed(Signature? resolved, string mediaType, Policy policy)
        {
            // Could not verify -> fail closed.
            if (resolved == null)
            {
                return false;
            }

            var ratingAllowed = ParentalRatingDecision.IsAllowed(
                resolved.Score,
                resolved.SubScore,
                policy.BlocksUnrated(mediaType),
                policy.MaxScore,
                policy.MaxSubScore);
            if (!ratingAllowed)
            {
                return false;
            }

            if (!policy.HasTagRules)
            {
                return true;
            }

            // Tag branch. A missing tag set under active tag rules means the title
            // could not be verified -> fail closed, like the rating path.
            if (resolved.Keywords == null || resolved.Genres == null)
            {
                return false;
            }

            return ParentalTagDecision.IsAllowed(resolved.Keywords, resolved.Genres, policy.BlockedTags, policy.AllowedTags);
        }

    }
}
