using Jellyfin.Plugin.JellyfinEnhanced.Model;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // Maintenance Mode
        public bool MaintenanceModeEnabled { get; set; } = false;
        /// <summary>Shown as a banner on the login page.</summary>
        public string MaintenanceModeMessage { get; set; } = "This server is currently undergoing maintenance. Please try again.";
        /// <summary>Sent as a native Jellyfin broadcast to all active sessions.</summary>
        public string MaintenanceModeNotificationMessage { get; set; } = "Server undergoing maintenance.";
        /// <summary>"none" | "disable_accounts" | "disable_remote" | "both"</summary>
        [AnalyticsInclude]
        public string MaintenanceModeAction { get; set; } = "disable_accounts";
        /// <summary>
        /// "all" or a JSON array of user ID strings. Deliberately NOT
        /// [AnalyticsInclude]: the raw value can hold real Jellyfin user
        /// GUIDs, so analytics shares only a derived "all"/"selected" — see
        /// AnalyticsConfigurationProjection.GetStringSettings.
        /// </summary>
        public string MaintenanceModeAffectedUsers { get; set; } = "all";

        /// <summary>
        /// The only shape of MaintenanceModeAffectedUsers that may ever leave
        /// the server: the raw value can be a JSON array of real Jellyfin user
        /// GUIDs. Shared by the analytics payload (AnalyticsConfigurationProjection.
        /// GetStringSettings) and the anonymous public-config endpoint so the
        /// two can never drift apart or regress to exposing the raw value.
        /// Empty/unset means the default, i.e. "all".
        /// </summary>
        public static string DeriveAffectedUsersShape(string? value) =>
            string.IsNullOrEmpty(value) || value == "all" ? "all" : "selected";
    }
}
