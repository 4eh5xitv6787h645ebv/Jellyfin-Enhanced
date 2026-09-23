namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Usage Statistics: opt-in anonymous analytics reported to the
        // Jellyfin Enhanced community analytics project. See
        // AnalyticsReportingService for exactly what's collected; every
        // category below is independently toggleable and the master switch
        // defaults off. A live "what would be sent" preview on the config
        // page reads the same AnalyticsReportingService.BuildPayload the
        // real report uses, so it can never drift from reality.
        public bool AnalyticsEnabled { get; set; } = false;
        /// <summary>Shares a boolean on/off snapshot of every feature toggle (never URLs/keys/free text).</summary>
        public bool AnalyticsShareFeatureFlags { get; set; } = true;
        /// <summary>Shares per-feature usage counters (e.g. "seerr.request_submitted": 12), reset each period after a successful send.</summary>
        public bool AnalyticsShareUsageCounts { get; set; } = true;
        /// <summary>Shares byte sizes only (never contents) of the plugin's own on-disk data files; see AnalyticsUsageReader.GetDataFileSizes for exactly what's included.</summary>
        public bool AnalyticsShareDataSizes { get; set; } = true;
        /// <summary>
        /// Hidden field, no UI. True once the admin has explicitly saved the
        /// master toggle on at least once; used only to decide whether
        /// turning the master ON should cascade the three sub-toggles to ON
        /// (first time) or leave them exactly as the admin last set them
        /// (every time after).
        /// </summary>
        public bool AnalyticsHasBeenConfigured { get; set; } = false;
        /// <summary>Hidden field, no UI. Server-minted (not client-generated) on first opt-in; never derived from anything identifying.</summary>
        public string AnalyticsInstallId { get; set; } = string.Empty;
        /// <summary>Hidden field, no UI. High-entropy secret issued alongside AnalyticsInstallId at registration; required on every report so a guessed/leaked install id alone can't be used to overwrite or impersonate this install.</summary>
        public string AnalyticsInstallSecret { get; set; } = string.Empty;
        /// <summary>Admin-configurable reporting cadence in days. Clamped to 7-30 wherever it's read.</summary>
        public int AnalyticsReportIntervalDays { get; set; } = 15;
        /// <summary>Hidden field, no UI. Unix ms of the last successful report; drives the config page's "Last sent" display and the task's due-check.</summary>
        public long AnalyticsLastReportedAt { get; set; } = 0;
        /// <summary>Hidden field, no UI. The exact JSON payload from the last successful report, shown verbatim on the config page.</summary>
        public string AnalyticsLastPayloadJson { get; set; } = string.Empty;
        /// <summary>Hidden field, no UI. Full plugin assembly version at the last successful report; changes bypass the reporting interval.</summary>
        public string AnalyticsLastReportedPluginVersion { get; set; } = string.Empty;
        /// <summary>Hidden field, no UI. Compiled build target at the last successful report; detects same-version build corrections.</summary>
        public string AnalyticsLastReportedJellyfinTarget { get; set; } = string.Empty;
        /// <summary>Hidden field, no UI. Running Jellyfin version at the last successful report; detects host upgrades independently of plugin upgrades.</summary>
        public string AnalyticsLastReportedJellyfinVersion { get; set; } = string.Empty;
        /// <summary>
        /// Hidden field, no UI. Count of report_stats 403 responses since the
        /// last successful report. PERSISTED (not an in-memory field) because
        /// send attempts happen at most daily: an in-memory counter on a
        /// server restarted every day or two would never reach the
        /// re-registration threshold and the install would 403 forever — the
        /// exact stuck state the threshold logic exists to escape.
        /// </summary>
        public int AnalyticsForbiddenSinceLastSuccess { get; set; } = 0;
    }
}
