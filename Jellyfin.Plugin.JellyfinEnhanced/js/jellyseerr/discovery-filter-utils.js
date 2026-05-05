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
        'originalLanguage',
        // genresMode is a meta-field ('any' or 'all') controlling how genres
        // combine; counted separately so the badge doesn't double-count it.
        'genres', 'genresMode'
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
        // genresMode is metadata, not an independent filter — never counted.
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
            // Seerr accepts `language` for original-language filtering. The route's
            // `withOriginalLanguage` arg is rejected with HTTP 400 in the Seerr
            // versions tested against this plugin (Sept 2025+).
            params.push(`language=${encodeURIComponent(filters.originalLanguage)}`);
        }
        if (allow('genre') && filters.genres) {
            // Storage uses pipes; URL separator depends on genresMode:
            //   genresMode='all' → comma (TMDB AND — must have every genre)
            //   default 'any'    → pipe (TMDB OR  — must have any one)
            const ids = String(filters.genres).split('|').filter(Boolean);
            const sep = filters.genresMode === 'all' ? ',' : '|';
            params.push(`withGenres=${encodeURIComponent(ids.join(sep))}`);
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
            // genresMode alone (without genres) does nothing
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
        // Genre filter — semantic depends on genresMode (default 'any' = OR)
        const wantedGenres = (allowSet.has('genre') && filters.genres)
            ? String(filters.genres).split('|').map(g => parseInt(g, 10)).filter(Number.isFinite)
            : [];
        const requireAllGenres = filters.genresMode === 'all';

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
                const ok = requireAllGenres
                    ? wantedGenres.every(g => itemGenres.includes(g))
                    : wantedGenres.some(g => itemGenres.includes(g));
                if (!ok) return false;
            }
            return true;
        });
    }

    /**
     * Builds a select element pre-populated with options. Uses the
     * `.je-filter-input` class for theme-aware styling.
     * @param {Array<{value: string, label: string}>} options
     * @param {string} currentValue
     * @returns {HTMLSelectElement}
     */
    function buildSelect(options, currentValue) {
        const select = document.createElement('select');
        select.className = 'je-filter-input';
        options.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.label;
            if (currentValue === opt.value) o.selected = true;
            select.appendChild(o);
        });
        return select;
    }

    /**
     * Builds a number input. Uses the `.je-filter-input` class for theme-aware
     * styling; `width` is no longer applied inline because the input flexes
     * inside `.je-filter-range` (paired ranges) or `.je-filter-group` (single).
     * @param {Object} opts
     * @param {string} opts.placeholder
     * @param {number} opts.min
     * @param {number} opts.max
     * @param {string|number} [opts.step] - Step value (e.g. 0.1 for decimal ratings)
     * @param {string} opts.value
     * @returns {HTMLInputElement}
     */
    function buildNumberInput({ placeholder, min, max, step, value }) {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'je-filter-input';
        input.min = String(min);
        input.max = String(max);
        if (step != null) input.step = String(step);
        input.placeholder = placeholder;
        input.value = value || '';
        input.inputMode = step && String(step).indexOf('.') !== -1 ? 'decimal' : 'numeric';
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
        wrapper.dataset.value = currentValue || '';

        const selected = new Set(
            String(currentValue || '').split('|').filter(Boolean)
        );

        function setTagSelected(tag, isSelected) {
            tag.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        }

        function renderGenres(genres) {
            clearChildren(wrapper);
            genres.forEach(genre => {
                const tag = document.createElement('button');
                tag.type = 'button';
                tag.className = 'je-filter-genre-tag';
                tag.dataset.genreId = String(genre.id);
                tag.textContent = genre.name;
                setTagSelected(tag, selected.has(String(genre.id)));
                tag.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const id = tag.dataset.genreId;
                    if (selected.has(id)) selected.delete(id);
                    else selected.add(id);
                    setTagSelected(tag, selected.has(id));
                    wrapper.dataset.value = Array.from(selected).join('|');
                });
                wrapper.appendChild(tag);
            });
        }

        function renderMessage(text) {
            clearChildren(wrapper);
            const span = document.createElement('span');
            span.className = 'je-filter-genre-empty';
            span.textContent = text;
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
                setTagSelected(btn, false);
            });
        };

        return wrapper;
    }

    /**
     * Wraps a label and control(s) in a vertical filter group. Multi-control
     * arrays are placed in a `.je-filter-range` row. If `headerExtra` is given,
     * the label and that element share a row at the top (used to put the
     * AND/OR toggle next to the Genres label).
     * @param {string} label
     * @param {HTMLElement|HTMLElement[]} control
     * @param {Object} [opts]
     * @param {boolean} [opts.fullWidth] - Span the full grid (used by Genres)
     * @param {HTMLElement} [opts.headerExtra] - Element to render right of label
     * @returns {HTMLElement}
     */
    function makeFieldGroup(label, control, opts) {
        const group = document.createElement('div');
        group.className = 'je-filter-group' + (opts?.fullWidth ? ' je-filter-group--full' : '');

        const lbl = document.createElement('label');
        lbl.className = 'je-filter-label';
        lbl.textContent = label;

        if (opts?.headerExtra) {
            const header = document.createElement('div');
            header.className = 'je-filter-group-header';
            header.append(lbl, opts.headerExtra);
            group.appendChild(header);
        } else {
            group.appendChild(lbl);
        }

        if (Array.isArray(control)) {
            const row = document.createElement('div');
            row.className = 'je-filter-range';
            control.forEach(c => row.appendChild(c));
            group.appendChild(row);
        } else {
            group.appendChild(control);
        }
        return group;
    }

    /**
     * Builds the AND/OR toggle for the genre selector.
     *  - `any` (default) → OR semantics, server uses pipe `|`
     *  - `all`           → AND semantics, server uses comma `,`
     * The selected mode is stored on the wrapper's `dataset.value`.
     * @param {string} currentMode - 'any' or 'all'
     * @returns {HTMLElement}
     */
    function buildGenreModeToggle(currentMode) {
        const initial = (currentMode === 'all') ? 'all' : 'any';
        const wrapper = document.createElement('div');
        wrapper.className = 'je-filter-mode-toggle';
        wrapper.setAttribute('role', 'group');
        wrapper.dataset.value = initial;

        const matchAnyLabel = JE.t('jellyseerr_discover_filter_match_any');
        const matchAllLabel = JE.t('jellyseerr_discover_filter_match_all');
        const matchTitle = JE.t('jellyseerr_discover_filter_match_title');

        const labelSpan = document.createElement('span');
        labelSpan.className = 'je-filter-mode-label';
        labelSpan.textContent = matchTitle;
        wrapper.appendChild(labelSpan);

        const buttons = [
            { mode: 'any', label: matchAnyLabel },
            { mode: 'all', label: matchAllLabel }
        ];
        buttons.forEach(b => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'je-filter-mode-btn';
            btn.dataset.mode = b.mode;
            btn.setAttribute('aria-pressed', initial === b.mode ? 'true' : 'false');
            btn.textContent = b.label;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                wrapper.dataset.value = b.mode;
                wrapper.querySelectorAll('.je-filter-mode-btn').forEach(x => {
                    x.setAttribute('aria-pressed', x.dataset.mode === b.mode ? 'true' : 'false');
                });
            });
            wrapper.appendChild(btn);
        });

        wrapper._reset = () => {
            wrapper.dataset.value = 'any';
            wrapper.querySelectorAll('.je-filter-mode-btn').forEach(x => {
                x.setAttribute('aria-pressed', x.dataset.mode === 'any' ? 'true' : 'false');
            });
        };

        return wrapper;
    }

    /**
     * Renders an in-container "no results match this filter" message.
     * Called by each section when an Apply yields zero items.
     * @param {HTMLElement} container - The items container to populate
     */
    function renderNoFilterResults(container) {
        if (!container) return;
        const wrap = document.createElement('div');
        wrap.className = 'je-filter-empty-msg';
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'filter_alt_off';
        const text = document.createElement('span');
        text.textContent = JE.t('jellyseerr_discover_no_filter_results');
        wrap.append(icon, text);
        container.appendChild(wrap);
    }

    /**
     * Removes any previously-rendered "no results" message from the container.
     * @param {HTMLElement} container
     */
    function clearNoFilterResults(container) {
        if (!container) return;
        container.querySelectorAll('.je-filter-empty-msg').forEach(el => el.remove());
    }

    /**
     * Builds the en/em-dash separator used between range inputs.
     * @returns {HTMLSpanElement}
     */
    function buildRangeSeparator() {
        const sep = document.createElement('span');
        sep.className = 'je-filter-range__sep';
        sep.textContent = '–';
        return sep;
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

        // Toggle button — chrome lives in the stylesheet
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'jellyseerr-filter-toggle-btn';
        toggle.setAttribute('aria-expanded', 'false');

        const tuneIcon = document.createElement('span');
        tuneIcon.className = 'material-icons';
        tuneIcon.setAttribute('aria-hidden', 'true');
        tuneIcon.textContent = 'tune';
        tuneIcon.style.fontSize = '1.05em';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = filtersLabel;

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'filter-count-badge';

        const arrowSpan = document.createElement('span');
        arrowSpan.className = 'material-icons toggle-arrow';
        arrowSpan.setAttribute('aria-hidden', 'true');
        arrowSpan.textContent = 'expand_more';

        toggle.append(tuneIcon, labelSpan, badgeSpan, arrowSpan);

        // Panel — display/hide is driven by data-state attribute (CSS rule)
        const panel = document.createElement('div');
        panel.className = 'jellyseerr-discovery-filter-panel';
        panel.dataset.state = 'closed';
        panel.hidden = true;

        // Inner grid that holds all filter groups
        const grid = document.createElement('div');
        grid.className = 'je-filter-grid';
        panel.appendChild(grid);

        const current = getAdvancedFilters(moduleName);
        const inputs = {};

        if (supportedFilters.includes('year')) {
            // Year range covers earliest TMDB-tracked cinema (1874) through reasonable
            // future-release dates. TMDB itself doesn't enforce hard year bounds.
            const fromInput = buildNumberInput({
                placeholder: fromPlaceholder, min: 1874, max: 2100,
                value: current.yearFrom
            });
            const toInput = buildNumberInput({
                placeholder: toPlaceholder, min: 1874, max: 2100,
                value: current.yearTo
            });
            grid.appendChild(makeFieldGroup(yearLabel, [fromInput, buildRangeSeparator(), toInput]));
            inputs.yearFrom = fromInput;
            inputs.yearTo = toInput;
        }

        if (supportedFilters.includes('rating')) {
            const minInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 10, step: '0.1',
                value: current.minRating
            });
            const maxInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 10, step: '0.1',
                value: current.maxRating
            });
            grid.appendChild(makeFieldGroup(ratingLabel, [minInput, buildRangeSeparator(), maxInput]));
            inputs.minRating = minInput;
            inputs.maxRating = maxInput;
        }

        if (supportedFilters.includes('votes')) {
            // Vote count caps at 1,000,000 — far above the most-voted TMDB title (~50k)
            // but generous enough to never clamp a realistic input.
            const minInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 1000000,
                value: current.minVotes
            });
            const maxInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 1000000,
                value: current.maxVotes
            });
            grid.appendChild(makeFieldGroup(votesLabel, [minInput, buildRangeSeparator(), maxInput]));
            inputs.minVotes = minInput;
            inputs.maxVotes = maxInput;
        }

        if (supportedFilters.includes('runtime')) {
            // Runtime range capped at 1000 minutes (~16 hours) to accommodate
            // unusually long experimental films (Sátántangó: 432 min, etc).
            const fromInput = buildNumberInput({
                placeholder: minPlaceholder, min: 0, max: 1000,
                value: current.runtimeFrom
            });
            const toInput = buildNumberInput({
                placeholder: maxPlaceholder, min: 0, max: 1000,
                value: current.runtimeTo
            });
            grid.appendChild(makeFieldGroup(runtimeLabel, [fromInput, buildRangeSeparator(), toInput]));
            inputs.runtimeFrom = fromInput;
            inputs.runtimeTo = toInput;
        }

        if (supportedFilters.includes('language')) {
            const select = buildSelect(LANGUAGE_OPTIONS, current.originalLanguage);
            grid.appendChild(makeFieldGroup(languageLabel, select));
            inputs.originalLanguage = select;
        }

        if (supportedFilters.includes('genre')) {
            const genreContainer = buildGenreSelector(current.genres);
            const modeToggle = buildGenreModeToggle(current.genresMode);
            grid.appendChild(makeFieldGroup(genresLabel, genreContainer, {
                fullWidth: true,
                headerExtra: modeToggle
            }));
            inputs.genres = genreContainer;
            inputs.genresMode = modeToggle;
        }

        // Action row
        const actions = document.createElement('div');
        actions.className = 'je-filter-actions';

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'je-filter-action-btn je-filter-action-btn--reset';
        resetBtn.textContent = resetLabel;

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        // Combine Jellyfin's themed `.button-submit` (every theme styles it) with
        // a layout class for our compact panel padding.
        applyBtn.className = 'button-submit je-filter-action-btn je-filter-action-btn--apply';
        applyBtn.textContent = applyLabel;

        actions.append(resetBtn, applyBtn);
        panel.appendChild(actions);

        function readInputs() {
            const out = {};
            Object.entries(inputs).forEach(([k, el]) => {
                let v;
                if (k === 'genres' || k === 'genresMode') {
                    // These widgets store their value on dataset.value
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
                badgeSpan.style.display = 'inline-flex';
            } else {
                badgeSpan.style.display = 'none';
            }
        }

        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = panel.dataset.state === 'open';
            panel.dataset.state = isOpen ? 'closed' : 'open';
            panel.hidden = isOpen;
            toggle.setAttribute('aria-expanded', String(!isOpen));
        });

        resetBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            Object.entries(inputs).forEach(([k, el]) => {
                if ((k === 'genres' || k === 'genresMode') && typeof el._reset === 'function') {
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
            // Bounds match the input field max attributes — see `<input>` setup above.
            if ('yearFrom' in next) next.yearFrom = clampInt(next.yearFrom, 1874, 2100);
            if ('yearTo' in next) next.yearTo = clampInt(next.yearTo, 1874, 2100);
            if ('runtimeFrom' in next) next.runtimeFrom = clampInt(next.runtimeFrom, 0, 1000);
            if ('runtimeTo' in next) next.runtimeTo = clampInt(next.runtimeTo, 0, 1000);
            if ('minRating' in next) next.minRating = clampFloat(next.minRating, 0, 10, 1);
            if ('maxRating' in next) next.maxRating = clampFloat(next.maxRating, 0, 10, 1);
            if ('minVotes' in next) next.minVotes = clampInt(next.minVotes, 0, 1000000);
            if ('maxVotes' in next) next.maxVotes = clampInt(next.maxVotes, 0, 1000000);

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
        container.setAttribute('role', 'group');

        const allLabel = JE.t('jellyseerr_discover_all');
        const moviesLabel = JE.t('jellyseerr_card_badge_movie');
        const seriesLabel = JE.t('jellyseerr_card_badge_series');

        const buttons = [
            { mode: FILTER_MODES.MIXED, label: allLabel },
            { mode: FILTER_MODES.MOVIES, label: moviesLabel },
            { mode: FILTER_MODES.TV, label: seriesLabel }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'jellyseerr-filter-btn';
            button.setAttribute('data-mode', btn.mode);
            button.setAttribute('aria-pressed', currentMode === btn.mode ? 'true' : 'false');
            button.textContent = btn.label;

            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const newMode = btn.mode;
                if (newMode === getFilterMode(moduleName)) return;

                setFilterMode(moduleName, newMode);

                // Reflect new mode via aria-pressed; CSS handles the visual swap
                container.querySelectorAll('.jellyseerr-filter-btn').forEach(b => {
                    b.setAttribute('aria-pressed',
                        b.getAttribute('data-mode') === newMode ? 'true' : 'false');
                });

                if (onFilterChange) onFilterChange(newMode);
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

        const label = document.createElement('span');
        label.className = 'je-sort-label';
        label.textContent = 'Sort:';
        container.appendChild(label);

        const select = document.createElement('select');
        select.className = 'jellyseerr-sort-select';

        SORT_OPTIONS.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
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

        const header = document.createElement('div');
        header.className = 'jellyseerr-discovery-header';

        const titleElement = document.createElement('h2');
        titleElement.className = 'sectionTitle sectionTitle-cards';
        titleElement.textContent = title;
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
     * Injects the discovery filter stylesheet (theme-aware via CSS vars).
     * One <style> tag per page; all filter UI references the class names below
     * so the inline JS keeps no rgba/colour values.
     */
    function injectFilterStyles() {
        if (document.getElementById('jellyseerr-filter-styles')) return;

        const style = document.createElement('style');
        style.id = 'jellyseerr-filter-styles';
        style.textContent = `
            /* Media-type quick filter (existing) */
            .filter-movies [data-media-type="tv"] { display: none !important; }
            .filter-tv [data-media-type="movie"] { display: none !important; }

            /* === Section header === */
            .jellyseerr-discovery-header-wrapper {
                display: flex;
                flex-direction: column;
                gap: 0.55em;
                margin-bottom: 1.1em;
                width: 100%;
            }
            .jellyseerr-discovery-header {
                display: flex;
                align-items: center;
                gap: 0.7em 1em;
                flex-wrap: wrap;
                width: 100%;
            }
            .jellyseerr-discovery-header h2.sectionTitle {
                margin: 0 !important;
                flex-shrink: 1;
            }

            /* === All / Movies / Series segmented control === */
            .jellyseerr-discovery-filter {
                display: inline-flex;
                gap: 0;
                font-size: 0.85em;
                vertical-align: middle;
                flex-shrink: 0;
            }
            .jellyseerr-filter-btn {
                padding: 0.35em 0.95em;
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.35));
                background: transparent;
                color: var(--theme-text-color, inherit);
                cursor: pointer;
                font-size: inherit;
                font-family: inherit;
                line-height: 1.3;
                transition: background 0.15s, border-color 0.15s, color 0.15s;
                opacity: 0.85;
            }
            .jellyseerr-filter-btn:not(:first-child) { margin-left: -1px; }
            .jellyseerr-filter-btn:first-child { border-radius: 4px 0 0 4px; }
            .jellyseerr-filter-btn:last-child { border-radius: 0 4px 4px 0; }
            .jellyseerr-filter-btn:hover { background: var(--je-hover-bg, rgba(127,127,127,0.12)); opacity: 1; }
            .jellyseerr-filter-btn[aria-pressed="true"] {
                background: var(--theme-primary-color, #00a4dc);
                border-color: var(--theme-primary-color, #00a4dc);
                color: var(--theme-accent-text-color, #fff);
                font-weight: 600;
                opacity: 1;
            }

            /* === Sort dropdown === */
            .jellyseerr-discovery-sort {
                display: inline-flex;
                align-items: center;
                gap: 0.45em;
                font-size: 0.85em;
                margin-left: auto;
                flex-shrink: 0;
            }
            .jellyseerr-discovery-sort > .je-sort-label {
                color: var(--theme-text-color, inherit);
                opacity: 0.6;
            }
            .jellyseerr-sort-select {
                background: var(--je-input-bg, rgba(127,127,127,0.1));
                color: var(--theme-text-color, inherit);
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.35));
                border-radius: 4px;
                padding: 0.35em 0.7em;
                font-size: inherit;
                font-family: inherit;
                cursor: pointer;
                outline: none;
            }
            .jellyseerr-sort-select:focus { border-color: var(--theme-primary-color, #00a4dc); }
            .jellyseerr-sort-select option { background: var(--background-color, #1a1a2e); color: var(--theme-text-color, #fff); }

            /* === Filters toggle button === */
            .jellyseerr-filter-toggle-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.45em;
                padding: 0.4em 0.9em;
                border-radius: 4px;
                background: var(--je-input-bg, rgba(127,127,127,0.08));
                color: var(--theme-text-color, inherit);
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.35));
                cursor: pointer;
                font-size: 0.85em;
                font-family: inherit;
                line-height: 1.3;
                transition: background 0.15s, border-color 0.15s;
            }
            .jellyseerr-filter-toggle-btn:hover { background: var(--je-hover-bg, rgba(127,127,127,0.16)); }
            .jellyseerr-filter-toggle-btn[aria-expanded="true"] {
                background: var(--je-hover-bg, rgba(127,127,127,0.18));
                border-color: var(--je-border-color-strong, rgba(127,127,127,0.55));
            }
            .jellyseerr-filter-toggle-btn .filter-count-badge {
                display: none;
                background: var(--theme-primary-color, #00a4dc);
                color: var(--theme-accent-text-color, #fff);
                border-radius: 999px;
                padding: 0.05em 0.55em;
                font-size: 0.78em;
                font-weight: 600;
                line-height: 1.4;
                min-width: 1.5em;
                text-align: center;
            }
            .jellyseerr-filter-toggle-btn .toggle-arrow {
                font-size: 1.15em;
                transition: transform 0.2s;
                opacity: 0.75;
            }
            .jellyseerr-filter-toggle-btn[aria-expanded="true"] .toggle-arrow { transform: rotate(180deg); }

            /* === Filter panel === */
            .jellyseerr-discovery-filter-panel {
                display: none;
                width: 100%;
                padding: 1.2em 1.4em;
                background: var(--je-panel-bg, rgba(127,127,127,0.07));
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.22));
                border-radius: 8px;
                box-sizing: border-box;
                animation: je-filter-fade-in 0.18s ease-out;
            }
            .jellyseerr-discovery-filter-panel[data-state="open"] { display: block; }
            @keyframes je-filter-fade-in {
                from { opacity: 0; transform: translateY(-4px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            /* === Filter grid === */
            .je-filter-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                gap: 1.05em 1.3em;
                align-items: start;
            }
            .je-filter-group {
                display: flex;
                flex-direction: column;
                gap: 0.35em;
                min-width: 0;
            }
            .je-filter-group--full { grid-column: 1 / -1; }
            .je-filter-label {
                font-size: 0.78em;
                font-weight: 600;
                color: var(--theme-text-color, inherit);
                opacity: 0.75;
                text-transform: uppercase;
                letter-spacing: 0.045em;
            }

            /* Group header (label + extra widget on the right) */
            .je-filter-group-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.7em;
                flex-wrap: wrap;
            }

            /* AND / OR mode toggle */
            .je-filter-mode-toggle {
                display: inline-flex;
                align-items: center;
                gap: 0.4em;
                font-size: 0.78em;
            }
            .je-filter-mode-toggle .je-filter-mode-label {
                color: var(--theme-text-color, inherit);
                opacity: 0.55;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                font-weight: 500;
            }
            .je-filter-mode-btn {
                padding: 0.32em 0.85em;
                background: transparent;
                color: var(--theme-text-color, inherit);
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.4));
                cursor: pointer;
                font-family: inherit;
                font-size: inherit;
                line-height: 1.3;
                opacity: 0.78;
                transition: background 0.15s, opacity 0.15s, color 0.15s, border-color 0.15s;
            }
            .je-filter-mode-btn + .je-filter-mode-btn { margin-left: -1px; }
            .je-filter-mode-btn:first-of-type { border-radius: 4px 0 0 4px; }
            .je-filter-mode-btn:last-of-type { border-radius: 0 4px 4px 0; }
            .je-filter-mode-btn:hover {
                background: var(--je-hover-bg, rgba(127,127,127,0.12));
                opacity: 1;
            }
            .je-filter-mode-btn[aria-pressed="true"] {
                background: var(--theme-primary-color, #00a4dc);
                border-color: var(--theme-primary-color, #00a4dc);
                color: var(--theme-accent-text-color, #fff);
                opacity: 1;
                font-weight: 600;
            }

            /* No-results message inside an items container */
            .je-filter-empty-msg {
                grid-column: 1 / -1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 0.6em;
                padding: 2.5em 1em;
                color: var(--theme-text-color, inherit);
                opacity: 0.55;
                font-size: 0.95em;
                text-align: center;
                width: 100%;
            }
            .je-filter-empty-msg .material-icons { font-size: 2.4em; opacity: 0.7; }

            /* === Range row === */
            .je-filter-range {
                display: flex;
                align-items: center;
                gap: 0.45em;
            }
            .je-filter-range > input { flex: 1 1 0; min-width: 0; }
            .je-filter-range > .je-filter-range__sep {
                color: var(--theme-text-color, inherit);
                opacity: 0.4;
                user-select: none;
            }

            /* === Number / select inputs === */
            .je-filter-input {
                background: var(--je-input-bg, rgba(127,127,127,0.1));
                color: var(--theme-text-color, inherit);
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.35));
                border-radius: 4px;
                padding: 0.4em 0.6em;
                font-size: inherit;
                font-family: inherit;
                outline: none;
                width: 100%;
                box-sizing: border-box;
                transition: border-color 0.15s, box-shadow 0.15s;
            }
            .je-filter-input:hover { border-color: var(--je-border-color-strong, rgba(127,127,127,0.55)); }
            .je-filter-input:focus {
                border-color: var(--theme-primary-color, #00a4dc);
                box-shadow: 0 0 0 1px var(--theme-primary-color, #00a4dc);
            }
            .je-filter-input::placeholder {
                color: var(--theme-text-color, inherit);
                opacity: 0.4;
            }
            select.je-filter-input { cursor: pointer; }
            select.je-filter-input option {
                background: var(--background-color, #1a1a2e);
                color: var(--theme-text-color, #fff);
            }

            /* === Genre selector === */
            .jellyseerr-discovery-genre-selector {
                display: flex;
                flex-wrap: wrap;
                gap: 0.45em;
                max-height: 14em;
                overflow-y: auto;
                padding: 0.35em 0.1em;
                align-content: flex-start;
                border-radius: 4px;
                scrollbar-width: thin;
            }
            .je-filter-genre-tag {
                padding: 0.42em 0.95em;
                border: 1px solid var(--je-border-color, rgba(127,127,127,0.4));
                border-radius: 999px;
                background: transparent;
                color: var(--theme-text-color, inherit);
                font-size: 0.83em;
                font-family: inherit;
                cursor: pointer;
                transition: background 0.15s, border-color 0.15s, color 0.15s;
                line-height: 1.2;
                white-space: nowrap;
            }
            .je-filter-genre-tag:hover {
                background: var(--je-hover-bg, rgba(127,127,127,0.12));
                border-color: var(--je-border-color-strong, rgba(127,127,127,0.6));
            }
            .je-filter-genre-tag[aria-pressed="true"] {
                background: var(--theme-primary-color, #00a4dc);
                border-color: var(--theme-primary-color, #00a4dc);
                color: var(--theme-accent-text-color, #fff);
                font-weight: 500;
            }
            .je-filter-genre-tag[aria-pressed="true"]:hover { filter: brightness(1.08); }
            .je-filter-genre-empty {
                color: var(--theme-text-color, inherit);
                opacity: 0.5;
                font-size: 0.85em;
                padding: 0.3em 0;
            }

            /* === Action buttons === */
            .je-filter-actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.6em;
                margin-top: 1.2em;
                padding-top: 1em;
                border-top: 1px solid var(--je-divider-color, rgba(127,127,127,0.18));
            }
            .je-filter-action-btn {
                padding: 0.55em 1.4em;
                border-radius: 4px;
                cursor: pointer;
                font-size: 0.88em;
                font-family: inherit;
                font-weight: 500;
                border: 1px solid transparent;
                transition: background 0.15s, border-color 0.15s, filter 0.15s;
                line-height: 1.3;
            }
            .je-filter-action-btn--reset {
                background: transparent;
                color: var(--theme-text-color, inherit);
                border-color: var(--je-border-color, rgba(127,127,127,0.4));
                opacity: 0.85;
            }
            .je-filter-action-btn--reset:hover {
                background: var(--je-hover-bg, rgba(127,127,127,0.12));
                border-color: var(--je-border-color-strong, rgba(127,127,127,0.65));
                opacity: 1;
            }
            /* Apply uses Jellyfin's .button-submit class so each theme's accent
               styling kicks in. Keep these as fallbacks (and to override the
               full-width default that .button-submit gets in some themes). */
            .je-filter-action-btn--apply {
                background: var(--theme-primary-color, #00a4dc);
                color: var(--theme-accent-text-color, #fff);
                border-color: var(--theme-primary-color, #00a4dc);
                font-weight: 600;
                width: auto;
                min-width: 5em;
                margin: 0;
                text-transform: none;
                letter-spacing: normal;
            }
            .je-filter-action-btn--apply:hover { filter: brightness(1.08); }
            .je-filter-action-btn:focus-visible {
                outline: 2px solid var(--theme-primary-color, #00a4dc);
                outline-offset: 2px;
            }

            /* === Tighten on narrow viewports === */
            @media (max-width: 600px) {
                .jellyseerr-discovery-filter-panel { padding: 0.95em 1em; }
                .je-filter-grid { gap: 0.85em 0.9em; grid-template-columns: 1fr; }
                .je-filter-actions { flex-direction: column-reverse; align-items: stretch; }
                .je-filter-action-btn { width: 100%; }
                .jellyseerr-discovery-sort { margin-left: 0; }
            }
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
        renderNoFilterResults,
        clearNoFilterResults,
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
