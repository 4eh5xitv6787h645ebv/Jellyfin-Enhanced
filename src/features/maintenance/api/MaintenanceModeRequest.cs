namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    public class MaintenanceModeRequest
    {
        public string? Message { get; set; }
        public int DurationMinutes { get; set; }
        /// <summary>"disable_accounts" | "disable_remote" | "both"</summary>
        public string Action { get; set; } = "disable_accounts";
        /// <summary>Specific user IDs to affect. Null or empty = all non-admin users.</summary>
        public List<string>? AffectedUserIds { get; set; }
    }
}
