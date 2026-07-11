using Jellyfin.Data.Enums;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using MediaBrowser.Model.Dto;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Services
{
    public sealed class SpoilerFieldStripPolicyTests
    {
        [Fact]
        public void SeriesOverview_UsesIndependentAdminAndUserPolicy()
        {
            var item = new BaseItemDto { Type = BaseItemKind.Series };
            var state = new UserSpoilerBlur
            {
                Prefs = new SpoilerBlurUserPrefs { HideSeriesDescriptions = false },
            };
            var config = new PluginConfiguration
            {
                SpoilerStripOverview = true,
                SpoilerStripSeriesOverview = true,
            };

            Assert.False(SpoilerFieldStripFilter.ShouldStripOverview(item, state, config));

            state.Prefs.HideSeriesDescriptions = true;
            Assert.True(SpoilerFieldStripFilter.ShouldStripOverview(item, state, config));
        }

        [Fact]
        public void SeriesOverview_NullAdminValueFallsBackToLegacyOverviewPolicy()
        {
            var item = new BaseItemDto { Type = BaseItemKind.Series };
            var state = new UserSpoilerBlur();
            var config = new PluginConfiguration
            {
                SpoilerStripOverview = false,
                SpoilerStripSeriesOverview = null,
            };

            Assert.False(SpoilerFieldStripFilter.ShouldStripOverview(item, state, config));

            config.SpoilerStripOverview = true;
            Assert.True(SpoilerFieldStripFilter.ShouldStripOverview(item, state, config));
        }

        [Fact]
        public void EpisodeOverview_KeepsLegacyEpisodePreference()
        {
            var item = new BaseItemDto { Type = BaseItemKind.Episode };
            var state = new UserSpoilerBlur
            {
                Prefs = new SpoilerBlurUserPrefs
                {
                    HideSeriesDescriptions = true,
                    HideEpisodeDescriptions = false,
                },
            };
            var config = new PluginConfiguration
            {
                SpoilerStripOverview = true,
                SpoilerStripSeriesOverview = true,
            };

            Assert.False(SpoilerFieldStripFilter.ShouldStripOverview(item, state, config));
        }
    }
}
