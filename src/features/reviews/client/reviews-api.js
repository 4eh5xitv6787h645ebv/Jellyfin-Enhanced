// Review transport and item-to-review key resolution. Mutations remain single-attempt.
(function (JE) {
    'use strict';

    function createReviewApi() {
        const logPrefix = '🪼 Jellyfin Enhanced: Reviews:';

        function fetchReviews(tmdbId, mediaType) {
            const apiMediaType = mediaType === 'Series' ? 'tv' : 'movie';
            const url = `${ApiClient.getUrl(`/JellyfinEnhanced/tmdb/${apiMediaType}/${tmdbId}/reviews`)}?language=en-US&page=1`;
            return JE.core.api.fetch(url)
                .then(data => data.results || [])
                .catch(error => {
                    console.error(`${logPrefix} Failed to fetch reviews.`, error);
                    return null;
                });
        }

        /**
         * Fetches all user-written reviews for a TMDB item (aggregated across all users).
         */
        function fetchUserReviews(tmdbId, mediaType) {
            // mediaType is already in API format ('movie' or 'tv') — no conversion needed
            return JE.core.api.plugin(`/reviews/${mediaType}/${tmdbId}`)
                .then(data => data.reviews || [])
                .catch(err => {
                    console.error(`${logPrefix} Failed to fetch user reviews.`, err);
                    return [];
                });
        }

        /**
         * Saves (creates or updates) the current user's review for a TMDB item.
         */
        async function saveUserReview(tmdbId, mediaType, content, rating) {
            const body = { content, rating: rating || null };
            try {
                // skipRetry: saving a review is not idempotent — never auto-repeat it.
                return await JE.core.api.plugin(`/reviews/${mediaType}/${tmdbId}`, {
                    method: 'POST',
                    body,
                    skipRetry: true
                });
            } catch (e) {
                // Preserve the server-provided message when present, matching the
                // hand-rolled fetch's `err.message || \`HTTP ${status}\`` shape.
                throw new Error(e?.responseJSON?.message || e.message);
            }
        }

        /**
         * Deletes the current user's review for a TMDB item.
         */
        async function deleteUserReview(tmdbId, mediaType) {
            // skipRetry keeps the original single-attempt semantics for this mutation.
            // Core throws Error('HTTP <status>') on failure — same shape as before.
            await JE.core.api.plugin(`/reviews/${mediaType}/${tmdbId}`, { method: 'DELETE', skipRetry: true });
        }

        /**
         * Admin moderation: deletes another user's review for a TMDB item.
         * Backed by DELETE /JellyfinEnhanced/reviews/admin/{userIdN}/{mediaType}/{tmdbId},
         * which is gated on IsAdministrator server-side. A 404 from the
         * server now means "no matching review to delete" (race with a
         * concurrent admin, already-deleted review, wrong target) — we
         * translate that into a human-readable Error so the caller can
         * show a sensible message.
         */
        async function adminDeleteUserReview(targetUserId, tmdbId, mediaType) {
            const userIdN = (targetUserId || '').replace(/-/g, '');
            try {
                // skipRetry keeps the original single-attempt semantics for this mutation.
                await JE.core.api.plugin(`/reviews/admin/${userIdN}/${mediaType}/${tmdbId}`, { method: 'DELETE', skipRetry: true });
            } catch (e) {
                if (e && e.status === 404) {
                    throw new Error('No matching review to delete (it may have already been removed).');
                }
                throw e;
            }
        }

        async function resolveReviewTarget(item, userId) {
            const mediaType = item?.Type;
            let tmdbKey = null;
            let apiMediaType;

            if (mediaType === 'Movie') {
                const tmdbId = item?.ProviderIds?.Tmdb;
                if (!tmdbId) return;
                tmdbKey = String(tmdbId);
                apiMediaType = 'movie';
            } else if (mediaType === 'Series') {
                const tmdbId = item?.ProviderIds?.Tmdb;
                if (!tmdbId) return;
                tmdbKey = String(tmdbId);
                apiMediaType = 'tv';
            } else if (mediaType === 'Season') {
                let seriesTmdbId = item?.SeriesProviderIds?.Tmdb;
                if (!seriesTmdbId && item?.SeriesId) {
                    try {
                        const series = await ApiClient.getItem(userId, item.SeriesId);
                        seriesTmdbId = series?.ProviderIds?.Tmdb;
                    } catch (_) {}
                }
                if (!seriesTmdbId || item?.IndexNumber == null) return;
                tmdbKey = `${seriesTmdbId}:s${item.IndexNumber}`;
                apiMediaType = 'tv';
            } else if (mediaType === 'Episode') {
                let seriesTmdbId = item?.SeriesProviderIds?.Tmdb;
                if (!seriesTmdbId && item?.SeriesId) {
                    try {
                        const series = await ApiClient.getItem(userId, item.SeriesId);
                        seriesTmdbId = series?.ProviderIds?.Tmdb;
                    } catch (_) {}
                }
                if (!seriesTmdbId || item?.ParentIndexNumber == null || item?.IndexNumber == null) return;
                tmdbKey = `${seriesTmdbId}:s${item.ParentIndexNumber}:e${item.IndexNumber}`;
                apiMediaType = 'tv';
            } else {
                return;
            }

            return { tmdbKey, apiMediaType };
        }

        return { fetchReviews, fetchUserReviews, saveUserReview, deleteUserReview, adminDeleteUserReview, resolveReviewTarget };
    }

    JE.reviewApi = { create: createReviewApi };
})(window.JellyfinEnhanced);
