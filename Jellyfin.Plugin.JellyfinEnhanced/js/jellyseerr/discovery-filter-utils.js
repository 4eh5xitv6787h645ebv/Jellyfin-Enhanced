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
    // Per-module map of advanced-filter values (year range, rating, votes, runtime, language, region)
    const runtimeAdvancedFilters = new Map();

    const SORT_OPTIONS = [
        { value: '', label: 'Popular' },
        { value: 'vote_average.desc', label: 'Top Rated' },
        { value: 'release_date.desc', label: 'Newest' },
        { value: 'release_date.asc', label: 'Oldest' }
    ];

    const ADVANCED_FILTER_FIELDS = [
        'yearFrom', 'yearTo',
        'minRating', 'maxRating',
        'minVotes', 'maxVotes',
        'runtimeFrom', 'runtimeTo',
        'originalLanguage', 'genres'
    ];

    // ISO 639-1 codes — top languages by TMDB content volume
    const LANGUAGE_OPTIONS = [
        { value: '', label: 'Any' },
        { value: 'en', label: 'English' },
        { value: 'es', label: 'Spanish' },
        { value: 'fr', label: 'French' },
        { value: 'de', label: 'German' },
        { value: 'it', label: 'Italian' },
        { value: 'pt', label: 'Portuguese' },
        { value: 'ru', label: 'Russian' },
        { value: 'ja', label: 'Japanese' },
        { value: 'ko', label: 'Korean' },
        { value: 'zh', label: 'Chinese' },
        { value: 'hi', label: 'Hindi' },
        { value: 'ta', label: 'Tamil' },
        { value: 'te', label: 'Telugu' },
        { value: 'ar', label: 'Arabic' },
        { value: 'tr', label: 'Turkish' },
        { value: 'th', label: 'Thai' },
        { value: 'vi', label: 'Vietnamese' },
        { value: 'id', label: 'Indonesian' },
        { value: 'nl', label: 'Dutch' },
        { value: 'pl', label: 'Polish' },
        { value: 'sv', label: 'Swedish' },
        { value: 'da', label: 'Danish' },
        { value: 'no', label: 'Norwegian' },
        { value: 'fi', label: 'Finnish' },
        { value: 'cs', label: 'Czech' },
        { value: 'he', label: 'Hebrew' },
        { value: 'uk', label: 'Ukrainian' },
        { value: 'el', label: 'Greek' },
        { value: 'hu', label: 'Hungarian' },
        { value: 'ro', label: 'Romanian' }
    ];

    // TMDB genres are fetched lazily on first use and cached for the session.
    let cachedTmdbGenres = null;
    let inflightTmdbGenresPromise = null;

    /**
     * Fetches the union of TMDB movie + TV genres, sorted by name, deduped by ID.
     * Cached after the first successful response so each panel render is cheap.
     * @returns {Promise<Array<{id: number, name: string}>>}
     */
    async function getTmdbGenresAsync() {
        if (cachedTmdbGenres) return cachedTmdbGenres;
        if (inflightTmdbGenresPromise) return inflightTmdbGenresPromise;

        inflightTmdbGenresPromise = (async () => {
            try {
                const [tvResp, movieResp] = await Promise.all([
                    fetchWithManagedRequest('/JellyfinEnhanced/tmdb/genres/tv', 'genres-utils').catch(() => []),
                    fetchWithManagedRequest('/JellyfinEnhanced/tmdb/genres/movie', 'genres-utils').catch(() => [])
                ]);
                const map = new Map();
                (Array.isArray(tvResp) ? tvResp : []).forEach(g => {
                    if (g && typeof g.id === 'number' && g.name) map.set(g.id, { id: g.id, name: g.name });
                });
                (Array.isArray(movieResp) ? movieResp : []).forEach(g => {
                    if (g && typeof g.id === 'number' && g.name) map.set(g.id, { id: g.id, name: g.name });
                });
                cachedTmdbGenres = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
                return cachedTmdbGenres;
            } finally {
                inflightTmdbGenresPromise = null;
            }
        })();

        return inflightTmdbGenresPromise;
    }

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

    /**
     * Returns the current advanced filter values for a module.
     * Always returns a complete object — empty fields use ''.
     * @param {string} moduleName
     * @returns {Object}
     */
    function getAdvancedFilters(moduleName) {
        const stored = runtimeAdvancedFilters.get(moduleName) || {};
        const out = {};
        ADVANCED_FILTER_FIELDS.forEach(k => { out[k] = stored[k] || ''; });
        return out;
    }

    /**
     * Sets/replaces the advanced filter values for a module.
     * Only known fields with non-empty values are stored.
     * @param {string} moduleName
     * @param {Object} filters
     */
    function setAdvancedFilters(moduleName, filters) {
        const cleaned = {};
        ADVANCED_FILTER_FIELDS.forEach(k => {
            const v = filters?.[k];
            if (v != null && String(v).trim() !== '') {
                cleaned[k] = String(v).trim();
            }
        });
        if (Object.keys(cleaned).length === 0) {
            runtimeAdvancedFilters.delete(moduleName);
        } else {
            runtimeAdvancedFilters.set(moduleName, cleaned);
        }
    }

    /**
     * Resets advanced filters for a module back to empty/default.
     * @param {string} moduleName
     */
    function resetAdvancedFilters(moduleName) {
        runtimeAdvancedFilters.delete(moduleName);
    }

    /**
     * Returns the count of active (non-empty) advanced filters for a module,
     * grouping the year-from/year-to and runtime-from/runtime-to pairs as one.
     * @param {string} moduleName
     * @returns {number}
     */
    function countActiveAdvancedFilters(moduleName) {
        const f = runtimeAdvancedFilters.get(moduleName);
        if (!f) return 0;
        let n = 0;
        if (f.yearFrom || f.yearTo) n += 1;
        if (f.minRating || f.maxRating) n += 1;
        if (f.minVotes || f.maxVotes) n += 1;
        if (f.runtimeFrom || f.runtimeTo) n += 1;
        if (f.originalLanguage) n += 1;
        if (f.genres) n += 1;
        return n;
    }

    /**
     * Builds an "&key=value" query string suffix for the active advanced filters,
     * adapted for the target media type.
     * Year range maps to primaryReleaseDate* for movies, firstAirDate* for TV.
     * @param {string} moduleName
     * @param {Object} [opts]
     * @param {boolean} [opts.isTv=false] - Whether this is for a TV-side request
     * @param {Array<string>} [opts.allowed] - If set, only emit params for these filter keys
     * @returns {string}
     */
    function buildFilterQueryParams(moduleName, opts = {}) {
        const filters = getAdvancedFilters(moduleName);
        const isTv = opts.isTv === true;
        const allowed = Array.isArray(opts.allowed) ? new Set(opts.allowed) : null;
        const allow = (key) => !allowed || allowed.has(key);

        const params = [];

        if (allow('year')) {
            if (filters.yearFrom) {
                const dateFrom = `${filters.yearFrom}-01-01`;
                if (isTv) params.push(`firstAirDateGte=${encodeURIComponent(dateFrom)}`);
                else params.push(`primaryReleaseDateGte=${encodeURIComponent(dateFrom)}`);
            }
            if (filters.yearTo) {
                const dateTo = `${filters.yearTo}-12-31`;
                if (isTv) params.push(`firstAirDateLte=${encodeURIComponent(dateTo)}`);
                else params.push(`primaryReleaseDateLte=${encodeURIComponent(dateTo)}`);
            }
        }
        if (allow('rating')) {
            if (filters.minRating) params.push(`voteAverageGte=${encodeURIComponent(filters.minRating)}`);
            if (filters.maxRating) params.push(`voteAverageLte=${encodeURIComponent(filters.maxRating)}`);
        }
        if (allow('votes')) {
            if (filters.minVotes) params.push(`voteCountGte=${encodeURIComponent(filters.minVotes)}`);
            if (filters.maxVotes) params.push(`voteCountLte=${encodeURIComponent(filters.maxVotes)}`);
        }
        if (allow('runtime')) {
            if (filters.runtimeFrom) params.push(`withRuntimeGte=${encodeURIComponent(filters.runtimeFrom)}`);
            if (filters.runtimeTo) params.push(`withRuntimeLte=${encodeURIComponent(filters.runtimeTo)}`);
        }
        if (allow('language') && filters.originalLanguage) {
            params.push(`withOriginalLanguage=${encodeURIComponent(filters.originalLanguage)}`);
        }
        if (allow('genre') && filters.genres) {
            // TMDB withGenres: pipe = OR semantics (item matches any selected genre)
            params.push(`withGenres=${encodeURIComponent(filters.genres)}`);
        }

        return params.length > 0 ? '&' + params.join('&') : '';
    }

    /**
     * Applies the current advanced filters to an array of items client-side.
     * Used by Person discovery, which doesn't go through TMDB Discover API.
     * Only the filter keys present in `allowed` are evaluated.
     * @param {Array} results
     * @param {string} moduleName
     * @param {Array<string>} [allowed] - Defaults to year/rating/votes/language
     * @returns {Array}
     */
    function applyClientSideFilters(results, moduleName, allowed) {
        if (!Array.isArray(results) || results.length === 0) return results;
        const filters = getAdvancedFilters(moduleName);
        // Use Array.isArray so an explicit empty-array means "no filters allowed"
        const allowSet = Array.isArray(allowed)
            ? new Set(allowed)
            : new Set(['year', 'rating', 'votes', 'language']);

        // Short-circuit: nothing to do if no allowed-and-active filter exists
        const anyActive = ADVANCED_FILTER_FIELDS.some(k => {
            if (!filters[k]) return false;
            // Map field → category so we only consider allowed ones
            if (k === 'yearFrom' || k === 'yearTo') return allowSet.has('year');
            if (k === 'runtimeFrom' || k === 'runtimeTo') return allowSet.has('runtime');
            if (k === 'minRating' || k === 'maxRating') return allowSet.has('rating');
            if (k === 'minVotes' || k === 'maxVotes') return allowSet.has('votes');
            if (k === 'originalLanguage') return allowSet.has('language');
            if (k === 'genres') return allowSet.has('genre');
            return false;
        });
        if (!anyActive) return results;

        const yearFrom = (allowSet.has('year') && filters.yearFrom) ? parseInt(filters.yearFrom, 10) : null;
        const yearTo = (allowSet.has('year') && filters.yearTo) ? parseInt(filters.yearTo, 10) : null;
        const minRating = (allowSet.has('rating') && filters.minRating) ? parseFloat(filters.minRating) : null;
        const maxRating = (allowSet.has('rating') && filters.maxRating) ? parseFloat(filters.maxRating) : null;
        const minVotes = (allowSet.has('votes') && filters.minVotes) ? parseInt(filters.minVotes, 10) : null;
        const maxVotes = (allowSet.has('votes') && filters.maxVotes) ? parseInt(filters.maxVotes, 10) : null;
        const wantedLang = (allowSet.has('language') && filters.originalLanguage)
            ? filters.originalLanguage.toLowerCase() : '';
        const minRuntime = (allowSet.has('runtime') && filters.runtimeFrom) ? parseInt(filters.runtimeFrom, 10) : null;
        const maxRuntime = (allowSet.has('runtime') && filters.runtimeTo) ? parseInt(filters.runtimeTo, 10) : null;
        // OR semantics — keep items matching ANY of the selected genres (matches pipe-separated server-side)
        const wantedGenres = (allowSet.has('genre') && filters.genres)
            ? String(filters.genres).split('|').map(g => parseInt(g, 10)).filter(Number.isFinite)
            : [];

        return results.filter(item => {
            if (yearFrom != null || yearTo != null) {
                const dateStr = item.releaseDate || item.firstAirDate
                    || item.release_date || item.first_air_date || '';
                const year = dateStr ? parseInt(String(dateStr).slice(0, 4), 10) : 0;
                // Items with unknown year are excluded only when a yearFrom is set;
                // a yearTo-only filter ("released before 2010") keeps unknown-year items.
                if (yearFrom != null && (!year || year < yearFrom)) return false;
                if (yearTo != null && year && year > yearTo) return false;
            }
            if (minRating != null || maxRating != null) {
                const r = Number(item.voteAverage ?? item.vote_average ?? 0);
                if (!Number.isFinite(r)) return false;
                if (minRating != null && r < minRating) return false;
                if (maxRating != null && r > maxRating) return false;
            }
            if (minVotes != null || maxVotes != null) {
                const v = Number(item.voteCount ?? item.vote_count ?? 0);
                if (!Number.isFinite(v)) return false;
                if (minVotes != null && v < minVotes) return false;
                if (maxVotes != null && v > maxVotes) return false;
            }
            if (wantedLang) {
                const lang = String(item.originalLanguage ?? item.original_language ?? '').toLowerCase();
                if (lang !== wantedLang) return false;
            }
            if (minRuntime != null || maxRuntime != null) {
                const rt = Number(item.runtime ?? 0);
                // When user explicitly sets a min runtime, exclude items with no runtime
                // data — fail closed so the result list reflects the constraint.
                if (minRuntime != null && (!Number.isFinite(rt) || rt < minRuntime)) return false;
                if (maxRuntime != null && rt > 0 && rt > maxRuntime) return false;
            }
            if (wantedGenres.length > 0) {
                const itemGenres = item.genreIds || item.genre_ids || [];
                if (!Array.isArray(itemGenres) || itemGenres.length === 0) return false;
                if (!wantedGenres.some(g => itemGenres.includes(g))) return false;
            }
            return true;
        });
    }

    /**
     * Builds a styled select element pre-populated with options.
     * @param {Array<{value: string, label: string}>} options
     * @param {string} currentValue
     * @returns {HTMLSelectElement}
     */
    function buildSelect(options, currentValue) {
        const select = document.createElement('select');
        select.style.cssText = `
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.9);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            padding: 3px 8px;
            font-size: inherit;
            font-family: inherit;
            cursor: pointer;
            outline: none;
        `;
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            o.style.cssText = 'background:#1a1a2e;color:#fff;';
            if (currentValue === opt.value) o.selected = true;
            select.appendChild(o);
        });
        return select;
    }

    /**
     * Builds a styled number input.
     * @param {Object} opts
     * @param {string} opts.placeholder
     * @param {number} opts.min
     * @param {number} opts.max
     * @param {string|number} [opts.step] - Step value (e.g. 0.1 for decimal ratings)
     * @param {string} opts.value
     * @param {string} opts.width - CSS width value (e.g., '5.5em')
     * @returns {HTMLInputElement}
     */
    function buildNumberInput({ placeholder, min, max, step, value, width }) {
        const input = document.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        if (step != null) input.step = String(step);
        input.placeholder = placeholder;
        input.value = value || '';
        input.inputMode = step && String(step).indexOf('.') !== -1 ? 'decimal' : 'numeric';
        input.style.cssText = `
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.9);
            border: 1px solid rgba(255,255,255,0.2);
            border-radius: 4px;
            padding: 3px 8px;
            font-size: inherit;
            font-family: inherit;
            outline: none;
            width: ${width};
        `;
        return input;
    }

    /**
     * Removes all child nodes of an element using DOM APIs (no innerHTML).
     * @param {HTMLElement} el
     */
    function clearChildren(el) {
        while (el && el.firstChild) el.removeChild(el.firstChild);
    }

    /**
     * Builds the multi-select genre tag chooser.
     * Genres are loaded asynchronously via `getTmdbGenresAsync`. Each tag is a
     * toggleable button; selected IDs are stored on the container's
     * `dataset.value` as a pipe-separated string (matches TMDB OR semantics).
     * @param {string} currentValue - Pipe-separated genre IDs currently selected
     * @returns {HTMLElement}
     */
    function buildGenreSelector(currentValue) {
        const wrapper = document.createElement('div');
        wrapper.className = 'jellyseerr-discovery-genre-selector';
        wrapper.style.cssText = `
            display:flex;flex-wrap:wrap;gap:0.3em;
            max-width:48em;
            min-height:1.6em;
            align-items:flex-start;
        `;
        wrapper.dataset.value = currentValue || '';

        const selected = new Set(
            String(currentValue || '').split('|').filter(Boolean)
        );

        function applyTagStyle(tag, isSelected) {
            tag.style.cssText = `
                padding: 3px 10px;
                border: 1px solid ${isSelected ? 'rgba(98,148,221,0.7)' : 'rgba(255,255,255,0.25)'};
                border-radius: 12px;
                background: ${isSelected ? 'rgba(98,148,221,0.55)' : 'rgba(255,255,255,0.05)'};
                color: ${isSelected ? '#fff' : 'rgba(255,255,255,0.85)'};
                font-size: 0.8em;
                font-family: inherit;
                cursor: pointer;
            `;
        }

        function renderGenres(genres) {
            clearChildren(wrapper);
            genres.forEach(genre => {
                const tag = document.createElement('button');
                tag.type = 'button';
                tag.dataset.genreId = String(genre.id);
                tag.textContent = genre.name;
                applyTagStyle(tag, selected.has(String(genre.id)));
                tag.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = tag.dataset.genreId;
                    if (selected.has(id)) selected.delete(id);
                    else selected.add(id);
                    applyTagStyle(tag, selected.has(id));
                    wrapper.dataset.value = Array.from(selected).join('|');
                });
                wrapper.appendChild(tag);
            });
        }

        function renderMessage(text) {
            clearChildren(wrapper);
            const span = document.createElement('span');
            span.textContent = text;
            span.style.cssText = 'color:rgba(255,255,255,0.45);font-size:0.85em;';
            wrapper.appendChild(span);
        }

        // Show a placeholder while genres load asynchronously
        renderMessage('Loading…');

        getTmdbGenresAsync().then(genres => {
            if (!Array.isArray(genres) || genres.length === 0) {
                renderMessage('No genres available');
                return;
            }
            renderGenres(genres);
        }).catch(() => {
            renderMessage('Could not load genres');
        });

        // Reset hook used by the panel's reset button
        wrapper._reset = () => {
            selected.clear();
            wrapper.dataset.value = '';
            wrapper.querySelectorAll('button[data-genre-id]').forEach(btn => {
                applyTagStyle(btn, false);
            });
        };

        return wrapper;
    }

    /**
     * Wraps a label and control in a small vertical group.
     * @param {string} label
     * @param {HTMLElement|HTMLElement[]} control
     * @returns {HTMLElement}
     */
    function makeFieldGroup(label, control) {
        const group = document.createElement('div');
        group.style.cssText = 'display:flex;flex-direction:column;gap:0.25em;font-size:0.85em;';
        const lbl = document.createElement('label');
        lbl.textContent = label;
        lbl.style.cssText = 'color:rgba(255,255,255,0.55);font-size:0.8em;';
        group.appendChild(lbl);
        if (Array.isArray(control)) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:0.3em;';
            control.forEach(c => row.appendChild(c));
            group.appendChild(row);
        } else {
            group.appendChild(control);
        }
        return group;
    }

    /**
     * Builds the toggle button + collapsible filter panel.
     * Only the filters listed in `supportedFilters` are rendered, so each
     * section can opt out of filters that don't apply to it.
     *
     * @param {string} moduleName - e.g., 'genre', 'tag', 'network', 'person'
     * @param {Array<string>} supportedFilters - Subset of ['year','rating','votes','runtime','language','region']
     * @param {Function} onApply - Callback when Apply or Reset is clicked. Called with no args.
     * @returns {{toggle: HTMLElement, panel: HTMLElement, refreshBadge: Function}|null}
     */
    function buildFilterToggleAndPanel(moduleName, supportedFilters, onApply) {
        if (!Array.isArray(supportedFilters) || supportedFilters.length === 0) return null;

        const filtersLabel = JE.t('jellyseerr_discover_filters');
        const yearLabel = JE.t('jellyseerr_discover_filter_year');
        const ratingLabel = JE.t('jellyseerr_discover_filter_rating');
        const votesLabel = JE.t('jellyseerr_discover_filter_votes');
        const runtimeLabel = JE.t('jellyseerr_discover_filter_runtime');
        const languageLabel = JE.t('jellyseerr_discover_filter_language');
        const genresLabel = JE.t('jellyseerr_discover_filter_genres');
        const fromPlaceholder = JE.t('jellyseerr_discover_filter_from');
        const toPlaceholder = JE.t('jellyseerr_discover_filter_to');
        const minPlaceholder = JE.t('jellyseerr_discover_filter_min');
        const maxPlaceholder = JE.t('jellyseerr_discover_filter_max');
        const applyLabel = JE.t('jellyseerr_discover_filter_apply');
        const resetLabel = JE.t('jellyseerr_discover_filter_reset');

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'jellyseerr-filter-toggle-btn';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.style.cssText = `
            display:inline-flex;align-items:center;gap:0.35em;
            padding:4px 10px;
            background:rgba(255,255,255,0.05);
            color:rgba(255,255,255,0.85);
            border:1px solid rgba(255,255,255,0.2);
            border-radius:4px;
            cursor:pointer;
            font-size:0.85em;font-family:inherit;
        `;
        const labelSpan = document.createElement('span');
        labelSpan.textContent = filtersLabel;
        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'filter-count-badge';
        badgeSpan.style.cssText = `
            display:none;
            background:rgba(98,148,221,0.65);
            color:#fff;border-radius:10px;
            padding:0 6px;font-size:0.8em;font-weight:600;
            min-width:1.4em;text-align:center;
        `;
        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'material-icons toggle-arrow';
        arrowSpan.style.cssText = 'font-size:1.1em;';
        arrowSpan.textContent = 'expand_more';
        toggle.append(labelSpan, badgeSpan, arrowSpan);

        const panel = document.createElement('div');
        panel.className = 'jellyseerr-discovery-filter-panel';
        panel.hidden = true;
        panel.style.cssText = `
            display:none;flex-wrap:wrap;gap:0.7em 1.4em;
            padding:0.8em 1em;
            margin-top:0.1em;
            background:rgba(255,255,255,0.04);
            border:1px solid rgba(255,255,255,0.12);
            border-radius:6px;
            align-items:flex-end;
            width:100%;
        `;

        const current = getAdvancedFilters(moduleName);
        const inputs = {};

        if (supportedFilters.includes('year')) {
            const fromInput = buildNumberInput({
                placeholder: fromPlaceholder, min: 1900, max: 2100,
                value: current.yearFrom, width: '5.5em'
            });
            const toInput = buildNumberInput({
                placeholder: toPlaceholder, min: 1900, max: 2100,
                value: current.yearTo, width: '5.5em'
            });
            const dash = document.createElement('span');
            dash.textContent = '–';
            dash.style.color = 'rgba(255,255,255,0.4)';
            panel.appendChild(makeFieldGroup(yearLabel, [fromInput, dash, toInput]));
            inputs.yearFrom = fromInput;
            inputs.yearTo = toInput;
        }

        if (supportedFilters.includes('rating')) {
            const minInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 10, step: '0.1',
                value: current.minRating, width: '4.5em'
            });
            const maxInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 10, step: '0.1',
                value: current.maxRating, width: '4.5em'
            });
            const dash = document.createElement('span');
            dash.textContent = '–';
            dash.style.color = 'rgba(255,255,255,0.4)';
            panel.appendChild(makeFieldGroup(ratingLabel, [minInput, dash, maxInput]));
            inputs.minRating = minInput;
            inputs.maxRating = maxInput;
        }

        if (supportedFilters.includes('votes')) {
            const minInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 999999,
                value: current.minVotes, width: '6em'
            });
            const maxInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 999999,
                value: current.maxVotes, width: '6em'
            });
            const dash = document.createElement('span');
            dash.textContent = '–';
            dash.style.color = 'rgba(255,255,255,0.4)';
            panel.appendChild(makeFieldGroup(votesLabel, [minInput, dash, maxInput]));
            inputs.minVotes = minInput;
            inputs.maxVotes = maxInput;
        }

        if (supportedFilters.includes('runtime')) {
            const fromInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 600,
                value: current.runtimeFrom, width: '4.5em'
            });
            const toInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 600,
                value: current.runtimeTo, width: '4.5em'
            });
            const dash = document.createElement('span');
            dash.textContent = '–';
            dash.style.color = 'rgba(255,255,255,0.4)';
            panel.appendChild(makeFieldGroup(runtimeLabel, [fromInput, dash, toInput]));
            inputs.runtimeFrom = fromInput;
            inputs.runtimeTo = toInput;
        }

        if (supportedFilters.includes('language')) {
            const select = buildSelect(LANGUAGE_OPTIONS, current.originalLanguage);
            panel.appendChild(makeFieldGroup(languageLabel, select));
            inputs.originalLanguage = select;
        }

        if (supportedFilters.includes('genre')) {
            const genreContainer = buildGenreSelector(current.genres);
            // Genre selector spans full width because the tag list can wrap
            const group = makeFieldGroup(genresLabel, genreContainer);
            group.style.flexBasis = '100%';
            panel.appendChild(group);
            inputs.genres = genreContainer;
        }

        const actions = document.createElement('div');
        actions.style.cssText = 'display:flex;gap:0.5em;margin-left:auto;align-self:flex-end;';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.textContent = resetLabel;
        resetBtn.style.cssText = `
            background:transparent;color:rgba(255,255,255,0.75);
            border:1px solid rgba(255,255,255,0.2);border-radius:4px;
            padding:5px 14px;cursor:pointer;font-size:0.85em;font-family:inherit;
        `;

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = applyLabel;
        applyBtn.style.cssText = `
            background:rgba(98,148,221,0.55);color:#fff;
            border:1px solid rgba(98,148,221,0.75);border-radius:4px;
            padding:5px 16px;cursor:pointer;font-size:0.85em;font-weight:600;font-family:inherit;
        `;

        actions.append(resetBtn, applyBtn);
        panel.appendChild(actions);

        function readInputs() {
            const out = {};
            Object.entries(inputs).forEach(([k, el]) => {
                let v;
                if (k === 'genres') {
                    // Genre selector stores its pipe-separated value on dataset
                    v = String(el.dataset?.value || '').trim();
                } else {
                    v = String(el.value || '').trim();
                }
                if (v) out[k] = v;
            });
            return out;
        }

        function refreshBadge() {
            const count = countActiveAdvancedFilters(moduleName);
            if (count > 0) {
                badgeSpan.textContent = String(count);
                badgeSpan.style.display = 'inline-block';
            } else {
                badgeSpan.style.display = 'none';
            }
        }

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'flex';
            panel.hidden = isOpen;
            arrowSpan.textContent = isOpen ? 'expand_more' : 'expand_less';
            toggle.setAttribute('aria-expanded', String(!isOpen));
        });

        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            Object.entries(inputs).forEach(([k, el]) => {
                if (k === 'genres' && typeof el._reset === 'function') {
                    el._reset();
                } else {
                    el.value = '';
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
            resetAdvancedFilters(moduleName);
            refreshBadge();
            if (typeof onApply === 'function') onApply();
        });

        // Coerce a raw input value into a finite integer within [min, max], or '' if invalid.
        // Number inputs accept characters like 'e' which produce NaN — drop those rather than
        // letting them flow into TMDB query strings as 'abc-01-01'.
        function clampInt(value, min, max) {
            if (value === '' || value == null) return '';
            const n = parseInt(value, 10);
            if (!Number.isFinite(n)) return '';
            if (n < min) return String(min);
            if (n > max) return String(max);
            return String(n);
        }

        // Same as clampInt but allows decimal precision (used for ratings 0.0-10.0).
        function clampFloat(value, min, max, decimals) {
            if (value === '' || value == null) return '';
            const n = parseFloat(value);
            if (!Number.isFinite(n)) return '';
            const clamped = Math.max(min, Math.min(max, n));
            const rounded = decimals != null
                ? Number(clamped.toFixed(decimals))
                : clamped;
            return String(rounded);
        }

        applyBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = readInputs();

            // Validate + clamp numeric inputs before they reach the URL builder.
            if ('yearFrom' in next) next.yearFrom = clampInt(next.yearFrom, 1900, 2100);
            if ('yearTo' in next) next.yearTo = clampInt(next.yearTo, 1900, 2100);
            if ('runtimeFrom' in next) next.runtimeFrom = clampInt(next.runtimeFrom, 0, 600);
            if ('runtimeTo' in next) next.runtimeTo = clampInt(next.runtimeTo, 0, 600);
            if ('minRating' in next) next.minRating = clampFloat(next.minRating, 0, 10, 1);
            if ('maxRating' in next) next.maxRating = clampFloat(next.maxRating, 0, 10, 1);
            if ('minVotes' in next) next.minVotes = clampInt(next.minVotes, 0, 999999);
            if ('maxVotes' in next) next.maxVotes = clampInt(next.maxVotes, 0, 999999);

            // Drop any keys that clamped to '' so they aren't stored.
            Object.keys(next).forEach(k => { if (next[k] === '') delete next[k]; });

            // Reflect clamped values in the inputs so the user sees what was kept.
            if (inputs.yearFrom) inputs.yearFrom.value = next.yearFrom || '';
            if (inputs.yearTo) inputs.yearTo.value = next.yearTo || '';
            if (inputs.runtimeFrom) inputs.runtimeFrom.value = next.runtimeFrom || '';
            if (inputs.runtimeTo) inputs.runtimeTo.value = next.runtimeTo || '';
            if (inputs.minRating) inputs.minRating.value = next.minRating || '';
            if (inputs.maxRating) inputs.maxRating.value = next.maxRating || '';
            if (inputs.minVotes) inputs.minVotes.value = next.minVotes || '';
            if (inputs.maxVotes) inputs.maxVotes.value = next.maxVotes || '';

            // Swap reversed numeric ranges so the request is well-formed.
            const swapPairs = [
                ['yearFrom', 'yearTo'],
                ['runtimeFrom', 'runtimeTo'],
                ['minRating', 'maxRating'],
                ['minVotes', 'maxVotes']
            ];
            swapPairs.forEach(([loKey, hiKey]) => {
                if (!next[loKey] || !next[hiKey]) return;
                const a = parseFloat(next[loKey]);
                const b = parseFloat(next[hiKey]);
                if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
                    [next[loKey], next[hiKey]] = [next[hiKey], next[loKey]];
                    if (inputs[loKey]) inputs[loKey].value = next[loKey];
                    if (inputs[hiKey]) inputs[hiKey].value = next[hiKey];
                }
            });
            setAdvancedFilters(moduleName, next);
            refreshBadge();
            if (typeof onApply === 'function') onApply();
        });

        refreshBadge();

        return { toggle, panel, refreshBadge };
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
     * Creates a section header with title, optional media-type filter, sort dropdown,
     * and an optional advanced-filters toggle + collapsible panel.
     *
     * Returns the wrapper element. The wrapper contains a header row plus the panel
     * as a sibling so the panel can flow below the row.
     *
     * @param {string} title - Section title text
     * @param {string} moduleName - Module name for filter persistence
     * @param {boolean} showFilter - Whether to show the All/Movies/Series filter
     * @param {Function} onFilterChange - Callback when media-type filter changes
     * @param {Function} [onSortChange] - Callback when sort changes
     * @param {Object} [options]
     * @param {Array<string>} [options.supportedAdvancedFilters] - Subset of
     *     ['year','rating','votes','runtime','language','region']
     * @param {Function} [options.onAdvancedFiltersApply] - Callback when Apply or Reset
     *     is clicked in the advanced filter panel
     * @returns {HTMLElement} - The header wrapper element
     */
    function createSectionHeader(title, moduleName, showFilter, onFilterChange, onSortChange, options) {
        const opts = options || {};
        const wrapper = document.createElement('div');
        wrapper.className = 'jellyseerr-discovery-header-wrapper';
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:0.4em;margin-bottom:1em;width:100%;';

        const header = document.createElement('div');
        header.className = 'jellyseerr-discovery-header';
        header.style.cssText = 'display:flex;align-items:baseline;gap:1em;flex-wrap:wrap;width:100%;';

        const titleElement = document.createElement('h2');
        titleElement.className = 'sectionTitle sectionTitle-cards';
        titleElement.textContent = title;
        titleElement.style.margin = '0';
        header.appendChild(titleElement);

        if (showFilter) {
            const filterControl = createFilterControl(moduleName, onFilterChange);
            header.appendChild(filterControl);
        }

        if (onSortChange) {
            const sortControl = createSortControl(moduleName, onSortChange);
            header.appendChild(sortControl);
        }

        wrapper.appendChild(header);

        const advancedFilters = opts.supportedAdvancedFilters;
        if (Array.isArray(advancedFilters) && advancedFilters.length > 0) {
            const built = buildFilterToggleAndPanel(
                moduleName,
                advancedFilters,
                opts.onAdvancedFiltersApply
            );
            if (built) {
                // The toggle button sits inside the header row; the panel sits below it.
                header.appendChild(built.toggle);
                wrapper.appendChild(built.panel);
            }
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
        LANGUAGE_OPTIONS,
        ADVANCED_FILTER_FIELDS,
        getFilterMode,
        setFilterMode,
        resetFilterMode,
        getSortMode,
        getTvSortMode,
        setSortMode,
        resetSortMode,
        // Advanced filter API
        getAdvancedFilters,
        setAdvancedFilters,
        resetAdvancedFilters,
        countActiveAdvancedFilters,
        buildFilterQueryParams,
        applyClientSideFilters,
        getTmdbGenresAsync,
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
