using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Jellyseerr
{
    /// <summary>The authenticated Jellyfin caller for a Seerr operation.</summary>
    /// <param name="JellyfinUserId">The server-resolved Jellyfin user ID.</param>
    /// <param name="IsAdmin">Whether the server-resolved caller is a Jellyfin administrator.</param>
    public sealed record SeerrCaller(string? JellyfinUserId, bool IsAdmin);

    /// <summary>Outcome of applying the parental filter to one upstream JSON response.</summary>
    public readonly record struct SeerrParentalResult(bool Block, string Body, bool Succeeded = true);

    public interface ISeerrParentalFilter
    {
        Task<SeerrParentalResult> ApplyAsync(string json, string apiPath, SeerrCaller caller);

        Task<bool> IsBlockedAsync(string mediaType, int tmdbId, SeerrCaller caller);

        Task<bool> IsTmdbProxyPathBlockedAsync(string tmdbApiPath, SeerrCaller caller);

        /// <summary>Starts a fresh configuration generation and discards cached metadata.</summary>
        void InvalidateConfiguration();

        /// <summary>Discards cached metadata without changing configured policy.</summary>
        void ClearCache();
    }
}
