// @ts-check
// Client-side rating and reviews suppression decisions.
(function(JE) {
    'use strict';

    JE.internals = JE.internals || {};
    /** @type {any} Shared cross-file namespace; each module contributes a focused surface. */
    const internal = JE.internals.spoilerGuard = JE.internals.spoilerGuard || {};

    internal.shouldSuppressRatingTag = function(item) {
        try {
            if (!item || JE.pluginConfig?.SpoilerBlurEnabled !== true) return false;
            if (JE.pluginConfig.SpoilerStripRatings === false) return false;
            if (internal.getUserPrefs().HideRatings === false) return false;
            const ready = internal.isLoadOk();
            if (item.Type === 'Series') return item.Id ? (ready ? internal.isEnabledFor(item.Id) : true) : false;
            if (item.Type === 'Season') return item.SeriesId ? (ready ? internal.isEnabledFor(item.SeriesId) : true) : false;
            if (item.Type === 'Episode') {
                if (item.UserData?.Played === true) return false;
                return item.SeriesId ? (ready ? internal.isEnabledFor(item.SeriesId) : true) : false;
            }
            if (item.Type === 'Movie') return item.Id ? (ready ? internal.isMovieEnabledFor(item.Id) : true) : false;
            return false;
        } catch (_) {
            return JE.pluginConfig?.SpoilerBlurEnabled === true;
        }
    };

    internal.shouldSuppressReviews = async function(item, mediaType) {
        const supported = mediaType === 'Series' || mediaType === 'Movie' || mediaType === 'Season' || mediaType === 'Episode';
        if (!supported || JE.pluginConfig?.SpoilerBlurEnabled !== true) return false;
        if (JE.pluginConfig.SpoilerStripReviews === false) return false;
        try {
            await internal.whenLoaded();
            if (!internal.isLoadOk()) return true;
            if (internal.getUserPrefs().HideReviews === false) return false;
            if (mediaType === 'Movie') return internal.isMovieEnabledFor(item?.Id || '');
            const seriesId = mediaType === 'Series' ? item?.Id : item?.SeriesId;
            return internal.isEnabledFor(seriesId || '');
        } catch (_) {
            return true;
        }
    };
})(window.JellyfinEnhanced);
