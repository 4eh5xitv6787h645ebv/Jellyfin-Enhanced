using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class HiddenContentSettings
    {
        public bool Enabled { get; set; } = true;
        public bool FilterLibrary { get; set; } = true;
        public bool FilterDiscovery { get; set; } = true;
        public bool FilterUpcoming { get; set; } = true;
        public bool FilterCalendar { get; set; } = true;
        public bool FilterSearch { get; set; } = false;
        public bool FilterRecommendations { get; set; } = true;
        public bool FilterRequests { get; set; } = true;
        public bool FilterNextUp { get; set; } = true;
        public bool FilterContinueWatching { get; set; } = true;
        public bool ShowHideButtons { get; set; } = true;
        public bool ShowHideConfirmation { get; set; } = true;
        public bool ShowButtonJellyseerr { get; set; } = true;
        public bool ShowButtonLibrary { get; set; } = false;
        public bool ShowButtonDetails { get; set; } = true;
        public bool ShowButtonCast { get; set; } = false;
        public bool ExperimentalHideCollections { get; set; } = false;
    }
}
