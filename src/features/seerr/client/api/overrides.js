// Seerr overrides: registered before api.js and composed with its shared transport.
(function(JE) {
    'use strict';

    JE.jellyseerrApiModules = JE.jellyseerrApiModules || {};
    JE.jellyseerrApiModules.overrides = function({ api, get, logPrefix }) {
        // Cache for override rules
        let cachedOverrideRules = null;
        let overrideRulesCachedAt = 0;
        const OVERRIDE_RULES_TTL = 5 * 60 * 1000; // 5 minutes

        /**
         * Fetches override rules from Seerr.
         * @returns {Promise<Array>}
         */
        api.fetchOverrideRules = async function() {
            if (cachedOverrideRules !== null && Date.now() - overrideRulesCachedAt < OVERRIDE_RULES_TTL) {
                return cachedOverrideRules;
            }
            const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
            try {
                const rules = await get('/overrideRule');
                const normalized = Array.isArray(rules) ? rules : [];
                // Don't cache a result that resolved after a user switch.
                if (!JE.session || JE.session.isCurrent(requestEpoch)) {
                    cachedOverrideRules = normalized;
                    overrideRulesCachedAt = Date.now();
                }
                return normalized;
            } catch (error) {
                console.error(`${logPrefix} Failed to fetch override rules:`, error);
                return cachedOverrideRules || [];
            }
        };

        /**
         * Evaluates override rules against media metadata and returns matching rule settings.
         * @param {object} mediaData - Media object with originalLanguage, genres, etc.
         * @param {string} mediaType - 'movie' or 'tv'.
         * @param {boolean} is4k - Whether this is a 4K request.
         * @returns {Promise<object|null>} - Rule settings to apply or null if no match.
         */
        api.evaluateOverrideRules = async function(mediaData, mediaType, is4k = false) {
            try {
                const rules = await api.fetchOverrideRules();
                if (!rules || rules.length === 0) {
                    console.debug(`${logPrefix} No override rules configured`);
                    return null;
                }

                const serviceIdKey = mediaType === 'movie' ? 'radarrServiceId' : 'sonarrServiceId';
                const applicableRules = rules.filter(rule => {
                    // Filter by service type (movie uses radarr, tv uses sonarr)
                    if (rule[serviceIdKey] === null || rule[serviceIdKey] === undefined) {
                        return false;
                    }
                    return true;
                });

                if (applicableRules.length === 0) {
                    console.debug(`${logPrefix} No applicable rules for ${mediaType}`);
                    return null;
                }

                // Find the first matching rule
                for (const rule of applicableRules) {
                    // Check language condition (pipe-separated ISO codes)
                    if (rule.language && mediaData.originalLanguage) {
                        const allowedLanguages = rule.language.split('|').map(l => l.trim().toLowerCase());
                        if (!allowedLanguages.includes(mediaData.originalLanguage.toLowerCase())) {
                            continue;
                        }
                    }

                    // Check genre condition (pipe-separated genre IDs or names)
                    if (rule.genre && mediaData.genreIds) {
                        const ruleGenres = rule.genre.split('|').map(g => g.trim().toLowerCase());
                        const mediaGenreNames = (mediaData.genres || []).map(g => g.name.toLowerCase());
                        const mediaGenreIds = (mediaData.genreIds || []).map(id => id.toString());

                        const hasMatchingGenre = ruleGenres.some(ruleGenre =>
                            mediaGenreNames.includes(ruleGenre) || mediaGenreIds.includes(ruleGenre)
                        );

                        if (!hasMatchingGenre) {
                            continue;
                        }
                    }

                    // Check keywords condition
                    if (rule.keywords && mediaData.keywords) {
                        const ruleKeywords = rule.keywords.split('|').map(k => k.trim().toLowerCase());
                        const mediaKeywordNames = (mediaData.keywords || []).map(k => k.name?.toLowerCase() || '');

                        const hasMatchingKeyword = ruleKeywords.some(ruleKeyword =>
                            mediaKeywordNames.includes(ruleKeyword)
                        );

                        if (!hasMatchingKeyword) {
                            continue;
                        }
                    }

                    // Check user condition
                    if (rule.users) {
                        const currentUserId = await api.getCurrentJellyseerrUserId();
                        if (currentUserId) {
                            const allowedUsers = rule.users.split(',').map(u => u.trim());
                            if (!allowedUsers.includes(currentUserId)) {
                                continue;
                            }
                        } else {
                            // If we can't determine the user ID, skip this rule
                            continue;
                        }
                    }

                    console.debug(`${logPrefix} Matched override rule ${rule.id}:`, {
                        language: rule.language,
                        genre: rule.genre,
                        profileId: rule.profileId,
                        rootFolder: rule.rootFolder
                    });

                    // Return the settings to apply
                    const settings = {};
                    if (rule.profileId !== null && rule.profileId !== undefined) {
                        settings.profileId = rule.profileId;
                    }
                    if (rule.rootFolder) {
                        settings.rootFolder = rule.rootFolder;
                    }
                    if (rule.tags) {
                        // Convert tags to array format that Seerr expects
                        if (Array.isArray(rule.tags)) {
                            settings.tags = rule.tags;
                        } else if (typeof rule.tags === 'string') {
                            // Handle pipe-separated string or single value
                            settings.tags = rule.tags.split('|').map(t => parseInt(t.trim())).filter(t => !isNaN(t));
                        } else if (typeof rule.tags === 'number') {
                            settings.tags = [rule.tags];
                        }
                    }
                    if (rule[serviceIdKey] !== null && rule[serviceIdKey] !== undefined) {
                        settings.serverId = rule[serviceIdKey];
                    }

                    return settings;
                }

                console.debug(`${logPrefix} No matching override rules found`);
                return null;
            } catch (error) {
                console.error(`${logPrefix} Error evaluating override rules:`, error);
                return null;
            }
        };

        JE.session?.onUserChange('jellyseerr-api-overrides', () => {
            cachedOverrideRules = null;
            overrideRulesCachedAt = 0;
        });
    };
})(window.JellyfinEnhanced);
