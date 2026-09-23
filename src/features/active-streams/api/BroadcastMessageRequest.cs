namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    public class BroadcastMessageRequest
    {
        public string? Header { get; set; }

        public string Text { get; set; } = string.Empty;

        public long? TimeoutMs { get; set; }
    }
}
