
namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Seerr
{
    /// <summary>User-neutral rating and tag data. Null tags mean they have not been verified.</summary>
    internal sealed record SeerrParentalSignature(int? Score, int? SubScore, string[]? Keywords, string[]? Genres);
}
