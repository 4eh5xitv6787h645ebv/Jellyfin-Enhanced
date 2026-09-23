// Seerr catalog: registered before api.js and composed with its shared transport.
(function(JE) {
    'use strict';

    JE.jellyseerrApiModules = JE.jellyseerrApiModules || {};
    JE.jellyseerrApiModules.catalog = function({ api, get, tmdbGet, logPrefix }) {
        /**
         * Performs a search against the Seerr API.
         * @param {string} query - The search term.
         * @param {number} [page=1] - Page number for pagination.
         * @returns {Promise<{results: Array, page: number, totalPages: number, totalResults: number}>}
         */
        api.search = async function(query, page = 1, options = {}) {
            const { skipCache = false, signal, throwOnError = false } = options;
            try {
                const lang = (navigator.language || 'en').split('-')[0];
                const data = await get(`/search?query=${encodeURIComponent(query)}&page=${page}&language=${lang}`, { skipCache, signal });

                // Filter out people results before returning (immutable — don't mutate cached response)
                if (data.results) {
                    const filteredResults = data.results.filter(result => result.mediaType !== 'person');
                    return { ...data, results: filteredResults, totalResults: filteredResults.length };
                }

                return data;
            } catch (error) {
                // Superseded search — let the caller drop it instead of rendering "no results".
                if (error.name === 'AbortError' || throwOnError) throw error;
                console.error('%s Search failed for query "%s":', logPrefix, query, error);
                return { results: [] };
            }
        };

        /**
         * Fetches collection information for a movie from TMDB via proxy
         * @param {number} tmdbId
         * @returns {Promise<{id:number,name:string,posterPath?:string,backdropPath?:string}|null>}
         */
        api.fetchMovieCollection = async function(tmdbId, options = {}) {
            const { signal } = options;
            try {
                // Try Seerr movie detail first (includes collection field directly)
                const jellyseerrRes = await get(`/movie/${tmdbId}`, { signal });
                if (jellyseerrRes?.collection) {
                    const c = jellyseerrRes.collection;
                    return {
                        id: c.id,
                        name: c.name,
                        posterPath: c.posterPath,
                        backdropPath: c.backdropPath
                    };
                }

                // Fallback to TMDB proxy
                if (JE.pluginConfig?.TmdbEnabled) {
                    const res = await tmdbGet(`/movie/${tmdbId}`, { signal });
                    const belongs = res?.belongs_to_collection || res?.belongsToCollection;
                    if (belongs && (belongs.id || belongs.tmdbId)) {
                        return {
                            id: belongs.id || belongs.tmdbId,
                            name: belongs.name,
                            posterPath: belongs.poster_path || belongs.posterPath,
                            backdropPath: belongs.backdrop_path || belongs.backdropPath
                        };
                    }
                }
                return null;
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                console.debug(`${logPrefix} No collection found for movie ${tmdbId}:`, error);
                return null;
            }
        };

        /**
         * Adds collection membership information to movie items in search results
         * @param {Array} results
         * @returns {Promise<Array>}
         */
        api.addCollections = async function(results, options = {}) {
            if (!results || results.length === 0) return results;
            const { signal } = options;

            // Look movies up a few at a time so the per-movie detail calls leave
            // request slots free for the result pages infinite scroll is loading.
            const out = results.slice();
            const movieIndexes = [];
            results.forEach((item, i) => { if (item.mediaType === 'movie') movieIndexes.push(i); });
            const CHUNK = 4;
            for (let c = 0; c < movieIndexes.length; c += CHUNK) {
                if (signal?.aborted) break;
                await Promise.all(movieIndexes.slice(c, c + CHUNK).map(async (i) => {
                    try {
                        const collection = await api.fetchMovieCollection(results[i].id, { signal });
                        if (collection) out[i] = { ...results[i], collection };
                    } catch (e) {
                        // ignore per-movie errors (including AbortError — superseded search)
                    }
                }));
            }
            return out;
        };

        /**
         * Fetches detailed information for a specific TV show from Seerr.
         * @param {number} tmdbId - The TMDB ID of the TV show.
         * @returns {Promise<object|null>}
         */
        api.fetchTvShowDetails = async function(tmdbId) {
            try {
                return await get(`/tv/${tmdbId}`);
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch TV show details for TMDB ID ${tmdbId}:`, error);
                return null;
            }
        };

        /**
         * Fetches season detail with episodes from Seerr.
         * @param {number} tmdbId - The TMDB ID of the TV show.
         * @param {number} seasonNumber - The season number.
         * @returns {Promise<object|null>}
         */
        api.fetchTvSeasonDetails = async function(tmdbId, seasonNumber) {
            try {
                return await get(`/tv/${tmdbId}/season/${seasonNumber}`);
            } catch (error) {
                console.debug(`${logPrefix} Failed to fetch season ${seasonNumber} for TMDB ID ${tmdbId}:`, error);
                return null;
            }
        };

        /**
         * Fetches TV show details from TMDB directly (bypasses Seerr metadata provider).
         * Useful for getting season air dates when Seerr uses TheTVDB (which omits them).
         * @param {number} tmdbId - The TMDB ID of the TV show.
         * @returns {Promise<object|null>}
         */
        api.fetchTmdbTvDetails = async function(tmdbId) {
            try {
                return await tmdbGet(`/tv/${tmdbId}`);
            } catch (error) {
                console.debug(`${logPrefix} Failed to fetch TMDB TV details for ID ${tmdbId}:`, error);
                return null;
            }
        };

        /**
         * Fetches related media (similar or recommendations) for a given TMDB ID.
         * @param {string} mediaType - 'movie' or 'tv'.
         * @param {number} tmdbId - The TMDB ID.
         * @param {string} relation - 'similar' or 'recommendations'.
         * @param {number|object} [pageOrOptions=1] - Page number or options object with page property.
         * @returns {Promise<{results: Array, page: number, totalPages: number}>}
         */
        async function fetchRelated(mediaType, tmdbId, relation, pageOrOptions = 1) {
            const page = typeof pageOrOptions === 'number' ? pageOrOptions : (pageOrOptions.page || 1);
            const options = typeof pageOrOptions === 'object' ? pageOrOptions : {};
            try {
                return await get(`/${mediaType}/${tmdbId}/${relation}?page=${page}`, options);
            } catch (error) {
                if (error.name === 'AbortError') throw error;
                console.error(`${logPrefix} Failed to fetch ${relation} ${mediaType} for TMDB ID ${tmdbId}:`, error);
                return { results: [], page: 1, totalPages: 0, totalResults: 0 };
            }
        }

        api.fetchSimilarMovies = (tmdbId, pageOrOptions) => fetchRelated('movie', tmdbId, 'similar', pageOrOptions);
        api.fetchRecommendedMovies = (tmdbId, pageOrOptions) => fetchRelated('movie', tmdbId, 'recommendations', pageOrOptions);
        api.fetchSimilarTvShows = (tmdbId, pageOrOptions) => fetchRelated('tv', tmdbId, 'similar', pageOrOptions);
        api.fetchRecommendedTvShows = (tmdbId, pageOrOptions) => fetchRelated('tv', tmdbId, 'recommendations', pageOrOptions);

        /**
         * Fetches detailed information for a specific movie from Seerr.
         * @param {number} tmdbId - The TMDB ID of the movie.
         * @returns {Promise<object|null>}
         */
        api.fetchMovieDetails = async function(tmdbId) {
            try {
                return await get(`/movie/${tmdbId}`);
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch movie details for TMDB ID ${tmdbId}:`, error);
                return null;
            }
        };

        /**
         * Fetches collection details from Seerr.
         * @param {number} collectionId - The TMDB collection ID.
         * @returns {Promise<object|null>}
         */
        api.fetchCollectionDetails = async function(collectionId) {
            try {
                return await get(`/collection/${collectionId}`);
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch collection details for ID ${collectionId}:`, error);
                return null;
            }
        };

        /**
         * Fetches genre slider data (genres with backdrop images) from Seerr.
         * @param {'movie'|'tv'} mediaType
         * @returns {Promise<Array>}
         */
        api.fetchGenreSlider = async function(mediaType) {
            const type = mediaType === 'movie' ? 'movie' : 'tv';
            try {
                return await get(`/discover/genreslider/${type}`);
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch genre slider for ${type}:`, error);
                return [];
            }
        };
    };
})(window.JellyfinEnhanced);
