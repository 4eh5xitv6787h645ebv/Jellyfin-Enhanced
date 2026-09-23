using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Model.Dto;
using CategoryReveal = Jellyfin.Plugin.JellyfinEnhanced.Services.SpoilerFieldStripFilter.CategoryReveal;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Applies configured field policies to a DTO already selected for spoiler protection.
    /// </summary>
    internal sealed class SpoilerMetadataSanitizer
    {
        private readonly SpoilerMetadataWatchState _watchState;

        internal SpoilerMetadataSanitizer(SpoilerMetadataWatchState watchState)
        {
            _watchState = watchState;
        }

        private static readonly System.Text.RegularExpressions.Regex _htmlTagRe
            = new System.Text.RegularExpressions.Regex("<[^>]+>", System.Text.RegularExpressions.RegexOptions.Compiled);

        // Merge admin strip policy with optional per-user override. The admin
        // policy is the cap: a strip the admin has disabled is never re-enabled
        // by a user override (no client-side knob can broaden server-side
        // protection). When the admin has the strip enabled, the user can
        // opt OUT by setting their override to false.
        //   adminOn=false → never strip (admin gates the feature)
        //   adminOn=true, override=null → strip (default: follow admin)
        //   adminOn=true, override=false → don't strip (user opt-out)
        //   adminOn=true, override=true → strip (explicit user re-affirm)
        internal static bool ShouldStrip(bool adminOn, bool? userOverride)
            => adminOn && (userOverride ?? true);

        // Series descriptions are independently configurable from episode,
        // season, movie, and extra descriptions. The generic ApplyStripping
        // path handles every guarded item kind, so choose the correct policy
        // before touching Overview instead of coupling Series back to the
        // legacy episode-description switch.
        private static bool ShouldStripOverview(
            BaseItemDto item,
            UserSpoilerBlur userState,
            PluginConfiguration cfg)
            => item.Type == Jellyfin.Data.Enums.BaseItemKind.Series
                ? ShouldStrip(
                    cfg.SpoilerStripSeriesOverview ?? cfg.SpoilerStripOverview,
                    userState.Prefs?.HideSeriesDescriptions)
                : ShouldStrip(cfg.SpoilerStripOverview, userState.Prefs?.HideEpisodeDescriptions);

        // Server-side sanitizer for the admin-supplied placeholder. The
        // configPage JS already strips tags + brackets on save, but an
        // admin who edited the XML config on disk would bypass that. Cap
        // length too — admin can't make a 1MB placeholder amplify every
        // response. Defense-in-depth: also strip HTML-entity sequences
        // (`&#60;` / `&lt;` etc.) so a future consumer that switches to
        // innerHTML doesn't materialize them as `<`.
        //
        // Scope: this sanitization is HTML-context defense only. It does
        // NOT defend a JS-eval consumer (hex-escape sequences survive
        // intact and are harmless in HTML context but would execute in a
        // JS-eval context). No JE consumer evals Overview today; if that
        // ever changes, the sanitizer must be re-evaluated.
        internal static string SanitizePlaceholder(string? raw)
        {
            if (string.IsNullOrEmpty(raw)) return "Spoiler Guard activated";
            var trimmed = raw.Length > 200 ? raw.Substring(0, 200) : raw;
            var stripped = _htmlTagRe.Replace(trimmed, string.Empty)
                .Replace("<", string.Empty)
                .Replace(">", string.Empty)
                .Replace("\"", string.Empty)
                .Replace("'", string.Empty)
                .Replace("`", string.Empty)
                .Replace("&", string.Empty);
            return string.IsNullOrWhiteSpace(stripped) ? "Spoiler Guard activated" : stripped;
        }

        // Field-stripping body. Each block is gated on its own admin
        // toggle. All strip toggles default ON (strict-by-default posture,
        // matching PluginConfiguration.cs / configPage.html / the docs); an
        // admin relaxes individual categories rather than opting into them.
        // Instance (was static) so it can call the server-side fallback
        // for PlaybackPositionTicks when item.UserData is null
        // (enableUserData=false response shape). The userId arg is used
        // only by that fallback path.
        internal void ApplyStripping(BaseItemDto item, UserSpoilerBlur userState, PluginConfiguration cfg, Guid userId, CategoryReveal reveal = default)
        {
            // Effective per-item toggles: the base admin+user decision, minus
            // any advanced-mode category reveal for this specific episode.
            // reveal is default(None) on every non-episode path and whenever
            // advanced mode is off, so these reduce to the base toggles.
            var stripOverview = ShouldStripOverview(item, userState, cfg) && !reveal.Overview;
            var stripRatings = ShouldStrip(cfg.SpoilerStripRatings, userState.Prefs?.HideRatings) && !reveal.Ratings;
            var replaceTitle = ShouldStrip(cfg.SpoilerReplaceTitle, userState.Prefs?.ReplaceEpisodeTitles) && !reveal.Title;

            // Overview (episode / item synopsis) — single biggest spoiler vector.
            // Series uses its own policy; every other guarded DTO keeps the
            // established episode-description policy for compatibility.
            // Replace with the admin-configured placeholder so clients
            // don't render an empty "Description" header. We *replace*
            // rather than null because a literal null causes some clients
            // to fall back to the series description, which can also leak
            // ("the season everyone dies").
            //
            // Defense-in-depth: sanitize the placeholder server-side
            // even though the configPage save handler also strips tags.
            // Defends against a config XML that was edited directly on
            // disk bypassing the JS save path.
            if (stripOverview && !string.IsNullOrEmpty(item.Overview))
            {
                item.Overview = SanitizePlaceholder(cfg.SpoilerOverviewPlaceholder);
            }

            // Tags — TMDB tags often contain spoiler phrases like
            // "Death of a main character" or "Wedding". Empty array
            // (not null) matches what Jellyfin returns for an item
            // legitimately without tags.
            if (ShouldStrip(cfg.SpoilerStripTags, userState.Prefs?.HideTags) && item.Tags != null && item.Tags.Length > 0)
            {
                item.Tags = Array.Empty<string>();
            }

            // Chapter NAMES — a chapter named "X reveals Y" is a major
            // spoiler. Strip the name but KEEP the timestamp (StartPositionTicks)
            // so the player's seek bar still shows the chapter divider; the
            // user can navigate via timestamp without the spoiler text.
            //
            // Progressive-strip for Movies: only strip chapters whose
            // StartPositionTicks is AFTER the user's current playback
            // position. Already-watched chapters retain their names so a
            // half-finished movie shows scene names + thumbnails up to the
            // user's resume point, then hides everything after. For
            // Episodes (binary watched/unwatched semantics) the full strip
            // still applies — no "half-watched" episode mode.
            if (ShouldStrip(cfg.SpoilerStripChapters, userState.Prefs?.HideChapterNames) && item.Chapters != null)
            {
                long? watchedThroughTicks = null;
                if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Movie)
                {
                    if (item.UserData != null)
                    {
                        // PlaybackPositionTicks reflects the resume point.
                        // When the movie is fully Played, treat as watched
                        // through End so all chapter names show.
                        if (item.UserData.Played)
                        {
                            watchedThroughTicks = long.MaxValue;
                        }
                        else if (item.UserData.PlaybackPositionTicks > 0)
                        {
                            watchedThroughTicks = item.UserData.PlaybackPositionTicks;
                        }
                    }
                    else
                    {
                        // UserData omitted (lite client with
                        // enableUserData=false). Server-side fallback so a
                        // half-watched movie still shows pre-resume-point
                        // chapter names instead of stripping all of them.
                        watchedThroughTicks = _watchState.ResolveWatchedThroughTicksServerSide(userId, item.Id);
                    }
                }

                int chapterNumber = 0;
                foreach (var ch in item.Chapters)
                {
                    if (ch == null) continue;
                    chapterNumber++;
                    // Strict-less-than. At the exact resume boundary, the
                    // chapter that STARTS at that tick has not been
                    // watched yet — its name is still a future spoiler.
                    // Use `<` so the current chapter is hidden until
                    // playback advances past its start.
                    if (watchedThroughTicks.HasValue
                        && ch.StartPositionTicks < watchedThroughTicks.Value)
                    {
                        // Pre-resume-point chapter — keep its name and
                        // ImagePath visible.
                        continue;
                    }
                    // Replace with a generic number rather than null.
                    // Some Jellyfin clients render `null` Name as the
                    // literal string "undefined" (web client's chapter
                    // rail observed). "Chapter N" gives the user a stable
                    // label without leaking the original spoilery name.
                    ch.Name = $"Chapter {chapterNumber}";
                }
            }

            // Taglines — TMDB taglines like "Everything changes tonight"
            // are pure spoiler bait. Empty array, same reasoning as Tags.
            if (ShouldStrip(cfg.SpoilerStripTaglines, userState.Prefs?.HideTaglines) && item.Taglines != null)
            {
                item.Taglines = Array.Empty<string>();
            }

            // Ratings — a 9.8/10 community rating or a critic rating on a
            // specific episode implies a major event. Both are covered by the
            // single SpoilerStripRatings toggle. On by default (admins can
            // relax it). Setting to null is the right call — empty/zero would
            // render as "0/10" in some clients.
            if (stripRatings)
            {
                item.CommunityRating = null;
                item.CriticRating = null;
            }

            // PremiereDate (air date) — a multi-month gap before an episode
            // can imply "season finale" / "long-anticipated reveal". On by
            // default (admins can relax it). Clearing this also helps with calendar
            // surfaces that show "airs on YYYY-MM-DD" — though those
            // surfaces are mostly unaired (i.e. the user has no chance to
            // watch yet) and would not be in the spoiler list anyway.
            if (ShouldStrip(cfg.SpoilerStripPremiereDate, userState.Prefs?.HideAirDate))
            {
                item.PremiereDate = null;
            }

            // Cast stripping. Two modes:
            //   - "GuestStars" (default when SpoilerStripCast on): drop only
            //     People whose Type matches the GuestStar enum value.
            //     Leaves the regular cast in place — they appear in every
            //     episode anyway, so they don't reveal anything new about
            //     this one.
            //   - "All": drop the entire People array. Strict mode for
            //     paranoid Spoiler Guard users; some shows leak via the
            //     regular cast appearing or not appearing in a given
            //     episode (e.g. a recurring villain return).
            // Always uses BaseItemPerson.Type string comparison so we don't
            // pull in a hard reference to PersonKind enum from elsewhere.
            if (ShouldStrip(cfg.SpoilerStripCast, userState.Prefs?.HideCast) && item.People != null && item.People.Length > 0)
            {
                if (string.Equals(cfg.SpoilerStripCastMode, "All", StringComparison.OrdinalIgnoreCase))
                {
                    item.People = Array.Empty<BaseItemPerson>();
                }
                else
                {
                    // GuestStars-only mode (default). Pre-scan for any
                    // GuestStar entry before allocating — avoids list
                    // allocation on every cast-bearing item when no
                    // GuestStars are present (typical for cartoon series).
                    bool hasGuest = false;
                    foreach (var p in item.People)
                    {
                        if (p != null && p.Type == Jellyfin.Data.Enums.PersonKind.GuestStar)
                        {
                            hasGuest = true;
                            break;
                        }
                    }
                    if (hasGuest)
                    {
                        var kept = new List<BaseItemPerson>(item.People.Length);
                        foreach (var p in item.People)
                        {
                            if (p == null) continue;
                            if (p.Type == Jellyfin.Data.Enums.PersonKind.GuestStar) continue;
                            kept.Add(p);
                        }
                        item.People = kept.ToArray();
                    }
                }
            }

            // Title replacement — "The Death of X" → "Season 2, Episode 6"
            // for Episodes; for Seasons, replace with "Season N" only when
            // IndexNumber is set. On by default (admins can relax it) — the
            // trade-off is that some clients use Name in navigation tooltips,
            // breadcrumbs, and "now playing" overlays where the synthesized
            // title can look jarring.
            if (replaceTitle)
            {
                if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Episode
                    && item.IndexNumber.HasValue
                    && item.ParentIndexNumber.HasValue)
                {
                    item.Name = $"Season {item.ParentIndexNumber.Value}, Episode {item.IndexNumber.Value}";
                    item.SortName = null;
                    item.OriginalTitle = null;
                }
                else if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Season
                    && item.IndexNumber.HasValue)
                {
                    item.Name = $"Season {item.IndexNumber.Value}";
                    item.SortName = null;
                    item.OriginalTitle = null;
                }
                // Movie titles intentionally NOT rewritten — the movie
                // title is OK to surface (it's already in URLs / library
                // nav anyway), only the synopsis / chapter / cast /
                // artwork content needs spoiler treatment for movies.
            }

            // When title replacement OR overview strip is on, aggressively
            // sanitize ALL title-bearing fields. The BaseItemDto has many
            // nested surfaces that can leak the episode title in practice
            // (MediaSources[].Path → tag-cache StreamData → /Items
            // endpoint MediaStreams → nested MediaSources MediaStreams →
            // MediaAttachments → RemoteTrailers → People[].Role →
            // ChapterInfo.ImagePath → EpisodeTitle / ...). Treat this as
            // deny-by-default: aggressively null every field that COULD
            // carry the episode title. Future BaseItemDto fields added by
            // Jellyfin must be assumed-leaky until proven otherwise.
            if (replaceTitle
                || stripOverview)
            {
                // Top-level title-bearing string fields.
                if (!string.IsNullOrEmpty(item.Path)) item.Path = null;
                item.EpisodeTitle = null;
                item.ForcedSortName = null;
                item.CustomRating = null;

                // External link arrays whose Url slug or Name commonly
                // contains the episode title.
                item.RemoteTrailers = null;
                item.ExternalUrls = null;

                SpoilerMediaSourceSanitizer.StripStreams(item.MediaStreams);
                SpoilerMediaSourceSanitizer.StripSources(
                    item.MediaSources, preserveVersionName: item.Type == Jellyfin.Data.Enums.BaseItemKind.Movie);

                // People[].Role (the character name) is an episode-level
                // spoiler regardless of cast strip mode. The cast strip
                // toggles drop the array entirely or filter GuestStars; in
                // BOTH cases this loop is a no-op (kept people are
                // removed elsewhere) or strips Role on the remaining
                // People to plug "recurring villain in role 'Resurrected
                // Optimus'" leaks.
                if (item.People != null)
                {
                    foreach (var p in item.People)
                    {
                        if (p == null) continue;
                        p.Role = null;
                    }
                }

                // ChapterInfo.ImagePath leaks server filesystem path.
                // Strip whenever title-strip is on, BUT respect the same
                // progressive-strip carve-out for movies — already-watched
                // chapter thumbnails stay visible (the user already saw
                // those scenes).
                if (item.Chapters != null)
                {
                    long? watchedThroughTicksForImg = null;
                    if (item.Type == Jellyfin.Data.Enums.BaseItemKind.Movie)
                    {
                        if (item.UserData != null)
                        {
                            if (item.UserData.Played) watchedThroughTicksForImg = long.MaxValue;
                            else if (item.UserData.PlaybackPositionTicks > 0)
                                watchedThroughTicksForImg = item.UserData.PlaybackPositionTicks;
                        }
                        else
                        {
                            watchedThroughTicksForImg = _watchState.ResolveWatchedThroughTicksServerSide(userId, item.Id);
                        }
                    }
                    foreach (var ch in item.Chapters)
                    {
                        if (ch == null) continue;
                        // Strict-less-than (boundary).
                        if (watchedThroughTicksForImg.HasValue
                            && ch.StartPositionTicks < watchedThroughTicksForImg.Value)
                        {
                            continue;
                        }
                        ch.ImagePath = null;
                    }
                }
            }
        }

    }
}
