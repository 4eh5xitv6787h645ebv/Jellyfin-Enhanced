using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public bool AutoPauseEnabled { get; set; }
        public bool AutoResumeEnabled { get; set; }
        public bool AutoPipEnabled { get; set; }
        public bool LongPress2xEnabled { get; set; }
        public bool PauseScreenEnabled { get; set; }
        public int PauseScreenDelaySeconds { get; set; } = 5;
        public bool AutoSkipIntro { get; set; }
        public bool AutoSkipOutro { get; set; }
        public bool DisableCustomSubtitleStyles { get; set; }
        public int SelectedStylePresetIndex { get; set; }
        public int SelectedFontSizePresetIndex { get; set; }
        public int SelectedFontFamilyPresetIndex { get; set; }
        public string CustomSubtitleTextColor { get; set; } = "#FFFFFFFF";
        public string CustomSubtitleBgColor { get; set; } = "#00000000";
        public bool UsingCustomColors { get; set; }
        public int SubtitleVerticalPosition { get; set; } = 85;
        public int SubtitleHorizontalPosition { get; set; } = 50;
        public bool ShowRatingInPlayer { get; set; } = true;
    }
}
