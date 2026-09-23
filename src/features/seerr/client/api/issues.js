// Seerr issues: registered before api.js and composed with its shared transport.
(function(JE) {
    'use strict';

    JE.jellyseerrApiModules = JE.jellyseerrApiModules || {};
    JE.jellyseerrApiModules.issues = function({ api, get, post, logPrefix }) {
        /**
         * Fetches existing issues for a Seerr media (by TMDB id + type).
         * @param {number|string} tmdbId
         * @param {'movie'|'tv'} mediaType
         * @param {object} [options]
         * @param {number} [options.take=20]
         * @param {number} [options.skip=0]
         * @param {'open'|'resolved'|'all'} [options.filter='open']
         * @returns {Promise<{pageInfo?: object, results: Array}>}
         */
        api.fetchIssuesForMedia = async function(tmdbId, mediaType, options = {}) {
            const { take = 20, skip = 0, filter = 'open', sort = 'added' } = options;
            try {
                const query = new URLSearchParams({
                    take: String(take),
                    skip: String(skip),
                    filter,
                    sort
                });

                const res = await get(`/issue?${query.toString()}`);
                const issues = res && Array.isArray(res.results) ? res.results : [];

                const filtered = issues.filter(issue => {
                    const media = issue.media || {};
                    const tmdbMatch = media.tmdbId && Number(media.tmdbId) === Number(tmdbId);
                    const typeMatch = (media.mediaType || '').toLowerCase() === (mediaType || '').toLowerCase();
                    return tmdbMatch && typeMatch;
                });

                return { ...res, results: filtered };
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch issues for ${mediaType} ${tmdbId}:`, error);
                return { results: [] };
            }
        };

        /**
         * Fetch a single issue by ID, including full comment details.
         * @param {number} issueId
         * @returns {Promise<object|null>}
         */
        api.fetchIssueById = async function(issueId) {
            try {
                const res = await get(`/issue/${issueId}`);
                return res || null;
            } catch (error) {
                console.warn(`${logPrefix} Failed to fetch issue ${issueId}:`, error);
                return null;
            }
        };

        /**
         * Reports an issue for a media item to Seerr.
         * @param {number} mediaId - The TMDB/TVDB ID of the media.
         * @param {string} mediaType - 'movie' or 'tv'.
         * @param {string} problemType - Type of issue (e.g., 'no_season', 'episode_missing', etc.).
         * @param {string} [message=''] - Optional description of the issue.
         * @returns {Promise<any>} - The response from Seerr.
         */
        /**
         * Maps problem types to Seerr issue types and season/episode info
         * Seerr uses: VIDEO (1), AUDIO (2), SUBTITLES (3), OTHER (4)
         */
        // NOTE: Previous mappings for textual problem types were removed —
        // the current implementation expects a numeric issueType (1..4)
        // to be provided by the UI. Keep logic in `api.reportIssue` that
        // parses the numeric value and forwards it to Seerr.

        api.reportIssue = async function(mediaId, mediaType, problemType, message = '', problemSeason = 0, problemEpisode = 0) {
            try {
                // problemType is now a numeric issue type (1, 2, 3, or 4) from the form
                const issueType = parseInt(problemType) || 4;

                // Fetch the correct internal media id from Seerr

                let apiResult = null;
                if (mediaType === 'movie') {
                    apiResult = await get(`/movie/${mediaId}`);
                } else if (mediaType === 'tv') {
                    apiResult = await get(`/tv/${mediaId}`);
                }

                const internalId = apiResult && apiResult.mediaInfo && apiResult.mediaInfo.id;
                if (!internalId) {
                    throw new Error(`Could not find Jellyseerr media id (mediaInfo.id) for TMDB id ${mediaId} (${mediaType})`);
                }
                console.debug(`${logPrefix} Retrieved internal media id for issue report:`, internalId);

                const body = {
                    mediaId: parseInt(internalId),
                    issueType: issueType,
                    problemSeason: parseInt(problemSeason) || 0,
                    problemEpisode: parseInt(problemEpisode) || 0,
                    message: message || ''
                };

                console.debug(`${logPrefix} Sending issue report with body:`, body);
                const result = await post('/issue', body);
                console.debug(`${logPrefix} Issue reported for Seerr media ID ${internalId} (TMDB ${mediaId}, ${mediaType}): ${problemType}`);
                return result;
            } catch (error) {
                console.error(`${logPrefix} Failed to report issue for TMDB ID ${mediaId}:`, error);
                throw error;
            }
        };
    };
})(window.JellyfinEnhanced);
