using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public bool ShowWatchProgress { get; set; }
        public string WatchProgressMode { get; set; } = "percentage";
        public string WatchProgressTimeFormat { get; set; } = "hours";
        public bool ShowFileSizes { get; set; }
        public bool ShowAudioLanguages { get; set; }
    }
}
