using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Fail-closed library lookups for metadata responses that omit user data.
    /// </summary>
    internal sealed class SpoilerMetadataWatchState
    {
        private readonly SpoilerUserResolver _resolver;
        private readonly ILibraryManager _libraryManager;
        private readonly IUserManager _userManager;
        private readonly IUserDataManager _userDataManager;

        internal SpoilerMetadataWatchState(SpoilerUserResolver resolver, ILibraryManager libraryManager,
            IUserManager userManager, IUserDataManager userDataManager)
        {
            _resolver = resolver;
            _libraryManager = libraryManager;
            _userManager = userManager;
            _userDataManager = userDataManager;
        }

        internal bool ResolvePlayedServerSide(Guid userId, Guid itemId)
        {
            try
            {
                var jUser = _userManager.GetUserById(userId);
                // Both branches return false, but for DIFFERENT reasons.
                // When user/item are gone, "treat as unwatched → strip
                // applies" is the safe default (we'd rather strip a
                // non-existent ref than leak metadata).
                if (jUser == null) return false;
                var item = _libraryManager.GetItemById(itemId);
                if (item == null) return false;
                var ud = _userDataManager.GetUserData(jUser, item);
                return ud?.Played == true;
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-resolveplayed:" + ex.GetType().FullName,
                    $"Spoiler Guard field strip: ResolvePlayedServerSide failed for item {itemId}: {ex.Message}");
                // Fail CLOSED: when we can't determine played-state and the
                // response would otherwise leak metadata, prefer the strip.
                // Better to show "Spoiler Guard activated" on a watched
                // episode (UX glitch) than leak the synopsis (privacy).
                return false;
            }
        }

        // Server-side fallback for the watched-through tick used by
        // progressive movie chapter strip. Returns long.MaxValue when the
        // movie is fully Played (so all chapters show); the raw
        // PlaybackPositionTicks otherwise; or null if neither could be
        // resolved (caller treats null as fail-CLOSED → strip all). Used
        // when the DTO's UserData is missing (enableUserData=false on
        // lite clients).
        internal long? ResolveWatchedThroughTicksServerSide(Guid userId, Guid itemId)
        {
            try
            {
                var jUser = _userManager.GetUserById(userId);
                if (jUser == null) return null;
                var item = _libraryManager.GetItemById(itemId);
                if (item == null) return null;
                var ud = _userDataManager.GetUserData(jUser, item);
                if (ud == null) return null;
                if (ud.Played) return long.MaxValue;
                if (ud.PlaybackPositionTicks > 0) return ud.PlaybackPositionTicks;
                return null;
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-resolvethroughticks:" + ex.GetType().FullName,
                    $"Spoiler Guard field strip: ResolveWatchedThroughTicksServerSide failed for item {itemId}: {ex.Message}");
                return null;
            }
        }

        // Server-side "has the user watched ANY episode in this season?"
        // probe. Used as a fallback when the Season DTO carries no
        // ItemCounts (TvShows.GetSeasons strips them by default unless
        // ?fields=ItemCounts is requested). Fail-closed on throw → return
        // false so strip applies (privacy > UX glitch).
        internal bool HasWatchedAnyEpisodeInSeasonServerSide(Guid userId, Guid seasonId)
        {
            try
            {
                var jUser = _userManager.GetUserById(userId);
                if (jUser == null) return false;
                var seasonItem = _libraryManager.GetItemById(seasonId)
                    as MediaBrowser.Controller.Entities.TV.Season;
                if (seasonItem == null) return false;
                foreach (var ep in seasonItem.GetEpisodes(jUser, new MediaBrowser.Controller.Dto.DtoOptions(false), shouldIncludeMissingEpisodes: false))
                {
                    if (ep == null) continue;
                    var ud = _userDataManager.GetUserData(jUser, ep);
                    if (ud?.Played == true) return true;
                }
                return false;
            }
            catch (Exception ex)
            {
                _resolver.WarnRateLimited(
                    "fieldstrip-seasonprobe:" + ex.GetType().FullName,
                    $"Spoiler Guard field strip: season any-watched probe failed for season {seasonId}: {ex.Message}");
                return false;
            }
        }

    }
}
