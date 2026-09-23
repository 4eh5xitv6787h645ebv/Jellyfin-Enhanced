namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {
        public bool ColoredRatingsEnabled { get; set; } = false;
        public bool ShowAwards { get; set; } = false;
        /// <summary>MDBList API key (mdblist.com). Never exposed to clients;
        /// see GetPublicConfig()'s MdblistEnabled boolean. Used server-side
        /// only, by MdblistService.</summary>
        public string MdblistApiKey { get; set; } = "";
        /// <summary>Master toggle for the MDBList ratings feature (item-details display + sync task).</summary>
        public bool MdblistRatingsEnabled { get; set; } = false;
        /// <summary>Shows an MDBList ratings row on item-details pages.</summary>
        public bool MdblistRatingsShowOnItemDetails { get; set; } = true;
        /// <summary>Gates MdblistRatingsFetchTask, the task that actually talks to
        /// MDBList and keeps mdblist-ratings.json fresh. Off by default so enabling
        /// the feature only turns on the display (which still lazily fetches
        /// on-demand per item view), not a background library-wide crawl, until
        /// explicitly opted into.</summary>
        public bool MdblistRatingsFetchEnabled { get; set; } = false;
        /// <summary>Gates MdblistRatingsSyncTask writing CommunityRating/CriticRating
        /// back to items from whatever's already cached. This task makes no MDBList
        /// API calls itself, so it's independent of MdblistRatingsFetchEnabled, though
        /// it has nothing to sync from until the fetch task, or an item-details page
        /// view, has populated the cache for a given title.</summary>
        public bool MdblistRatingsAutoSyncEnabled { get; set; } = false;
        /// <summary>Off (default): the sync task only FILLS a CommunityRating/CriticRating
        /// that's currently empty, and skips an item entirely once both are set,
        /// so once populated (by MDBList or any other provider/manual edit), that
        /// item is never revisited. On: every item is reconsidered on every run and
        /// its rating(s) are always set to whatever MDBList currently reports,
        /// replacing an existing value. This is what makes the rating actually
        /// stay current over time, at the cost of losing any provider- or
        /// admin-set value MDBList disagrees with.</summary>
        public bool MdblistRatingsOverwriteExisting { get; set; } = false;
        /// <summary>MdblistRatingsFetchTask stops for the day once the account's
        /// LIVE remaining quota (from MDBList's own GET /user endpoint, see
        /// MdblistService.GetAccountStatusAsync) drops to this floor, reserving
        /// the rest for live item-details page lookups so a large fetch run
        /// can't exhaust the whole day's quota.</summary>
        public int MdblistFetchReserve { get; set; } = 400;
        /// <summary>Comma-separated MDBList source keys (tmdb, tomatoes, popcorn,
        /// imdb, trakt, metacritic, metacriticuser, letterboxd, rogerebert,
        /// myanimelist, master) controlling which ratings show on the item-details
        /// row, and in what order. Empty (default) shows every source MDBList has
        /// data for, in the built-in priority order.</summary>
        public string MdblistRatingsSources { get; set; } = "";
        /// <summary>Appends "%" after each rating badge's number on the item-details row.</summary>
        public bool MdblistRatingsShowPercentSymbol { get; set; } = false;
    }
}
