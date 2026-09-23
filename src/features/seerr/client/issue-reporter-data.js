// issue-reporter-data.js
// Internal issue-reporting component; loaded before issue-reporter.js.
(function (JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Issue Reporter:';
    const issueReporter = {};

    /**
     * Checks if issue reporting is available.
     * Resolves TMDB via parent series or fallback for Season/Episode items.
     * Returns: 'available', 'no-tmdb', 'no-jellyseerr', or 'no-both'
     * @returns {Promise<string>}
     */
    issueReporter.checkReportingAvailability = async function (item) {
        try {
            // Check Jellyseerr status first
            const statusUrl = ApiClient.getUrl('/JellyfinEnhanced/jellyseerr/status');
            const statusRes = await ApiClient.ajax({ type: 'GET', url: statusUrl, dataType: 'json' });
            const jellyseerrActive = statusRes && statusRes.active === true;

            // Resolve TMDB ID: direct, parent (for Season/Episode), or fallback search
            let tmdbId = item && (item.ProviderIds?.Tmdb || item.ProviderIds?.['Tmdb']);
            const type = item?.Type;

            // If Season or Episode without TMDB, attempt parent series
            if (!tmdbId && (type === 'Season' || type === 'Episode')) {
                try {
                    const parentId = item.SeriesId || item.ParentId || (item.Series && item.Series.Id) || null;
                    const userId = ApiClient.getCurrentUserId();
                    if (parentId && userId) {
                        const parentItem = JE.helpers?.getItemCached
                            ? await JE.helpers.getItemCached(parentId, { userId })
                            : await ApiClient.getItem(userId, parentId);
                        tmdbId = parentItem?.ProviderIds?.Tmdb || parentItem?.ProviderIds?.['Tmdb'] || null;
                        if (tmdbId) {
                            console.debug(`${logPrefix} Availability check resolved TMDB via parent: ${tmdbId}`);
                        }
                    }
                } catch (e) {
                    console.debug(`${logPrefix} Availability check: parent TMDB resolution failed:`, e);
                }
            }
            // Determine availability
            const hasTmdb = !!tmdbId;
            if (!hasTmdb && !jellyseerrActive) {
                return 'no-both';
            } else if (!hasTmdb) {
                return 'no-tmdb';
            } else if (!jellyseerrActive) {
                return 'no-jellyseerr';
            }

            // Both available
            return 'available';
        } catch (error) {
            console.debug(`${logPrefix} Error checking reporting availability:`, error);
            // On error, assume available and let the actual request fail if needed
            return 'available';
        }
    };

    /**
     * Attempts to fetch TMDB ID from external sources as a fallback
     * Uses OMDB API or other methods to find TMDB ID
     */
    issueReporter.getTmdbIdFallback = async function (itemName, mediaType, item) {
        try {
            console.debug(`${logPrefix} Attempting fallback TMDB lookup for ${itemName}`);

            // Check other provider IDs that might help
            if (item.ProviderIds?.Imdb) {
                console.debug(`${logPrefix} Found IMDB ID: ${item.ProviderIds.Imdb}, could use for lookup`);
            }

            // Try to use External URLs which might contain TMDB link
            if (item.ExternalUrls) {
                // Normalize to array of values (ExternalUrls may be an array or an object/map)
                const rawUrls = Array.isArray(item.ExternalUrls) ? item.ExternalUrls : Object.values(item.ExternalUrls || {});

                for (const entry of rawUrls) {
                    try {
                        let urlStr = null;

                        if (typeof entry === 'string') {
                            urlStr = entry;
                        } else if (entry && typeof entry === 'object') {
                            // Common properties that might contain the URL
                            urlStr = entry.Url || entry.url || entry.Value || entry.value || entry.Href || entry.href || entry.Link || entry.link || entry.Path || entry.path || null;

                            // Fallback: scan object's string values for a tmdb link
                            if (!urlStr) {
                                for (const v of Object.values(entry)) {
                                    if (typeof v === 'string' && v.includes('tmdb')) {
                                        urlStr = v;
                                        break;
                                    }
                                }
                            }
                        }

                        if (typeof urlStr === 'string' && urlStr.includes('tmdb')) {
                            const match = urlStr.match(/\/(\d+)/);
                            if (match) {
                                return match[1];
                            }
                        }
                    } catch (e) {
                        // Continue to next entry if any unexpected structure is encountered
                        console.debug(`${logPrefix} Skipping ExternalUrls entry due to error:`, e);
                        continue;
                    }
                }
            }

            // Second-level fallback: query Jellyseerr search by IMDB ID or by title+year
            try {
                if (JE && JE.jellyseerrAPI && typeof JE.jellyseerrAPI.search === 'function') {
                    // Prefer IMDB lookup when available
                    const imdbId = item.ProviderIds?.Imdb;
                    if (imdbId) {
                        console.debug(`${logPrefix} Trying Jellyseerr search by IMDB ID: ${imdbId}`);
                        const res = await JE.jellyseerrAPI.search(imdbId);
                        if (res && Array.isArray(res.results) && res.results.length > 0) {
                            // Prefer a result with matching mediaType
                            const match = res.results.find(r => (r.mediaType === mediaType || (mediaType === 'tv' && r.mediaType === 'tv') || (mediaType === 'movie' && r.mediaType === 'movie')) && r.id);
                            if (match && match.id) {
                                console.log(`${logPrefix} Found TMDB ID via Jellyseerr search (IMDB): ${match.id}`);
                                return String(match.id);
                            }
                            // Otherwise pick first with an id
                            if (res.results[0].id) {
                                console.log(`${logPrefix} Found TMDB ID via Jellyseerr search (IMDB fallback): ${res.results[0].id}`);
                                return String(res.results[0].id);
                            }
                        }
                    }

                    // Try name + year search
                    const year = item.ProductionYear || (item.PremiereDate ? item.PremiereDate.substring(0, 4) : null) || '';
                    const titleQuery = `${item.Name}${year ? ' ' + year : ''}`;
                    console.debug(`${logPrefix} Trying Jellyseerr search by title: "${titleQuery}"`);
                    const res2 = await JE.jellyseerrAPI.search(titleQuery);
                    if (res2 && Array.isArray(res2.results) && res2.results.length > 0) {
                        // Try to find best match: exact title and same year
                        const exact = res2.results.find(r => {
                            const rTitle = (r.title || r.name || '').toString().toLowerCase();
                            const itemTitle = (item.Name || '').toString().toLowerCase();
                            const rYear = (r.releaseDate || r.firstAirDate || '').toString().substring(0, 4) || '';
                            return rTitle === itemTitle && (year === '' || rYear === '' || rYear === String(year));
                        });
                        if (exact && exact.id) {
                            console.log(`${logPrefix} Found TMDB ID via Jellyseerr search (exact title): ${exact.id}`);
                            return String(exact.id);
                        }

                        // Fallback to first result with matching mediaType
                        const byType = res2.results.find(r => (r.mediaType === mediaType || (!r.mediaType && r.id)) && r.id);
                        if (byType && byType.id) {
                            console.log(`${logPrefix} Found TMDB ID via Jellyseerr search (title fallback): ${byType.id}`);
                            return String(byType.id);
                        }
                    }
                }
            } catch (error) {
                console.debug(`${logPrefix} Jellyseerr search fallback failed:`, error);
            }

            return null;
        } catch (error) {
            console.debug(`${logPrefix} Fallback lookup failed:`, error);
            return null;
        }
    };

    // Query only seasons/episodes installed locally; infer season count when absent.
    issueReporter.getAvailableSeasons = async function (item) {
        // Prefer to query the local Jellyfin server for available seasons/episodes
        let normalized = [];
        try {
            // Determine the seriesId to query for seasons
            let seriesId = null;
            if (item?.Type === 'Series') seriesId = item.Id;
            else if (item?.Type === 'Season' || item?.Type === 'Episode') seriesId = item.SeriesId || item.ParentId || (item.Series && item.Series.Id) || null;

            if (seriesId) {
                // Fetch seasons present on the Jellyfin server
                const userId = ApiClient.getCurrentUserId();
                const seasonsRes = await ApiClient.ajax({
                    type: 'GET',
                    url: ApiClient.getUrl('/Items', {
                        ParentId: seriesId,
                        IncludeItemTypes: 'Season',
                        SortBy: 'IndexNumber',
                        SortOrder: 'Ascending',
                        Fields: 'IndexNumber,SeasonNumber',
                        userId: userId
                    }),
                    dataType: 'json'
                });

                const seasonsList = seasonsRes?.Items || [];
                normalized = seasonsList.map(s => ({
                    seasonNumber: parseInt(s.IndexNumber || s.SeasonNumber || s.ParentIndexNumber || 0) || 0,
                    id: s.Id,
                    episodes: []
                })).filter(s => s.seasonNumber > 0);

                // For each season, fetch episodes (only titles and numbers)
                for (const s of normalized) {
                    try {
                        const epsRes = await ApiClient.ajax({
                            type: 'GET',
                            url: ApiClient.getUrl('/Items', {
                                ParentId: s.id,
                                IncludeItemTypes: 'Episode',
                                SortBy: 'IndexNumber',
                                SortOrder: 'Ascending',
                                Fields: 'IndexNumber,Name',
                                userId: ApiClient.getCurrentUserId()
                            }),
                            dataType: 'json'
                        });
                        const eps = epsRes?.Items || [];
                        s.episodes = eps.map(ep => ({ episodeNumber: parseInt(ep.IndexNumber || ep.ParentIndexNumber || ep.Index || 0) || 0, title: ep.Name || ep.Title || '' }));
                    } catch (e) {
                        console.debug(`${logPrefix} Failed to fetch episodes for season ${s.seasonNumber}:`, e);
                        s.episodes = [];
                    }
                }
            }
        } catch (e) {
            console.debug(`${logPrefix} Error fetching seasons/episodes from Jellyfin:`, e);
            normalized = [];
        }

        // If no seasons found on server, fallback to minimal inference
        if (!normalized || normalized.length === 0) {
            const seasonCount = item?.SeasonCount || (item && item.Seasons && item.Seasons.length) || 0;
            if (seasonCount && seasonCount > 0) {
                for (let i = 1; i <= seasonCount; i++) normalized.push({ seasonNumber: i, episodes: [] });
            }
        }

        return normalized;
    };

    JE.jellyseerrIssueReporterData = issueReporter;

})(window.JellyfinEnhanced);
