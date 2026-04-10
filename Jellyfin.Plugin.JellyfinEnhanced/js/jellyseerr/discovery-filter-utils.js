// /js/jellyseerr/discovery-filter-utils.js
// Shared utilities for discovery section content type filtering
(function(JE) {
    'use strict';

    const FILTER_MODES = {
        MIXED: 'mixed',
        MOVIES: 'movies',
        TV: 'tv'
    };
    const runtimeFilterModes = new Map();
    const runtimeSortModes = new Map();

    const SORT_OPTIONS = [
        { value: '', label: 'Popular' },
        { value: 'popularity.asc', label: 'Least Popular' },
        { value: 'vote_average.desc', label: 'Top Rated' },
        { value: 'vote_average.asc', label: 'Lowest Rated' },
        { value: 'release_date.desc', label: 'Newest' },
        { value: 'release_date.asc', label: 'Oldest' },
        { value: 'revenue.desc', label: 'Highest Revenue' },
        { value: 'vote_count.desc', label: 'Most Voted' },
        { value: 'original_title.asc', label: 'Title (A-Z)' },
        { value: 'original_title.desc', label: 'Title (Z-A)' }
    ];

    /**
     * Gets the current filter mode for a module from runtime state.
     * @param {string} moduleName - e.g., 'genre', 'tag', 'person', 'network'
     * @returns {string} - 'mixed', 'movies', or 'tv'
     */
    function getFilterMode(moduleName) {
        const stored = runtimeFilterModes.get(moduleName);
        if (stored && Object.values(FILTER_MODES).includes(stored)) {
            return stored;
        }
        return FILTER_MODES.MIXED;
    }

    /**
     * Sets the filter mode for a module in runtime state.
     * @param {string} moduleName
     * @param {string} mode - 'mixed', 'movies', or 'tv'
     */
    function setFilterMode(moduleName, mode) {
        if (Object.values(FILTER_MODES).includes(mode)) {
            runtimeFilterModes.set(moduleName, mode);
        }
    }

    /**
     * Resets module filter mode back to default.
     * @param {string} moduleName
     */
    function resetFilterMode(moduleName) {
        runtimeFilterModes.delete(moduleName);
    }

    /**
     * Gets the current sort mode for a module.
     * @param {string} moduleName - e.g., 'genre', 'tag', 'person', 'network'
     * @returns {string} Sort value (empty string = default/popular)
     */
    function getSortMode(moduleName) {
        return runtimeSortModes.get(moduleName) || '';
    }

    /**
     * Gets the sort value adapted for TV endpoints.
     * TMDB uses first_air_date for TV instead of release_date for movies.
     * @param {string} moduleName
     * @returns {string} TV-compatible sort value
     */
    function getTvSortMode(moduleName) {
        const sort = runtimeSortModes.get(moduleName) || '';
        return sort.replace('release_date', 'first_air_date');
    }

    /**
     * Sets the sort mode for a module.
     * @param {string} moduleName
     * @param {string} sort - Sort value from SORT_OPTIONS
     */
    function setSortMode(moduleName, sort) {
        runtimeSortModes.set(moduleName, sort);
    }

    /**
     * Resets module sort mode back to default (popular).
     * @param {string} moduleName
     */
    function resetSortMode(moduleName) {
        runtimeSortModes.delete(moduleName);
    }

    // ========================================
    // ADVANCED FILTER STATE MANAGEMENT
    // ========================================

    const runtimeAdvancedFilters = new Map();

    /** Common languages list (ISO 639-1 codes) */
    const LANGUAGES = [
        { code: '', label: 'Any Language' },
        { code: 'en', label: 'English' },
        { code: 'es', label: 'Spanish' },
        { code: 'fr', label: 'French' },
        { code: 'de', label: 'German' },
        { code: 'it', label: 'Italian' },
        { code: 'pt', label: 'Portuguese' },
        { code: 'ja', label: 'Japanese' },
        { code: 'ko', label: 'Korean' },
        { code: 'zh', label: 'Chinese' },
        { code: 'hi', label: 'Hindi' },
        { code: 'ar', label: 'Arabic' },
        { code: 'ru', label: 'Russian' },
        { code: 'nl', label: 'Dutch' },
        { code: 'sv', label: 'Swedish' },
        { code: 'no', label: 'Norwegian' },
        { code: 'da', label: 'Danish' },
        { code: 'fi', label: 'Finnish' },
        { code: 'pl', label: 'Polish' },
        { code: 'tr', label: 'Turkish' },
        { code: 'th', label: 'Thai' },
        { code: 'vi', label: 'Vietnamese' },
        { code: 'id', label: 'Indonesian' },
        { code: 'ms', label: 'Malay' },
        { code: 'tl', label: 'Tagalog' },
        { code: 'uk', label: 'Ukrainian' },
        { code: 'cs', label: 'Czech' },
        { code: 'el', label: 'Greek' },
        { code: 'he', label: 'Hebrew' },
        { code: 'hu', label: 'Hungarian' },
        { code: 'ro', label: 'Romanian' },
        { code: 'ta', label: 'Tamil' },
        { code: 'te', label: 'Telugu' },
        { code: 'bn', label: 'Bengali' },
        { code: 'ml', label: 'Malayalam' },
        { code: 'cn', label: 'Cantonese' }
    ];

    /** Movie certifications (US) */
    var MOVIE_CERTIFICATIONS = [
        { value: '', label: 'Any Rating' },
        { value: 'G', label: 'G' },
        { value: 'PG', label: 'PG' },
        { value: 'PG-13', label: 'PG-13' },
        { value: 'R', label: 'R' },
        { value: 'NC-17', label: 'NC-17' },
        { value: 'NR', label: 'NR' }
    ];

    /** TV certifications (US) */
    var TV_CERTIFICATIONS = [
        { value: '', label: 'Any Rating' },
        { value: 'TV-Y', label: 'TV-Y' },
        { value: 'TV-Y7', label: 'TV-Y7' },
        { value: 'TV-G', label: 'TV-G' },
        { value: 'TV-PG', label: 'TV-PG' },
        { value: 'TV-14', label: 'TV-14' },
        { value: 'TV-MA', label: 'TV-MA' }
    ];

    /** TV show status options */
    var TV_STATUS_OPTIONS = [
        { value: '', label: 'Any Status' },
        { value: '0', label: 'Returning Series' },
        { value: '3', label: 'Ended' },
        { value: '4', label: 'Cancelled' },
        { value: '2', label: 'In Production' },
        { value: '1', label: 'Planned' },
        { value: '5', label: 'Pilot' }
    ];

    /**
     * Gets the current advanced filters for a module.
     * @param {string} moduleName
     * @returns {object} Filter state object
     */
    function getAdvancedFilters(moduleName) {
        return runtimeAdvancedFilters.get(moduleName) || {};
    }

    /**
     * Sets a single advanced filter value for a module.
     * @param {string} moduleName
     * @param {string} key
     * @param {string} value
     */
    function setAdvancedFilter(moduleName, key, value) {
        var filters = runtimeAdvancedFilters.get(moduleName) || {};
        if (value === '' || value === undefined || value === null) {
            delete filters[key];
        } else {
            filters[key] = value;
        }
        runtimeAdvancedFilters.set(moduleName, filters);
    }

    /**
     * Resets all advanced filters for a module.
     * @param {string} moduleName
     */
    function resetAdvancedFilters(moduleName) {
        runtimeAdvancedFilters.delete(moduleName);
    }

    /**
     * Checks if any advanced filters are active for a module.
     * @param {string} moduleName
     * @returns {boolean}
     */
    function hasActiveAdvancedFilters(moduleName) {
        var filters = runtimeAdvancedFilters.get(moduleName) || {};
        return Object.keys(filters).length > 0;
    }

    /**
     * Builds a URL query string from the current advanced filter state.
     * Maps UI filter keys to the Seerr API parameter names.
     * @param {string} moduleName
     * @param {string} mediaType - 'tv' or 'movie'
     * @returns {string} Query string fragment (e.g., "&voteAverageGte=7&primaryReleaseDateGte=2020-01-01")
     */
    function buildFilterQueryString(moduleName, mediaType) {
        var filters = runtimeAdvancedFilters.get(moduleName) || {};
        var params = [];
        var isTv = mediaType === 'tv';

        if (filters.yearFrom) {
            var dateKey = isTv ? 'firstAirDateGte' : 'primaryReleaseDateGte';
            params.push(dateKey + '=' + encodeURIComponent(filters.yearFrom + '-01-01'));
        }
        if (filters.yearTo) {
            var dateKey = isTv ? 'firstAirDateLte' : 'primaryReleaseDateLte';
            params.push(dateKey + '=' + encodeURIComponent(filters.yearTo + '-12-31'));
        }
        if (filters.ratingMin) {
            params.push('voteAverageGte=' + encodeURIComponent(filters.ratingMin));
        }
        if (filters.ratingMax && filters.ratingMax !== '10') {
            params.push('voteAverageLte=' + encodeURIComponent(filters.ratingMax));
        }
        if (filters.runtimeMin) {
            params.push('withRuntimeGte=' + encodeURIComponent(filters.runtimeMin));
        }
        if (filters.runtimeMax) {
            params.push('withRuntimeLte=' + encodeURIComponent(filters.runtimeMax));
        }
        if (filters.language) {
            params.push('originalLanguage=' + encodeURIComponent(filters.language));
        }
        if (filters.certification) {
            params.push('certification=' + encodeURIComponent(filters.certification));
            params.push('certificationCountry=' + encodeURIComponent(filters.certificationCountry || 'US'));
        }
        if (filters.tvStatus && isTv) {
            params.push('withStatus=' + encodeURIComponent(filters.tvStatus));
        }
        if (filters.voteCountMin) {
            params.push('voteCountGte=' + encodeURIComponent(filters.voteCountMin));
        }

        return params.length > 0 ? '&' + params.join('&') : '';
    }

    // ========================================
    // ADVANCED FILTER PANEL UI
    // ========================================

    /**
     * Shared inline styles for filter panel controls
     */
    var FILTER_INPUT_STYLE = 'background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.85);' +
        'border:1px solid rgba(255,255,255,0.2);border-radius:4px;padding:3px 6px;' +
        'font-size:inherit;font-family:inherit;cursor:pointer;outline:none;';

    var FILTER_LABEL_STYLE = 'color:rgba(255,255,255,0.5);font-size:0.8em;white-space:nowrap;';

    /**
     * Creates a select dropdown for the filter panel.
     * @param {Array<{value:string, label:string}>} options
     * @param {string} currentValue
     * @param {Function} onChange - callback(newValue)
     * @returns {HTMLSelectElement}
     */
    function createFilterSelect(options, currentValue, onChange) {
        var select = document.createElement('select');
        select.style.cssText = FILTER_INPUT_STYLE + 'max-width:140px;';
        options.forEach(function(opt) {
            var option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (currentValue === opt.value) option.selected = true;
            select.appendChild(option);
        });
        select.addEventListener('change', function() {
            onChange(select.value);
        });
        return select;
    }

    /**
     * Creates a number input for the filter panel.
     * @param {string} placeholder
     * @param {string} currentValue
     * @param {Function} onChange - callback(newValue)
     * @param {object} [opts]
     * @returns {HTMLInputElement}
     */
    function createFilterNumberInput(placeholder, currentValue, onChange, opts) {
        opts = opts || {};
        var input = document.createElement('input');
        input.type = 'number';
        input.placeholder = placeholder;
        input.style.cssText = FILTER_INPUT_STYLE + 'width:70px;';
        if (currentValue) input.value = currentValue;
        if (opts.min !== undefined) input.min = opts.min;
        if (opts.max !== undefined) input.max = opts.max;
        var debounce = null;
        input.addEventListener('input', function() {
            clearTimeout(debounce);
            debounce = setTimeout(function() {
                onChange(input.value);
            }, 500);
        });
        return input;
    }

    /**
     * Creates a filter group (label + control(s)).
     * @param {string} labelText
     * @param {...HTMLElement} controls
     * @returns {HTMLElement}
     */
    function createFilterGroup(labelText, controls) {
        var group = document.createElement('div');
        group.className = 'jellyseerr-filter-group';
        group.style.cssText = 'display:inline-flex;align-items:center;gap:0.3em;';
        var label = document.createElement('span');
        label.textContent = labelText;
        label.style.cssText = FILTER_LABEL_STYLE;
        group.appendChild(label);
        for (var i = 1; i < arguments.length; i++) {
            group.appendChild(arguments[i]);
        }
        return group;
    }

    /**
     * Generates year options from 1900 to current year + 1.
     * @returns {Array<{value:string, label:string}>}
     */
    function getYearOptions() {
        var currentYear = new Date().getFullYear();
        var options = [{ value: '', label: 'Any' }];
        for (var y = currentYear + 1; y >= 1900; y--) {
            options.push({ value: String(y), label: String(y) });
        }
        return options;
    }

    /**
     * Generates rating options from 0 to 10 in whole numbers.
     * @param {boolean} isMax - If true, default selected is 10
     * @returns {Array<{value:string, label:string}>}
     */
    function getRatingOptions(isMax) {
        var options = [{ value: '', label: isMax ? '10' : '0' }];
        for (var r = isMax ? 10 : 1; isMax ? r >= 0 : r <= 10; isMax ? r-- : r++) {
            options.push({ value: String(r), label: String(r) });
        }
        return options;
    }

    /**
     * Creates the advanced filter panel.
     * @param {string} moduleName
     * @param {Function} onFilterApply - Called when any filter changes: () => void
     * @returns {HTMLElement} The filter panel container
     */
    function createAdvancedFilterPanel(moduleName, onFilterApply) {
        var filters = getAdvancedFilters(moduleName);
        var filterMode = getFilterMode(moduleName);

        var panel = document.createElement('div');
        panel.className = 'jellyseerr-advanced-filters';
        panel.style.cssText = 'display:none;width:100%;background:rgba(255,255,255,0.03);' +
            'border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:0.8em 1em;' +
            'margin-top:0.5em;font-size:0.85em;';

        // Row 1: Year, Rating, Runtime
        var row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;flex-wrap:wrap;gap:1em 1.5em;align-items:center;margin-bottom:0.6em;';

        var yearFromSelect = createFilterSelect(getYearOptions(), filters.yearFrom || '', function(v) {
            setAdvancedFilter(moduleName, 'yearFrom', v);
            onFilterApply();
        });
        var yearDash = document.createElement('span');
        yearDash.textContent = '-';
        yearDash.style.cssText = 'color:rgba(255,255,255,0.4);';
        var yearToSelect = createFilterSelect(getYearOptions(), filters.yearTo || '', function(v) {
            setAdvancedFilter(moduleName, 'yearTo', v);
            onFilterApply();
        });
        row1.appendChild(createFilterGroup('Year:', yearFromSelect, yearDash, yearToSelect));

        var ratingMinSelect = createFilterSelect(getRatingOptions(false), filters.ratingMin || '', function(v) {
            setAdvancedFilter(moduleName, 'ratingMin', v);
            onFilterApply();
        });
        var ratingDash = document.createElement('span');
        ratingDash.textContent = '-';
        ratingDash.style.cssText = 'color:rgba(255,255,255,0.4);';
        var ratingMaxSelect = createFilterSelect(getRatingOptions(true), filters.ratingMax || '', function(v) {
            setAdvancedFilter(moduleName, 'ratingMax', v);
            onFilterApply();
        });
        row1.appendChild(createFilterGroup('Rating:', ratingMinSelect, ratingDash, ratingMaxSelect));

        var runtimeMinInput = createFilterNumberInput('Min', filters.runtimeMin || '', function(v) {
            setAdvancedFilter(moduleName, 'runtimeMin', v);
            onFilterApply();
        }, { min: 0, max: 400 });
        var runtimeDash = document.createElement('span');
        runtimeDash.textContent = '-';
        runtimeDash.style.cssText = 'color:rgba(255,255,255,0.4);';
        var runtimeMaxInput = createFilterNumberInput('Max', filters.runtimeMax || '', function(v) {
            setAdvancedFilter(moduleName, 'runtimeMax', v);
            onFilterApply();
        }, { min: 0, max: 400 });
        var runtimeUnit = document.createElement('span');
        runtimeUnit.textContent = 'min';
        runtimeUnit.style.cssText = FILTER_LABEL_STYLE;
        row1.appendChild(createFilterGroup('Runtime:', runtimeMinInput, runtimeDash, runtimeMaxInput, runtimeUnit));

        panel.appendChild(row1);

        // Row 2: Language, Certification, TV Status, Vote Count, Reset
        var row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;flex-wrap:wrap;gap:1em 1.5em;align-items:center;';

        var langSelect = createFilterSelect(LANGUAGES, filters.language || '', function(v) {
            setAdvancedFilter(moduleName, 'language', v);
            onFilterApply();
        });
        row2.appendChild(createFilterGroup('Language:', langSelect));

        // Certification: show movie or TV certs depending on filter mode
        var certOptions = (filterMode === FILTER_MODES.TV)
            ? TV_CERTIFICATIONS
            : MOVIE_CERTIFICATIONS;
        var certSelect = createFilterSelect(certOptions, filters.certification || '', function(v) {
            setAdvancedFilter(moduleName, 'certification', v);
            if (v) {
                setAdvancedFilter(moduleName, 'certificationCountry', 'US');
            } else {
                setAdvancedFilter(moduleName, 'certificationCountry', '');
            }
            onFilterApply();
        });
        row2.appendChild(createFilterGroup('Rating:', certSelect));

        // TV Status (only visible when filtering TV or mixed)
        var tvStatusGroup = createFilterGroup('Status:',
            createFilterSelect(TV_STATUS_OPTIONS, filters.tvStatus || '', function(v) {
                setAdvancedFilter(moduleName, 'tvStatus', v);
                onFilterApply();
            })
        );
        if (filterMode === FILTER_MODES.MOVIES) {
            tvStatusGroup.style.display = 'none';
        }
        tvStatusGroup.setAttribute('data-filter-tvstatus', 'true');
        row2.appendChild(tvStatusGroup);

        // Vote count minimum
        var voteCountInput = createFilterNumberInput('Min votes', filters.voteCountMin || '', function(v) {
            setAdvancedFilter(moduleName, 'voteCountMin', v);
            onFilterApply();
        }, { min: 0 });
        voteCountInput.style.cssText = FILTER_INPUT_STYLE + 'width:90px;';
        row2.appendChild(createFilterGroup('Votes:', voteCountInput));

        // Reset button
        var resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.textContent = 'Reset Filters';
        resetBtn.style.cssText = 'margin-left:auto;padding:4px 12px;border:1px solid rgba(255,255,255,0.2);' +
            'border-radius:4px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.7);' +
            'cursor:pointer;font-size:inherit;font-family:inherit;transition:background 0.15s;';
        resetBtn.addEventListener('mouseenter', function() {
            resetBtn.style.background = 'rgba(255,255,255,0.1)';
        });
        resetBtn.addEventListener('mouseleave', function() {
            resetBtn.style.background = 'rgba(255,255,255,0.05)';
        });
        resetBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            resetAdvancedFilters(moduleName);
            // Re-create panel contents by finding and replacing
            var parent = panel.parentElement;
            if (parent) {
                var newPanel = createAdvancedFilterPanel(moduleName, onFilterApply);
                // Preserve visibility
                if (panel.style.display !== 'none') {
                    newPanel.style.display = 'flex';
                    newPanel.style.flexDirection = 'column';
                }
                parent.replaceChild(newPanel, panel);
            }
            onFilterApply();
        });
        row2.appendChild(resetBtn);

        panel.appendChild(row2);

        return panel;
    }

    /**
     * Creates the filter toggle button for the section header.
     * @param {HTMLElement} filterPanel - The panel to toggle
     * @param {string} moduleName
     * @returns {HTMLElement}
     */
    function createFilterToggleButton(filterPanel, moduleName) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'jellyseerr-filter-toggle';
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:0.3em;' +
            'padding:4px 10px;border:1px solid rgba(255,255,255,0.3);border-radius:4px;' +
            'background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.8);cursor:pointer;' +
            'font-size:0.85em;font-family:inherit;transition:background 0.15s;';

        var icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'tune';
        icon.style.cssText = 'font-size:1.1em;';
        btn.appendChild(icon);

        var label = document.createElement('span');
        label.textContent = 'Filters';
        btn.appendChild(label);

        // Active indicator
        var indicator = document.createElement('span');
        indicator.className = 'jellyseerr-filter-indicator';
        indicator.style.cssText = 'width:6px;height:6px;border-radius:50%;background:#4fc3f7;display:none;';
        btn.appendChild(indicator);

        function updateIndicator() {
            indicator.style.display = hasActiveAdvancedFilters(moduleName) ? 'inline-block' : 'none';
        }
        updateIndicator();

        // Store updater on panel for external access
        filterPanel._updateIndicator = updateIndicator;

        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var isVisible = filterPanel.style.display !== 'none';
            if (isVisible) {
                filterPanel.style.display = 'none';
                btn.style.background = 'rgba(255,255,255,0.05)';
            } else {
                filterPanel.style.display = 'flex';
                filterPanel.style.flexDirection = 'column';
                btn.style.background = 'rgba(255,255,255,0.15)';
            }
        });
        btn.addEventListener('mouseenter', function() {
            if (filterPanel.style.display === 'none') {
                btn.style.background = 'rgba(255,255,255,0.1)';
            }
        });
        btn.addEventListener('mouseleave', function() {
            if (filterPanel.style.display === 'none') {
                btn.style.background = 'rgba(255,255,255,0.05)';
            }
        });

        return btn;
    }

    /**
     * Interleaves two arrays in 1:1 alternating fashion
     * Preserves internal order of each array
     * @param {Array} arr1 - First array (e.g., TV results)
     * @param {Array} arr2 - Second array (e.g., Movie results)
     * @returns {Array} - Interleaved array
     */
    function interleaveArrays(arr1, arr2) {
        const result = [];
        const len1 = arr1.length;
        const len2 = arr2.length;
        const maxLen = Math.max(len1, len2);

        let i1 = 0;
        let i2 = 0;

        for (let i = 0; i < maxLen * 2 && (i1 < len1 || i2 < len2); i++) {
            if (i % 2 === 0 && i1 < len1) {
                result.push(arr1[i1++]);
            } else if (i % 2 === 1 && i2 < len2) {
                result.push(arr2[i2++]);
            } else if (i1 < len1) {
                result.push(arr1[i1++]);
            } else if (i2 < len2) {
                result.push(arr2[i2++]);
            }
        }

        return result;
    }

    /**
     * Filters results by media type
     * @param {Array} results - Array of items with mediaType property
     * @param {string} mode - 'mixed', 'movies', or 'tv'
     * @returns {Array} - Filtered array
     */
    function filterByMediaType(results, mode) {
        if (mode === FILTER_MODES.MIXED) {
            return results;
        }
        if (mode === FILTER_MODES.MOVIES) {
            return results.filter(item => item.mediaType === 'movie');
        }
        if (mode === FILTER_MODES.TV) {
            return results.filter(item => item.mediaType === 'tv');
        }
        return results;
    }

    /**
     * Determines if both movies and TV exist in results
     * @param {Array} tvResults - TV results array
     * @param {Array} movieResults - Movie results array
     * @returns {boolean}
     */
    function hasBothTypes(tvResults, movieResults) {
        return (tvResults && tvResults.length > 0) && (movieResults && movieResults.length > 0);
    }

    /**
     * Determines if results contain both media types (for combined endpoint results)
     * @param {Array} results - Combined results array
     * @returns {boolean}
     */
    function resultHasBothTypes(results) {
        if (!results || results.length === 0) return false;
        let hasMovie = false;
        let hasTv = false;
        for (let i = 0; i < results.length && !(hasMovie && hasTv); i++) {
            if (results[i].mediaType === 'movie') hasMovie = true;
            if (results[i].mediaType === 'tv') hasTv = true;
        }
        return hasMovie && hasTv;
    }

    /**
     * Creates the filter control UI element
     * @param {string} moduleName - Module name for persistence
     * @param {Function} onFilterChange - Callback when filter changes: (newMode) => void
     * @returns {HTMLElement} - The filter control container
     */
    function createFilterControl(moduleName, onFilterChange) {
        const currentMode = getFilterMode(moduleName);

        const container = document.createElement('div');
        container.className = 'jellyseerr-discovery-filter';
        container.style.cssText = 'display:inline-flex;gap:0;font-size:0.85em;vertical-align:middle;';

        const allLabel = (typeof JE?.t === 'function') ? JE.t('jellyseerr_discover_all') || 'All' : 'All';
        const moviesLabel = (typeof JE?.t === 'function') ? JE.t('jellyseerr_card_badge_movie') || 'Movies' : 'Movies';
        const seriesLabel = (typeof JE?.t === 'function') ? JE.t('jellyseerr_card_badge_series') || 'Series' : 'Series';

        const buttons = [
            { mode: FILTER_MODES.MIXED, label: allLabel },
            { mode: FILTER_MODES.MOVIES, label: moviesLabel },
            { mode: FILTER_MODES.TV, label: seriesLabel }
        ];

        buttons.forEach((btn, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jellyseerr-filter-btn';
            button.setAttribute('data-mode', btn.mode);
            button.textContent = btn.label;

            // Segmented button styling
            let borderRadius = '0';
            if (index === 0) borderRadius = '4px 0 0 4px';
            if (index === buttons.length - 1) borderRadius = '0 4px 4px 0';

            const isActive = currentMode === btn.mode;
            button.style.cssText = `
                padding: 4px 10px;
                border: 1px solid rgba(255,255,255,0.3);
                border-radius: ${borderRadius};
                background: ${isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'};
                color: rgba(255,255,255,0.8);
                cursor: pointer;
                font-size: inherit;
                font-family: inherit;
                margin-left: ${index > 0 ? '-1px' : '0'};
                transition: background 0.15s, border-color 0.15s;
                font-weight: ${isActive ? '600' : '400'};
            `;

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const newMode = btn.mode;
                if (newMode === getFilterMode(moduleName)) return;

                setFilterMode(moduleName, newMode);

                // Update button states
                container.querySelectorAll('.jellyseerr-filter-btn').forEach(b => {
                    const isNowActive = b.getAttribute('data-mode') === newMode;
                    b.style.background = isNowActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
                    b.style.fontWeight = isNowActive ? '600' : '400';
                });

                if (onFilterChange) {
                    onFilterChange(newMode);
                }
            });

            // Hover effects
            button.addEventListener('mouseenter', () => {
                if (getFilterMode(moduleName) !== btn.mode) {
                    button.style.background = 'rgba(255,255,255,0.1)';
                }
            });
            button.addEventListener('mouseleave', () => {
                const isActive = getFilterMode(moduleName) === btn.mode;
                button.style.background = isActive ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)';
            });

            container.appendChild(button);
        });

        return container;
    }

    /**
     * Creates the sort control dropdown
     * @param {string} moduleName
     * @param {Function} onSortChange - Callback: (newSort) => void
     * @returns {HTMLElement}
     */
    function createSortControl(moduleName, onSortChange) {
        const currentSort = getSortMode(moduleName);

        const container = document.createElement('div');
        container.className = 'jellyseerr-discovery-sort';
        container.style.cssText = 'display:inline-flex;align-items:center;gap:0.4em;font-size:0.85em;margin-left:auto;';

        const label = document.createElement('span');
        label.textContent = 'Sort:';
        label.style.cssText = 'color:rgba(255,255,255,0.5);';
        container.appendChild(label);

        const select = document.createElement('select');
        select.className = 'jellyseerr-sort-select';
        select.style.cssText = `
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.85);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            padding: 3px 8px;
            font-size: inherit;
            font-family: inherit;
            cursor: pointer;
            outline: none;
        `;

        SORT_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (currentSort === opt.value) option.selected = true;
            select.appendChild(option);
        });

        select.addEventListener('change', () => {
            const newSort = select.value;
            setSortMode(moduleName, newSort);
            if (onSortChange) onSortChange(newSort);
        });

        container.appendChild(select);
        return container;
    }

    /**
     * Replaces all options in a select element using DOM methods.
     * @param {HTMLSelectElement} selectEl
     * @param {Array<{value:string, label:string}>} options
     * @param {string} [currentValue] - Value to preserve selection for
     */
    function replaceSelectOptions(selectEl, options, currentValue) {
        while (selectEl.firstChild) selectEl.removeChild(selectEl.firstChild);
        options.forEach(function(opt) {
            var option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            option.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (currentValue === opt.value) option.selected = true;
            selectEl.appendChild(option);
        });
    }

    /**
     * Creates a section header with title, optional filter control, sort dropdown, and advanced filters.
     * @param {string} title - Section title text
     * @param {string} moduleName - Module name for filter persistence
     * @param {boolean} showFilter - Whether to show the media type filter control
     * @param {Function} onFilterChange - Callback when media type filter changes
     * @param {Function} [onSortChange] - Callback when sort changes
     * @param {Function} [onAdvancedFilterChange] - Callback when advanced filters change (enables filter panel)
     * @returns {HTMLElement} - The header wrapper (contains header row + optional filter panel)
     */
    function createSectionHeader(title, moduleName, showFilter, onFilterChange, onSortChange, onAdvancedFilterChange) {
        var wrapper = document.createElement('div');
        wrapper.className = 'jellyseerr-discovery-header-wrapper';
        wrapper.style.cssText = 'width:100%;margin-bottom:1em;';

        var header = document.createElement('div');
        header.className = 'jellyseerr-discovery-header';
        header.style.cssText = 'display:flex;align-items:baseline;gap:1em;flex-wrap:wrap;width:100%;';

        var titleElement = document.createElement('h2');
        titleElement.className = 'sectionTitle sectionTitle-cards';
        titleElement.textContent = title;
        titleElement.style.margin = '0';
        header.appendChild(titleElement);

        if (showFilter) {
            var filterControl = createFilterControl(moduleName, function(newMode) {
                // Update TV status visibility in the advanced filter panel
                var tvStatusGroup = wrapper.querySelector('[data-filter-tvstatus]');
                if (tvStatusGroup) {
                    tvStatusGroup.style.display = (newMode === FILTER_MODES.MOVIES) ? 'none' : '';
                }
                // Update certification options based on media type
                var certGroup = wrapper.querySelector('[data-filter-certification]');
                if (certGroup) {
                    var certSelect = certGroup.querySelector('select');
                    if (certSelect) {
                        var certOptions = (newMode === FILTER_MODES.TV) ? TV_CERTIFICATIONS : MOVIE_CERTIFICATIONS;
                        replaceSelectOptions(certSelect, certOptions, certSelect.value);
                    }
                }
                if (onFilterChange) onFilterChange(newMode);
            });
            header.appendChild(filterControl);
        }

        // Advanced filter toggle button and panel
        if (onAdvancedFilterChange) {
            var filterPanel = createAdvancedFilterPanel(moduleName, function() {
                if (filterPanel._updateIndicator) filterPanel._updateIndicator();
                onAdvancedFilterChange();
            });
            var toggleBtn = createFilterToggleButton(filterPanel, moduleName);
            header.appendChild(toggleBtn);

            // Tag the certification group for media type switching
            var certGroups = filterPanel.querySelectorAll('.jellyseerr-filter-group');
            certGroups.forEach(function(g) {
                var lbl = g.querySelector('span');
                if (lbl && lbl.textContent === 'Rating:' && g.querySelector('select')) {
                    var selects = g.querySelectorAll('select');
                    if (selects.length === 1 && selects[0].options.length < 12) {
                        g.setAttribute('data-filter-certification', 'true');
                    }
                }
            });

            wrapper.appendChild(header);
            wrapper.appendChild(filterPanel);
        } else {
            wrapper.appendChild(header);
        }

        if (onSortChange) {
            var sortControl = createSortControl(moduleName, onSortChange);
            header.appendChild(sortControl);
        }

        return wrapper;
    }

    /**
     * Managed fetch helper using request manager when available
     * @param {string} path - API path
     * @param {string} cachePrefix - Cache key prefix (e.g., 'genre', 'network')
     * @param {object} [options] - Fetch options including signal
     * @returns {Promise<any>}
     */
    async function fetchWithManagedRequest(path, cachePrefix, options = {}) {
        const url = ApiClient.getUrl(path);
        const { signal } = options;

        if (JE.requestManager) {
            const cacheKey = `${cachePrefix}:${path}`;
            const cached = JE.requestManager.getCached(cacheKey);
            if (cached) return cached;

            const fetchFn = async () => {
                const response = await JE.requestManager.fetchWithRetry(url, {
                    method: 'GET',
                    headers: {
                        'X-Jellyfin-User-Id': ApiClient.getCurrentUserId(),
                        'X-Emby-Token': ApiClient.accessToken(),
                        'Accept': 'application/json'
                    },
                    signal
                });
                const data = await response.json();
                JE.requestManager.setCache(cacheKey, data);
                return data;
            };

            return JE.requestManager.withConcurrencyLimit(() =>
                JE.requestManager.deduplicatedFetch(cacheKey, fetchFn)
            );
        }

        // Fallback to ApiClient.ajax
        return ApiClient.ajax({
            type: 'GET',
            url: url,
            headers: { 'X-Jellyfin-User-Id': ApiClient.getCurrentUserId() },
            dataType: 'json'
        });
    }

    /**
     * Creates cards and returns a DocumentFragment for batch DOM insertion
     * @param {Array} results - Array of items to create cards for
     * @param {object} [options] - Options
     * @param {string} [options.cardClass] - Card class to use ('portraitCard' or 'overflowPortraitCard')
     * @returns {DocumentFragment}
     */
    function createCardsFragment(results, options = {}) {
        const { cardClass = 'portraitCard' } = options;
        const fragment = document.createDocumentFragment();
        const excludeLibraryItems = JE.pluginConfig?.JellyseerrExcludeLibraryItems === true;
        const excludeBlocklistedItems = JE.pluginConfig?.JellyseerrExcludeBlocklistedItems === true;
        const seen = new Set();

        // Filter hidden content before rendering
        const filteredResults = JE.hiddenContent
            ? JE.hiddenContent.filterJellyseerrResults(results, 'discovery')
            : results;

        for (let i = 0; i < filteredResults.length; i++) {
            const item = filteredResults[i];

            // Deduplicate by TMDB ID
            const key = `${item.mediaType}-${item.id}`;
            if (seen.has(key)) continue;
            seen.add(key);

            if (excludeLibraryItems && item.mediaInfo?.jellyfinMediaId) {
                continue;
            }

            if (excludeBlocklistedItems && item.mediaInfo?.status === 6) { // Status 6 = Blocklisted
                continue;
            }
            const card = JE.jellyseerrUI?.createJellyseerrCard?.(item, true, true);
            if (!card) continue;

            const classList = card.classList;
            // Remove both possible classes and add the desired one
            classList.remove('portraitCard', 'overflowPortraitCard');
            classList.add(cardClass);

            // Add media type for fast CSS-based filtering
            card.setAttribute('data-media-type', item.mediaType);

            const jellyfinMediaId = item.mediaInfo?.jellyfinMediaId;
            if (jellyfinMediaId) {
                card.setAttribute('data-library-item', 'true');
                card.setAttribute('data-jellyfin-media-id', jellyfinMediaId);
                classList.add('jellyseerr-card-in-library');

                const titleLink = card.querySelector('.cardText-first a');
                if (titleLink) {
                    const itemName = item.title || item.name;
                    titleLink.textContent = itemName;
                    titleLink.title = itemName;
                    titleLink.href = `#!/details?id=${jellyfinMediaId}`;
                    titleLink.removeAttribute('target');
                    titleLink.removeAttribute('rel');
                }
            }

            fragment.appendChild(card);
        }

        return fragment;
    }

    /**
     * Wait for the page to be ready (active page only, not hidden)
     * @param {AbortSignal} [signal] - Optional abort signal
     * @param {object} [options] - Options
     * @param {string} [options.type] - Type of page: 'list' or 'detail'
     * @returns {Promise<HTMLElement|null>}
     */
    function waitForPageReady(signal, options = {}) {
        const { type = 'list' } = options;

        return new Promise((resolve) => {
            if (signal?.aborted) {
                resolve(null);
                return;
            }

            const checkContainer = () => {
                if (type === 'detail') {
                    const detailContent = document.querySelector('.itemDetailPage:not(.hide) .detailPageContent') ||
                                          document.querySelector('.itemDetailPage:not(.hide)');
                    return detailContent;
                }
                // List page
                const listContainer = document.querySelector('.page:not(.hide) .itemsContainer') ||
                                      document.querySelector('.libraryPage:not(.hide) .itemsContainer');
                return listContainer?.children.length > 0 ? listContainer : null;
            };

            const immediate = checkContainer();
            if (immediate) {
                resolve(immediate);
                return;
            }

            let observerHandle = null;
            let timeoutId = null;

            const cleanup = () => {
                if (observerHandle) {
                    observerHandle.unsubscribe();
                    observerHandle = null;
                }
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }
            };

            if (signal) {
                signal.addEventListener('abort', () => {
                    cleanup();
                    resolve(null);
                }, { once: true });
            }

            observerHandle = JE.helpers.onBodyMutation('jellyseerr-discovery-container-detect', () => {
                const container = checkContainer();
                if (container) {
                    cleanup();
                    resolve(container);
                }
            });
            timeoutId = setTimeout(() => {
                cleanup();
                resolve(checkContainer());
            }, 3000);
        });
    }

    /**
     * Sets up infinite scroll using seamlessScroll module
     * Features:
     * - Larger prefetch window (~2 viewport heights)
     * - Retry UI on failure
     * - Scroll event fallback
     * @param {object} state - State object with activeScrollObserver property
     * @param {string} sectionSelector - CSS selector for the section
     * @param {Function} loadMoreFn - Function to call when more items needed
     * @param {Function} hasMoreCheck - Function that returns whether more pages exist
     * @param {Function} isLoadingCheck - Function that returns whether currently loading
     */
    function setupInfiniteScroll(state, sectionSelector, loadMoreFn, hasMoreCheck, isLoadingCheck) {
        JE.seamlessScroll.setupInfiniteScroll(
            state, sectionSelector, loadMoreFn, hasMoreCheck, isLoadingCheck
        );
    }

    /**
     * Cleanup scroll observer
     * @param {object} state - State object with activeScrollObserver property
     */
    function cleanupScrollObserver(state) {
        JE.seamlessScroll.cleanupInfiniteScroll(state);
    }

    /**
     * Applies filter visibility using CSS classes (fast, no DOM rebuild)
     * @param {HTMLElement} container - The items container
     * @param {string} mode - 'mixed', 'movies', or 'tv'
     */
    function applyFilterVisibility(container, mode) {
        if (!container) return;

        // Remove existing filter class from container
        container.classList.remove('filter-movies', 'filter-tv');

        if (mode === FILTER_MODES.MOVIES) {
            container.classList.add('filter-movies');
        } else if (mode === FILTER_MODES.TV) {
            container.classList.add('filter-tv');
        }
        // 'mixed' mode: no class = all visible
    }

    /**
     * Injects CSS rules for fast filter visibility (once per page)
     */
    function injectFilterStyles() {
        if (document.getElementById('jellyseerr-filter-styles')) return;

        const style = document.createElement('style');
        style.id = 'jellyseerr-filter-styles';
        style.textContent = `
            .filter-movies [data-media-type="tv"] { display: none !important; }
            .filter-tv [data-media-type="movie"] { display: none !important; }
        `;
        document.head.appendChild(style);
    }

    // Inject styles on load
    injectFilterStyles();

    // Export utilities
    JE.discoveryFilter = {
        MODES: FILTER_MODES,
        SORT_OPTIONS,
        getFilterMode,
        setFilterMode,
        resetFilterMode,
        getSortMode,
        getTvSortMode,
        setSortMode,
        resetSortMode,
        // Advanced filters
        getAdvancedFilters,
        setAdvancedFilter,
        resetAdvancedFilters,
        hasActiveAdvancedFilters,
        buildFilterQueryString,
        interleaveArrays,
        filterByMediaType,
        hasBothTypes,
        resultHasBothTypes,
        createFilterControl,
        createSortControl,
        createSectionHeader,
        // Shared utilities
        fetchWithManagedRequest,
        createCardsFragment,
        waitForPageReady,
        setupInfiniteScroll,
        cleanupScrollObserver,
        applyFilterVisibility
    };

})(window.JellyfinEnhanced || (window.JellyfinEnhanced = {}));
