using System.Collections.Generic;
using System.IO;
using System.Linq;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>Reads aggregate data only when the reporting category is enabled.</summary>
    internal static class AnalyticsUsageReader
    {
        /// <summary>
        /// Deliberately narrow. activity.json/awards.json/mdblist-ratings.json/
        /// tag-cache.json all scale with library size, not with whether the
        /// feature is actually used; their size tells you nothing an
        /// admin's library size doesn't already explain, so they're excluded.
        /// reviews.json moved to GetTotalCounts() (a review count, gated by
        /// AnalyticsShareUsageCounts, is a more direct "is this used" signal
        /// than its byte size ever was). custom_branding's total size answers
        /// the same "is this used" question for uploaded logo/banner/favicon
        /// images: the toggle can be on with nothing ever uploaded.
        /// </summary>
        internal static Dictionary<string, long> GetDataFileSizes()
        {
            var sizes = new Dictionary<string, long>();

            try
            {
                var brandingDir = JellyfinEnhanced.BrandingDirectory;
                sizes["custom_branding"] = !string.IsNullOrEmpty(brandingDir) && Directory.Exists(brandingDir)
                    ? new DirectoryInfo(brandingDir).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length)
                    : 0;
            }
            catch
            {
                sizes["custom_branding"] = 0;
            }

            return sizes;
        }

        /// <summary>
        /// Point-in-time item counts, not per-period deltas. Unlike the
        /// incrementing counters in UsageEventCounterService (e.g.
        /// "seerr.request_submitted", which resets every report), these read the
        /// CURRENT total straight off disk every time a report goes out. Keys
        /// are prefixed "total." specifically so they can never collide with,
        /// or be misread as, a per-period delta on the dashboard. Never
        /// per-user data, only aggregate counts across every GetAllUserIds()
        /// folder (or, for reviews, the single shared reviews.json).
        /// Adoption ("how many installs actually have any of this") is
        /// deliberately NOT computed here -- it doesn't need per-user
        /// scanning at all, since the backend can already derive "how many
        /// reporting installs have total.bookmarks > 0" straight from this
        /// one per-install number via v_feature_usage_totals. See that view.
        /// </summary>
        internal static List<UsageEventEntry> GetTotalCounts(UserConfigurationManager userConfigurationManager)
        {
            var userIds = userConfigurationManager.GetAllUserIds();

            long bookmarks = 0;
            long hiddenContentItems = 0;
            long spoilerBlurItems = 0;

            foreach (var userId in userIds)
            {
                bookmarks += userConfigurationManager
                    .GetUserConfiguration<UserBookmark>(userId, "bookmark.json").Bookmarks.Count;

                hiddenContentItems += userConfigurationManager
                    .GetUserConfiguration<UserHiddenContent>(userId, "hidden-content.json").Items.Count;

                var blur = userConfigurationManager
                    .GetUserConfiguration<UserSpoilerBlur>(userId, SpoilerBlurImageFilter.SpoilerBlurFileName);
                spoilerBlurItems += blur.Series.Count + blur.Movies.Count + blur.Collections.Count;
            }

            long reviews = userConfigurationManager.GetAllReviews().Reviews.Count;

            return new List<UsageEventEntry>
            {
                new UsageEventEntry { Key = "total.bookmarks", Count = (int)bookmarks },
                new UsageEventEntry { Key = "total.hidden_content_items", Count = (int)hiddenContentItems },
                new UsageEventEntry { Key = "total.spoiler_blur_items", Count = (int)spoilerBlurItems },
                new UsageEventEntry { Key = "total.reviews", Count = (int)reviews },
            };
        }

    }
}
