using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Api
{
    internal static class HiddenContentDefaults
    {

        internal static HiddenContentSettings BuildHcDefaultSettings(PluginConfiguration src)
        {
            return new HiddenContentSettings
            {
                Enabled = src.HiddenContentDefaultEnabled,
                ShowHideButtons = src.HiddenContentDefaultShowHideButtons,
                ShowHideConfirmation = src.HiddenContentDefaultShowHideConfirmation,
                ShowButtonJellyseerr = src.HiddenContentDefaultShowButtonJellyseerr,
                ShowButtonLibrary = src.HiddenContentDefaultShowButtonLibrary,
                ShowButtonDetails = src.HiddenContentDefaultShowButtonDetails,
                ShowButtonCast = src.HiddenContentDefaultShowButtonCast,
                FilterLibrary = src.HiddenContentDefaultFilterLibrary,
                FilterDiscovery = src.HiddenContentDefaultFilterDiscovery,
                FilterSearch = src.HiddenContentDefaultFilterSearch,
                FilterCalendar = src.HiddenContentDefaultFilterCalendar,
                FilterUpcoming = src.HiddenContentDefaultFilterUpcoming,
                FilterRecommendations = src.HiddenContentDefaultFilterRecommendations,
                FilterRequests = src.HiddenContentDefaultFilterRequests,
                FilterNextUp = src.HiddenContentDefaultFilterNextUp,
                FilterContinueWatching = src.HiddenContentDefaultFilterContinueWatching,
                ExperimentalHideCollections = src.HiddenContentDefaultExperimentalHideCollections,
            };
        }
    }
}
