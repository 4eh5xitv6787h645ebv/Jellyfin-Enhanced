namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Default User Settings
        public bool AutoPauseEnabled { get; set; } = true;
        public bool AutoResumeEnabled { get; set; } = false;
        public bool AutoPipEnabled { get; set; } = false;
        public bool AutoSkipIntro { get; set; } = false;
        public bool AutoSkipOutro { get; set; } = false;
        public bool LongPress2xEnabled { get; set; } = false;
        public bool PauseScreenEnabled { get; set; } = true;
        public bool ShowPlaybackRatingBadge { get; set; } = false;
        public int PauseScreenDelaySeconds { get; set; } = 5;
        public int DefaultSubtitleStyle { get; set; } = 0;
        public int DefaultSubtitleSize { get; set; } = 2;
        public int DefaultSubtitleFont { get; set; } = 0;
        public bool DisableCustomSubtitleStyles { get; set; } = false;
        public bool ShowRatingInPlayer { get; set; } = true;
    }
}
