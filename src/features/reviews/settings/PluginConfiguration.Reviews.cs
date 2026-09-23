namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool ShowReviews { get; set; } = false;
        public bool ShowUserReviews { get; set; } = false;
        public bool ReviewsExpandedByDefault { get; set; } = false;
        public bool HideReviewsFromHiddenUsers { get; set; } = true;
        public bool HideReviewsFromDisabledUsers { get; set; } = true;
    }
}
