namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class PluginConfiguration
    {

        // When enabled by admin AND opted-in per-show by a user, an MVC action
        // filter replaces UNWATCHED-episode images with a SkiaSharp Gaussian blur
        // (sigma=Intensity, tile-mode Clamp) on the wire, so every client gets
        // the blurred bytes natively.
        public bool SpoilerBlurEnabled { get; set; } = false;
        // Gaussian sigma passed to Skia. 1 = barely blurred, 100 = heavily
        // blurred. Default 40 hides scene content while keeping silhouettes and
        // dominant colours visible.
        public int SpoilerBlurIntensity { get; set; } = 40;

        // When SpoilerBlurEnabled is on AND the user has the parent series in
        // their spoiler list AND the episode is unwatched, an MVC action filter
        // nulls/replaces these BaseItemDto fields. Each toggle is independent and
        // defaults ON (strictest posture); admins relax them in the configPage.
        // Series descriptions have their own toggle because the Series DTO has no
        // watched state and some users still want the show's high-level premise
        // visible while episode-level plot details remain protected. Null means
        // this is an upgraded config that predates the split; consumers fall back
        // to SpoilerStripOverview so the server's previous behavior is preserved
        // until the admin saves an explicit independent choice.
        public bool? SpoilerStripSeriesOverview { get; set; }
        public bool SpoilerStripOverview { get; set; } = true;
        public bool SpoilerStripTags { get; set; } = true;
        public bool SpoilerStripChapters { get; set; } = true;
        public bool SpoilerStripTaglines { get; set; } = true;
        // Single toggle nulls BOTH community and critic ratings on guarded
        // unwatched episodes — consolidated because either leaks the same
        // "how good is this episode" signal.
        public bool SpoilerStripRatings { get; set; } = true;
        public bool SpoilerStripPremiereDate { get; set; } = true;
        // Episode names become "Season X, Episode Y" instead of leaking spoiler
        // titles. On by default; admins can untick it (some clients show the title
        // in nav tooltips/breadcrumbs, where the change can feel jarring).
        public bool SpoilerReplaceTitle { get; set; } = true;
        // StripCast strips cast on unwatched episodes. StripCastMode: "GuestStars"
        // (only Type=GuestStar removed, regular cast kept — default) or "All"
        // (every People entry). Default GuestStars, since most series leak via
        // guest stars only.
        public bool SpoilerStripCast { get; set; } = true;
        public string SpoilerStripCastMode { get; set; } = "GuestStars";
        // Hide the JE Reviews panel on guarded Series pages — TMDB and
        // user-written reviews routinely leak plot spoilers. Default ON since
        // the spoiler risk dwarfs the UX cost.
        public bool SpoilerStripReviews { get; set; } = true;
        // "hide" (default) substitutes a parent-level placeholder picked by aspect
        // (Series Backdrop for episodes, Series Primary for seasons, Collection
        // Primary for collection-opted movies, flat dark card otherwise), fully
        // hiding episode-specific imagery. "blur" runs the SkiaSharp Gaussian on
        // the original bytes so silhouettes / dominant colours remain visible.
        public string SpoilerBlurMode { get; set; } = "hide";
        // False (default): only Primary/Thumb/Screenshot blur; Backdrop/Art pass
        // through unblurred. True: blur those too. Default scopes blur to the
        // poster surface, where most spoiler risk lives (backdrops are usually
        // less plot-specific than curated poster art).
        public bool SpoilerBlurArtwork { get; set; } = false;
        // On a user's first-ever play of a series' S1E1, auto-adds it to their
        // spoiler list (UserSpoilerBlur.Series). History is checked via
        // IUserDataManager so rewatches don't re-trigger.
        public bool SpoilerAutoEnableOnFirstPlay { get; set; } = false;
        // Each successful Seerr request via JE registers a pending entry
        // (UserSpoilerBlur.PendingTmdb); when the content lands,
        // SpoilerSeerrPendingPromoter moves it into Series/Movies. This toggle
        // controls only the auto-on-request path — manual opt-in from the Seerr
        // more-info modal stays available (gated only by SpoilerBlurEnabled).
        public bool SpoilerAutoEnableOnSeerrRequest { get; set; } = false;
        // True: toggling Spoiler Guard also fires a full page reload so DTO-derived
        // text (Overview, titles, ratings) updates immediately. False (default):
        // only the in-place image-URL refresh runs — image bytes flip at once but
        // page text stays stale until the next navigation. Off by default for a
        // smoother refresh (no full-page flash).
        public bool SpoilerBlurStrictRefresh { get; set; } = false;
        // True (default): a listed movie's Primary/Thumb pass unblurred even with
        // the master switch on; its Chapter thumbs, Screenshots, and (if
        // SpoilerBlurArtwork) Backdrop/Art still follow protection. Movie posters
        // are usually curated marketing art, while chapter scene-thumbs (and
        // synopsis/cast) are the real spoiler vector. Off = hide posters too.
        public bool SpoilerKeepMoviePosters { get; set; } = true;
        // Advanced per-category reveals. When on, the user's NEXT unwatched
        // regular episode and the rest of its season get their own strip masks
        // below instead of the uniform full strip; every other unwatched
        // episode (later seasons, skipped earlier seasons, specials) keeps the
        // full strip. Category resolution failure of any kind falls back to
        // the full strip.
        public bool SpoilerAdvancedMode { get; set; } = false;
        // Per-category field masks, same "true = strip" polarity as the base
        // toggles above. A category mask can only RELAX a base strip that is
        // already on — it never strips a field whose base toggle (or the
        // user's per-field opt-out) has disabled stripping.
        public bool SpoilerNextEpisodeStripTitle { get; set; } = false;
        public bool SpoilerNextEpisodeStripOverview { get; set; } = true;
        public bool SpoilerNextEpisodeStripRatings { get; set; } = true;
        public bool SpoilerNextEpisodeStripImage { get; set; } = true;
        public bool SpoilerCurrentSeasonStripTitle { get; set; } = true;
        public bool SpoilerCurrentSeasonStripOverview { get; set; } = true;
        public bool SpoilerCurrentSeasonStripRatings { get; set; } = true;
        // Placeholder for stripped Overview so the client doesn't render a
        // "Description" header over blank. Configurable for localisation.
        public string SpoilerOverviewPlaceholder { get; set; } = "Spoiler Guard activated";
    }
}
