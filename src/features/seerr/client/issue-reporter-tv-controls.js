// issue-reporter-tv-controls.js
// Internal issue-reporting component; loaded before issue-reporter.js.
(function (JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Issue Reporter:';

    async function initialize(modalElement, item) {
        try {
            const placeholder = modalElement.querySelector('#jellyseerr-tv-controls-placeholder');
            if (!placeholder) return;

            // Build the container for season/episode controls
            const controlsHtml = `
                <div class="jellyseerr-form-group">
                    <label for="issue-season">${JE.t('jellyseerr_report_issue_season')}</label>
                    <select id="issue-season" class="jellyseerr-select"></select>
                </div>
                <div class="jellyseerr-form-group">
                    <label for="issue-episode">${JE.t('jellyseerr_report_issue_episode')}</label>
                    <select id="issue-episode" class="jellyseerr-select"></select>
                </div>
            `;

            placeholder.innerHTML = controlsHtml;

            const seasonSelect = modalElement.querySelector('#issue-season');
            const episodeSelect = modalElement.querySelector('#issue-episode');

            // Helper to clear and set options
            const setOptions = (selectEl, options) => {
                selectEl.innerHTML = '';
                for (const opt of options) {
                    const o = document.createElement('option');
                    o.value = String(opt.value);
                    o.textContent = opt.label;
                    selectEl.appendChild(o);
                }
            };

            // Default state: disable controls until we populate
            seasonSelect.disabled = true;
            episodeSelect.disabled = true;

            const normalized = await JE.jellyseerrIssueReporterData.getAvailableSeasons(item);

            // If still no seasons discovered, show a single 'All seasons' option and disable episode selector
            if (!normalized || normalized.length === 0) {
                setOptions(seasonSelect, [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All seasons' }]);
                seasonSelect.disabled = true;
                setOptions(episodeSelect, [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All episodes' }]);
                episodeSelect.disabled = true;
                return;
            }

            // Build season options
            const seasonOptions = [];
            // If more than one season, add 'All seasons'
            if (normalized.length > 1) {
                seasonOptions.push({ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All seasons' });
            }
            for (const s of normalized) {
                seasonOptions.push({ value: s.seasonNumber, label: `${JE.t('jellyseerr_report_issue_season') || 'Season'} ${s.seasonNumber}` });
            }

            setOptions(seasonSelect, seasonOptions);
            seasonSelect.disabled = false;

            // Helper to populate episodes for a season
            const populateEpisodesForSeason = (seasonNum) => {
                const s = normalized.find(x => x.seasonNumber === parseInt(seasonNum));
                if (!s) {
                    setOptions(episodeSelect, [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All episodes' }]);
                    episodeSelect.disabled = true;
                    return;
                }
                const eps = s.episodes && s.episodes.length > 0 ? s.episodes : [];
                const epOptions = [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All episodes' }];
                if (eps.length > 0) {
                    for (const ep of eps) epOptions.push({ value: ep.episodeNumber, label: `${JE.t('jellyseerr_report_issue_episode') || 'Episode'} ${ep.episodeNumber}${ep.title ? ' — ' + ep.title : ''}` });
                }
                setOptions(episodeSelect, epOptions);
                episodeSelect.disabled = false;
            };

            // If we are on a Season or Episode detail, try to preselect
            const curType = item?.Type;
            let curSeasonNum = null;
            let curEpisodeNum = null;
            if (curType === 'Season') {
                curSeasonNum = item?.IndexNumber || item?.SeasonNumber || null;
            } else if (curType === 'Episode') {
                // Many Episode items have ParentIndexNumber for season and IndexNumber for episode
                curSeasonNum = item?.ParentIndexNumber || item?.SeasonIndex || item?.ParentIndex || item?.SeasonNumber || null;
                curEpisodeNum = item?.IndexNumber || item?.EpisodeNumber || null;
            }

            // Preselect logic
            if (curSeasonNum) {
                // If season options include the season, set select
                const valToSet = String(curSeasonNum);
                const opt = Array.from(seasonSelect.options).find(o => o.value === valToSet);
                if (opt) seasonSelect.value = valToSet;
                // If this is a Season detail, and only one season or user likely doesn't need to change, disable changing seasons
                if (curType === 'Season') {
                    seasonSelect.disabled = true;
                }
                // populate episodes for that season
                populateEpisodesForSeason(curSeasonNum);
                if (curEpisodeNum) {
                    // try to set episode value and disable modification for episode detail
                    const epOpt = Array.from(episodeSelect.options).find(o => o.value === String(curEpisodeNum));
                    if (epOpt) episodeSelect.value = String(curEpisodeNum);
                    if (curType === 'Episode') {
                        episodeSelect.disabled = true;
                        seasonSelect.disabled = true;
                    }
                }
            } else {
                // Default: set to 'All seasons' if present, and disable episode select
                if (normalized.length > 1) {
                    seasonSelect.value = '0';
                    // Ensure the episode select shows the 'All episodes' option when defaulting
                    setOptions(episodeSelect, [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All episodes' }]);
                    episodeSelect.disabled = true;
                } else {
                    // Single season - select it
                    seasonSelect.value = String(normalized[0].seasonNumber);
                    populateEpisodesForSeason(normalized[0].seasonNumber);
                }
            }

            // When season changes, update episodes
            seasonSelect.addEventListener('change', () => {
                const val = seasonSelect.value;
                if (!val || val === '0') {
                    // All seasons => show a single "All episodes" option to avoid blank UI and disable selection
                    setOptions(episodeSelect, [{ value: 0, label: JE.t('jellyseerr_select_all_seasons') || 'All episodes' }]);
                    episodeSelect.disabled = true;
                } else {
                    populateEpisodesForSeason(parseInt(val));
                }
            });

        } catch (err) {
            console.debug(`${logPrefix} Error building tv controls:`, err);
        }
    }

    JE.jellyseerrIssueReporterTvControls = { initialize };

})(window.JellyfinEnhanced);
