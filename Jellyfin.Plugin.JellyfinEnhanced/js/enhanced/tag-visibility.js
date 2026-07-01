/**
 * @file Per-tag "show on" visibility filter for poster tags.
 *
 * Issue #561: users want granular control over WHERE poster tags appear —
 * e.g. hide rating tags on episodes, or on the Continue Watching / Next Up
 * home rows — without disabling the tag type entirely.
 *
 * This module is the single source of truth for that decision. The unified
 * tag pipeline (tag-pipeline.js) consults it once per card, per renderer,
 * right before handing a card to a renderer. Keeping the logic here (rather
 * than in each of the four tag modules) means the tag modules need zero
 * changes and the behaviour is guaranteed identical across quality/genre/
 * language/rating.
 *
 * Settings model: each tag type has a per-user nested object
 *   JE.currentSettings[`${tag}TagsScope`] = { movies, shows, episodes,
 *                                             continueWatching, nextUp }
 * where every flag defaults to true. A missing object or missing key is
 * treated as `true`, so the filter is purely opt-in — existing users, and any
 * render that happens before settings finish loading, see tags everywhere
 * exactly as before.
 *
 * Detection is intentionally locale-independent (titles are translated/themed):
 *   - Next Up:           the enclosing `.verticalSection` links to the Next Up
 *                        list (`a[href*="type=nextup"]`).
 *   - Continue Watching: the card carries `data-positionticks` (a resume
 *                        position) and lives on the home page (`#indexPage`).
 * Content type comes from the item/DOM type, not any displayed string.
 */
(function (JE) {
    'use strict';

    // Scope keys, in display order. These match both the C# TagScopeSettings
    // property names (camelCase ↔ PascalCase round-trip) and the checkbox
    // `data-scope-key` values in the settings panel.
    const CONTENT_KEYS = ['movies', 'shows', 'episodes'];
    const SECTION_KEYS = ['continueWatching', 'nextUp'];
    const SCOPE_KEYS = [...CONTENT_KEYS, ...SECTION_KEYS];

    /**
     * Map a Jellyfin item type to a content-scope key.
     * @param {string|null|undefined} itemType - e.g. "Movie", "Series", "Episode".
     * @returns {('movies'|'shows'|'episodes'|null)} The content key, or null when
     *   the type is unknown/untargeted (in which case the content filter is skipped).
     */
    function contentTypeOf(itemType) {
        if (!itemType) return null;
        switch (String(itemType).toLowerCase()) {
            case 'movie': return 'movies';
            case 'series':
            case 'season': return 'shows';
            case 'episode': return 'episodes';
            default: return null;
        }
    }

    /**
     * Detect which home row (if any) a card element sits in, using
     * locale-independent DOM signals.
     * @param {HTMLElement} el - The card image container being tagged.
     * @returns {('continueWatching'|'nextUp'|null)}
     */
    function sectionOf(el) {
        if (!el || typeof el.closest !== 'function') return null;
        // Next Up: the row header links to the Next Up list. Locale-independent;
        // present in the desktop/mobile layouts (the TV/10-foot layout renders the
        // header without an anchor, so Next Up scope is not enforced there — the
        // content-type filters still apply).
        const section = el.closest('.verticalSection');
        if (section && section.querySelector('a[href*="type=nextup"]')) return 'nextUp';
        // Continue Watching: a card with a resume position (`data-positionticks`,
        // exactly how Jellyfin marks a resumable item) sitting in a playback-
        // monitored home row. Jellyfin tags the resume / Next Up rows' items
        // container with `data-monitor` containing "videoplayback" (homesections.js)
        // but does NOT tag Latest / Recently Added rows — so requiring it prevents
        // an in-progress item that also shows in a Recently Added row from being
        // misclassified as Continue Watching. This is layout-independent (works on
        // TV too) and fails open: if the marker is ever absent, the CW filter simply
        // doesn't apply (tags show) rather than hiding tags incorrectly. Scoped to
        // the home page (`#indexPage`).
        if (el.closest('#indexPage') &&
            el.closest('[data-monitor*="videoplayback"]') &&
            el.closest('[data-positionticks]')) {
            return 'continueWatching';
        }
        return null;
    }

    /**
     * Compute the visibility context for a single card. Cheap and pure — the
     * pipeline calls this once per card and reuses the result across renderers.
     * @param {HTMLElement} el - The card image container.
     * @param {string|null|undefined} itemType - Item type (DOM data-type or item.Type).
     * @returns {{contentType: (string|null), section: (string|null)}}
     */
    function contextFor(el, itemType) {
        return { contentType: contentTypeOf(itemType), section: sectionOf(el) };
    }

    /**
     * Decide whether a given tag type may render on a card with this context.
     * Defaults to true whenever settings are absent, so nothing is hidden
     * unless the user explicitly unchecked a dimension.
     * @param {string} tagName - Renderer name: 'quality' | 'genre' | 'language' | 'rating'.
     * @param {{contentType: (string|null), section: (string|null)}} ctx - From contextFor().
     * @returns {boolean} True if the tag should be shown.
     */
    function allows(tagName, ctx) {
        if (!ctx) return true;
        const scope = JE.currentSettings && JE.currentSettings[tagName + 'TagsScope'];
        if (!scope) return true; // no per-user scope set → show everywhere (default)
        // Content-type filter applies wherever the tag renders.
        if (ctx.contentType && scope[ctx.contentType] === false) return false;
        // Section filter only suppresses inside the two detectable home rows.
        if (ctx.section && scope[ctx.section] === false) return false;
        return true;
    }

    JE.tagVisibility = {
        SCOPE_KEYS,
        CONTENT_KEYS,
        SECTION_KEYS,
        contentTypeOf,
        sectionOf,
        contextFor,
        allows
    };
})(window.JellyfinEnhanced);
