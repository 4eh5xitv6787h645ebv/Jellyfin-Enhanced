namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Jellyfin Enhanced Settings
        public int ToastDuration { get; set; } = 1500;
        public int HelpPanelAutocloseDelay { get; set; } = 15000;
        public bool DevMode { get; set; } = false;
        public long ClearLocalStorageTimestamp { get; set; } = 0;
        public long ClearTranslationCacheTimestamp { get; set; } = 0;
        public List<Shortcut> Shortcuts { get; set; } = new List<Shortcut>
        {
            new Shortcut { Name = "OpenSearch", Key = "/", Label = "Open Search", Category = "Global" },
            new Shortcut { Name = "GoToHome", Key = "Shift+H", Label = "Go to Home", Category = "Global" },
            new Shortcut { Name = "GoToDashboard", Key = "D", Label = "Go to Dashboard", Category = "Global" },
            new Shortcut { Name = "QuickConnect", Key = "Q", Label = "Quick Connect", Category = "Global" },
            new Shortcut { Name = "PlayRandomItem", Key = "R", Label = "Play Random Item", Category = "Global" },
            new Shortcut { Name = "CycleAspectRatio", Key = "A", Label = "Cycle Aspect Ratio", Category = "Player" },
            new Shortcut { Name = "ShowPlaybackInfo", Key = "I", Label = "Show Playback Info", Category = "Player" },
            new Shortcut { Name = "SubtitleMenu", Key = "S", Label = "Subtitle Menu", Category = "Player" },
            new Shortcut { Name = "CycleSubtitleTracks", Key = "C", Label = "Cycle Subtitle Tracks", Category = "Player" },
            new Shortcut { Name = "CycleAudioTracks", Key = "V", Label = "Cycle Audio Tracks", Category = "Player" },
            new Shortcut { Name = "IncreasePlaybackSpeed", Key = "+", Label = "Increase Playback Speed", Category = "Player" },
            new Shortcut { Name = "DecreasePlaybackSpeed", Key = "-", Label = "Decrease Playback Speed", Category = "Player" },
            new Shortcut { Name = "ResetPlaybackSpeed", Key = "R", Label = "Reset Playback Speed", Category = "Player" },
            new Shortcut { Name = "BookmarkCurrentTime", Key = "B", Label = "Bookmark Current Time", Category = "Player" },
            new Shortcut { Name = "OpenEpisodePreview", Key = "P", Label = "Open Episode Preview", Category = "Player" },
            new Shortcut { Name = "SkipIntroOutro", Key = "O", Label = "Skip Intro/Outro", Category = "Player" },
            new Shortcut { Name = "FrameStepBack", Key = ",", Label = "Step Back One Frame", Category = "Player" },
            new Shortcut { Name = "FrameStepForward", Key = ".", Label = "Step Forward One Frame", Category = "Player" },
            new Shortcut { Name = "JumpToLastPosition", Key = "Z", Label = "Jump to Last Position", Category = "Player" },
            new Shortcut { Name = "JumpToPercentage", Key = "0-9", Label = "Jump to % of video", Category = "Player" }
        };
        public bool DisableAllShortcuts { get; set; } = false;
        public string DefaultLanguage { get; set; } = string.Empty;
    }
}
