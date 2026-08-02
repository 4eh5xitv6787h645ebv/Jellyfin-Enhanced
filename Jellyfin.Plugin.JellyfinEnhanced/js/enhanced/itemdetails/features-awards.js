/**
 * @file Awards banner and breakdown for movie and series detail pages.
 *
 * Renders a single-line banner ("AWARDS — 7 Wins | 6 Nominations") that expands
 * into the full list of wins and nominations grouped by award body. All data
 * comes from the plugin's own /JellyfinEnhanced/awards endpoint, which resolves
 * it server-side and caches it on disk, so repeat views cost one local request.
 */
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const internal = JE.internals.awards = JE.internals.awards || {};

    const LOG_PREFIX = '🪼 Jellyfin Enhanced: Awards:';
    const STYLE_ID = 'je-awards-styles';
    const BANNER_CLASS = 'je-awards';

    /** Item types the server will answer for; anything else is skipped without a request. */
    const SUPPORTED_TYPES = ['Movie', 'Series'];

    /**
     * Per-item results for this page session, stored as { value, until }.
     * The server already caches to disk; this only stops repeat renders of the
     * same detail page (which the mutation observer triggers often) from issuing
     * duplicate HTTP requests.
     * @type {Map<string, {value: object|null, until: number}>}
     */
    const sessionCache = new Map();

    /**
     * How long a definitive answer is memoised in this page session.
     * Long enough to absorb the observer's repeat renders, short enough that a
     * long-lived tab still picks up a server-side refresh.
     */
    const SESSION_TTL_MS = 10 * 60 * 1000;

    /**
     * How long a failed lookup is memoised. Deliberately brief: the server never
     * caches a failure precisely so the next view retries, and memoising it here
     * for the whole session would defeat that. Not zero, or the debounced observer
     * would re-request on every pass while the user sits on a broken page.
     */
    const SESSION_FAILURE_TTL_MS = 30 * 1000;

    /** Caps the session map so a long browsing session cannot grow it without bound. */
    const SESSION_MAX_ENTRIES = 200;

    /**
     * Reads a live session-cache entry.
     * @param {string} itemId The Jellyfin item id.
     * @returns {{value: object|null}|undefined} The entry, or undefined when absent or expired.
     */
    function readSession(itemId) {
        const entry = sessionCache.get(itemId);
        if (!entry) {
            return undefined;
        }

        if (entry.until <= Date.now()) {
            sessionCache.delete(itemId);
            return undefined;
        }

        return entry;
    }

    /**
     * Memoises a lookup result for this page session.
     * @param {string} itemId The Jellyfin item id.
     * @param {object|null} value The record, or null when the lookup produced nothing.
     * @param {boolean} definitive False for a transient failure, which gets a short TTL.
     */
    function writeSession(itemId, value, definitive) {
        if (sessionCache.size >= SESSION_MAX_ENTRIES) {
            // Oldest insertion first — Map preserves insertion order.
            const oldest = sessionCache.keys().next();
            if (!oldest.done) {
                sessionCache.delete(oldest.value);
            }
        }

        sessionCache.set(itemId, {
            value,
            until: Date.now() + (definitive ? SESSION_TTL_MS : SESSION_FAILURE_TTL_MS)
        });
    }

    /** Item ids with a request in flight, so the observer cannot fan out. */
    const inFlight = new Set();

    /**
     * Resolves an effective boolean setting: explicit user choice wins, then the
     * admin default from the plugin config, then the hardcoded fallback.
     * @param {string} userKey camelCase key in JE.currentSettings.
     * @param {string} adminKey PascalCase key in JE.pluginConfig.
     * @param {boolean} fallback Value when neither is set.
     * @returns {boolean}
     */
    JE.resolveAwardsSetting = function (userKey, adminKey, fallback) {
        const userValue = JE?.currentSettings?.[userKey];
        if (userValue === true || userValue === false) {
            return userValue;
        }

        const adminValue = JE?.pluginConfig?.[adminKey];
        if (adminValue === true || adminValue === false) {
            return adminValue;
        }

        return fallback;
    };

    const resolveSetting = JE.resolveAwardsSetting;

    /** The presentations a user or admin can pick between. */
    const AWARD_STYLES = ['native', 'tmdb'];

    /**
     * Which presentation to draw: the user's own choice when they have made one,
     * otherwise the admin default, otherwise native.
     * @returns {'native'|'tmdb'}
     */
    function awardsStyle() {
        const userValue = JE?.currentSettings?.awardsStyle;
        if (AWARD_STYLES.includes(userValue)) {
            return userValue;
        }

        const adminValue = JE?.pluginConfig?.AwardsStyle;
        return AWARD_STYLES.includes(adminValue) ? adminValue : 'native';
    }

    JE.resolveAwardsStyle = awardsStyle;

    /**
     * English text used when a translation key cannot be resolved.
     * @type {Object<string, string>}
     */
    const FALLBACK_STRINGS = {
        awards_title: 'Awards',
        awards_win: 'Win',
        awards_wins: 'Wins',
        awards_nomination: 'Nomination',
        awards_nominations: 'Nominations',
        awards_winner: 'Winner',
        awards_nominee: 'Nominee',
        awards_lead_won: 'Won {count} {award}',
        awards_lead_nominated: 'Nominated for {count} {award}',
        awards_group_other: 'Other awards',
        awards_no_details: 'No detailed award breakdown is available for this title.',
        awards_source: 'Data from {sources}',
        awards_refresh: 'Refresh',
        awards_refreshing: 'Refreshing…',
        awards_refresh_failed: 'Could not refresh',
        awards_about: 'Read about {award}'
    };

    /** Keys already warned about, so a re-render does not spam the console. */
    const warnedKeys = new Set();

    /**
     * Translates a key, falling back to bundled English when the key is missing.
     *
     * JE.t returns the key itself on a miss, and the translation loader can end up
     * serving a locale file from a build that predates these keys — in which case
     * an unguarded JE.t would render the literal string "awards_title" to users.
     * @param {string} key Translation key.
     * @param {Object<string, string|number>} [params] Placeholder values.
     * @returns {string}
     */
    function t(key, params) {
        let result;
        try {
            result = JE.t(key, params);
        } catch (error) {
            result = null;
        }

        if (!result || result === key) {
            if (!warnedKeys.has(key)) {
                warnedKeys.add(key);
                console.warn(`${LOG_PREFIX} missing translation '${key}', using the English fallback.`);
            }
            result = FALLBACK_STRINGS[key] || key;
        }

        if (params) {
            for (const [name, value] of Object.entries(params)) {
                // Replacement function, not a string: a literal replacement would
                // treat $&, $1 etc. in the value as backreferences.
                result = result.replace(new RegExp(`\\{${name}\\}`, 'g'), () => String(value));
            }
        }

        return result;
    }

    /**
     * Accepts only http(s) URLs, so a javascript: or data: value coming back from
     * an upstream source can never become a live href.
     * @param {string} [url] Candidate URL.
     * @returns {boolean}
     */
    function isSafeHttpUrl(url) {
        if (typeof url !== 'string' || !url) {
            return false;
        }
        try {
            const parsed = new URL(url, window.location.origin);
            return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch (error) {
            return false;
        }
    }

    /**
     * Fetches the awards record for an item.
     * @param {string} itemId The Jellyfin item id.
     * @param {boolean} [refresh] Ask the server to bypass its cache.
     * @returns {Promise<object|null>} The record, or null when there is nothing to show.
     */
    async function fetchAwards(itemId, refresh) {
        const query = refresh ? '?refresh=true' : '';
        const url = ApiClient.getUrl(`/JellyfinEnhanced/awards/${itemId}${query}`);

        try {
            const response = await fetch(url, {
                headers: {
                    // Jellyfin 12 authenticates from the Authorization header; the
                    // legacy X-Emby-Token is kept for 10.11 back-compat.
                    'Authorization': `MediaBrowser Token="${ApiClient.accessToken()}"`,
                    'X-Emby-Token': ApiClient.accessToken()
                }
            });

            // 204 means the feature is off, the type is unsupported, or the item
            // has no provider id — all "render nothing", not an error.
            if (response.status === 204) {
                return null;
            }

            if (!response.ok) {
                console.warn(`${LOG_PREFIX} request failed with ${response.status}.`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.warn(`${LOG_PREFIX} could not load awards.`, error);
            return null;
        }
    }

    /**
     * Formats a count with its singular or plural label.
     * @param {number} count The count.
     * @param {string} singularKey Translation key for one.
     * @param {string} pluralKey Translation key for zero or many.
     * @returns {string}
     */
    function countLabel(count, singularKey, pluralKey) {
        const label = t(count === 1 ? singularKey : pluralKey);
        return `${count} ${label}`.trim();
    }

    /**
     * Builds the one-line summary shown in the banner, e.g. "7 Wins | 6 Nominations".
     * @param {object} summary The summary object from the server.
     * @returns {string} HTML for the counts region.
     */
    function renderCounts(summary) {
        const escapeHtml = JE.escapeHtml;
        const parts = [];

        // The native style borrows mediaInfoItem so the counts sit in the same
        // rhythm as the year/runtime row; the TMDB style uses its own spans with a
        // rule between them, matching the banner it is modelled on.
        const native = awardsStyle() === 'native';

        if (summary.wins > 0) {
            const text = escapeHtml(countLabel(summary.wins, 'awards_win', 'awards_wins'));
            parts.push(native
                ? `<div class="mediaInfoItem je-awards-wins">${text}</div>`
                : `<span class="je-awards-count je-awards-wins">${text}</span>`);
        }

        if (summary.nominations > 0) {
            const text = escapeHtml(countLabel(summary.nominations, 'awards_nomination', 'awards_nominations'));
            parts.push(native
                ? `<div class="mediaInfoItem">${text}</div>`
                : `<span class="je-awards-count">${text}</span>`);
        }

        return parts.join(native ? '' : '<span class="je-awards-divider" aria-hidden="true"></span>');
    }

    /**
     * Builds the headline-award chip, e.g. "Won 1 Oscar", when the source called one out.
     * @param {object} summary The summary object from the server.
     * @returns {string} HTML for the chip, or an empty string.
     */
    function renderLeadAward(summary) {
        if (!summary.leadAward || !summary.leadCount) {
            return '';
        }

        const key = summary.leadVerb === 'Won' ? 'awards_lead_won' : 'awards_lead_nominated';
        const text = t(key, { count: summary.leadCount, award: summary.leadAward });

        // mediaInfoOfficialRating is the client's own bordered mini-chip, used for
        // the age rating in the row above — the closest native match for a badge.
        return awardsStyle() === 'native'
            ? `<div class="mediaInfoItem mediaInfoText mediaInfoOfficialRating je-awards-lead">${JE.escapeHtml(text)}</div>`
            : `<span class="je-awards-lead">${JE.escapeHtml(text)}</span>`;
    }

    /**
     * Groups entries by award body, preserving the server's ordering within each group.
     * @param {Array<object>} entries Award entries.
     * @returns {Array<{name: string, entries: Array<object>}>}
     */
    /**
     * Award bodies that lead the list regardless of how many entries they have.
     * Without this, a title with one Oscar and four festival prizes would bury the
     * Oscar below the festivals, which is the opposite of what people look for.
     * Matched case-insensitively against the start of the group name, so
     * "Academy Awards" and "Academy Award" both hit the same rank.
     */
    const GROUP_PRIORITY = [
        'academy award',
        'primetime emmy',
        'emmy',
        'golden globe',
        'british academy',
        'bafta',
        'screen actors guild',
        'actor awards',
        'directors guild',
        'writers guild',
        'producers guild',
        'critics'
    ];

    /**
     * Rank of a group name in {@link GROUP_PRIORITY}, or a large number when unlisted.
     * @param {string} name Group name.
     * @returns {number}
     */
    function groupRank(name) {
        const lower = (name || '').toLowerCase();
        const index = GROUP_PRIORITY.findIndex(prefix => lower.startsWith(prefix));
        return index === -1 ? GROUP_PRIORITY.length : index;
    }

    function groupEntries(entries) {
        const groups = new Map();

        for (const entry of entries) {
            const name = entry.group || t('awards_group_other');
            if (!groups.has(name)) {
                groups.set(name, []);
            }
            groups.get(name).push(entry);
        }

        // Major bodies first, then the rest by size, with the name as a stable
        // tiebreaker rather than Map insertion order.
        return Array.from(groups.entries())
            .map(([name, groupRows]) => ({ name, entries: groupRows }))
            .sort((a, b) =>
                groupRank(a.name) - groupRank(b.name)
                || b.entries.length - a.entries.length
                || a.name.localeCompare(b.name));
    }

    /**
     * Renders the expanded breakdown.
     * @param {object} record The full awards record.
     * @returns {string} HTML for the panel body.
     */
    function renderDetails(record) {
        const escapeHtml = JE.escapeHtml;
        const sections = [];

        for (const group of groupEntries(record.entries || [])) {
            const rows = group.entries.map(entry => {
                const statusKey = entry.isWinner ? 'awards_winner' : 'awards_nominee';
                const statusClass = entry.isWinner ? 'je-awards-is-win' : 'je-awards-is-nom';
                const occasion = entry.ceremony || (entry.year ? String(entry.year) : '');
                const people = (entry.people && entry.people.length) ? entry.people.join(', ') : '';

                // Awards with no separate category — a festival prize, "Top Ten
                // Films" — come back with the category equal to the award body, so
                // repeating it under its own heading reads as a duplicate. Promote
                // the ceremony or year to the main line in that case instead.
                const isGeneric = !entry.category || entry.category === group.name;
                const headline = isGeneric ? (occasion || group.name) : entry.category;

                const meta = [];
                if (!isGeneric && occasion) {
                    meta.push(escapeHtml(occasion));
                }
                if (people) {
                    meta.push(escapeHtml(people));
                }

                // Link the award name out to a page describing it, so a viewer can
                // find out what the award is. emby-linkbutton is what tells the
                // native app shell to open it in the system browser.
                const safeUrl = isSafeHttpUrl(entry.url) ? entry.url : '';
                const headlineHtml = safeUrl
                    ? `<a is="emby-linkbutton" class="je-awards-category je-awards-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(t('awards_about', { award: headline }))}">${escapeHtml(headline)}</a>`
                    : `<span class="je-awards-category">${escapeHtml(headline)}</span>`;

                return `
                    <li class="je-awards-row ${statusClass}">
                        <span class="material-icons je-awards-status-icon" aria-hidden="true">${entry.isWinner ? 'emoji_events' : 'radio_button_unchecked'}</span>
                        <span class="je-awards-row-body">
                            ${headlineHtml}
                            ${meta.length ? `<span class="je-awards-meta">${meta.join(' · ')}</span>` : ''}
                        </span>
                        <span class="je-awards-status-text">${escapeHtml(t(statusKey))}</span>
                    </li>`;
            }).join('');

            sections.push(`
                <div class="je-awards-group">
                    <h3 class="je-awards-group-title sectionTitle">${escapeHtml(group.name)}</h3>
                    <ul class="je-awards-list">${rows}</ul>
                </div>`);
        }

        if (!sections.length) {
            // Counts exist but no structured breakdown — say so rather than
            // showing an empty panel that reads as a bug.
            const note = record.summary?.rawText
                ? escapeHtml(record.summary.rawText)
                : escapeHtml(t('awards_no_details'));
            sections.push(`<p class="je-awards-empty">${note}</p>`);
        }

        return sections.join('') + renderAttribution(record);
    }

    /**
     * Renders the source attribution line. Wikidata is CC0 but attribution is
     * still the courteous default, and it explains why the counts and the list
     * can differ in size.
     * @param {object} record The full awards record.
     * @returns {string} HTML for the footer.
     */
    function renderAttribution(record) {
        const sources = Array.isArray(record.sources) ? record.sources : [];
        const names = [];

        if (sources.some(s => s === 'omdb-cache' || s === 'omdb-api')) {
            names.push('IMDb via OMDb');
        }

        if (sources.includes('wikidata')) {
            names.push('Wikidata');
        }

        if (!names.length) {
            return '';
        }

        const text = t('awards_source', { sources: names.join(', ') });
        return `<p class="je-awards-attribution">`
            + `<span>${JE.escapeHtml(text)}</span>`
            + `<button type="button" class="je-awards-refresh">${JE.escapeHtml(t('awards_refresh'))}</button>`
            + `</p>`;
    }

    /**
     * Wires the per-title "Refresh" control in the expanded panel.
     *
     * The scheduled task refreshes stale records on its own schedule; this is the
     * escape hatch for a title whose awards changed since it was cached (a ceremony
     * just happened) without waiting for the TTL. The server applies a per-title
     * cooldown, so holding the button down cannot generate upstream traffic.
     * @param {HTMLElement} section The banner root.
     * @param {HTMLElement} panel The expanded panel element.
     * @param {object} record The record currently rendered.
     */
    function wireRefresh(section, panel, record) {
        const button = panel.querySelector('.je-awards-refresh');
        if (!button) {
            return;
        }

        button.addEventListener('click', async () => {
            const itemId = section.dataset.itemId;
            if (!itemId || button.disabled) {
                return;
            }

            const original = button.textContent;
            button.disabled = true;
            button.textContent = t('awards_refreshing');

            const fresh = await fetchAwards(itemId, true);

            if (!fresh || !fresh.summary) {
                button.textContent = t('awards_refresh_failed');
                // Re-enable so a transient failure can be retried.
                window.setTimeout(() => {
                    button.textContent = original;
                    button.disabled = false;
                }, 3000);
                return;
            }

            writeSession(itemId, fresh, true);

            // Repaint in place rather than rebuilding the banner, so the panel stays
            // open and the page does not shift under the user.
            Object.assign(record, fresh);
            panel.innerHTML = renderDetails(record);
            wireRefresh(section, panel, record);

            const summaryEl = section.querySelector('.je-awards-summary');
            if (summaryEl) {
                summaryEl.innerHTML = renderLeadAward(record.summary) + renderCounts(record.summary);
            }
        });
    }

    /**
     * Builds the whole banner element for a record.
     * @param {object} record The awards record.
     * @param {boolean} expanded Whether the panel starts open.
     * @returns {HTMLElement}
     */
    function buildBanner(record, expanded) {
        const section = document.createElement('div');
        const style = awardsStyle();

        const hasDetails = Array.isArray(record.entries) && record.entries.length > 0;
        const summary = record.summary;

        if (style === 'native') {
            // Native detail-page section wrapper, the same one Cast & Crew and the
            // other detail sections use, so spacing and rhythm come from Jellyfin.
            section.className = `verticalSection detailVerticalSection ${BANNER_CLASS} je-awards--native`;

            // The heading row copies the client's own "section title that is also a
            // control" pattern (sectionTitleContainer > sectionTitleTextButton >
            // sectionTitle + material icon), which is what Next Up and the
            // favourites rows use. Parsed via innerHTML so emby-button upgrades.
            section.innerHTML = `
                <div class="sectionTitleContainer sectionTitleContainer-cards je-awards-head">
                    <button is="emby-button" type="button" class="button-flat button-flat-mini sectionTitleTextButton je-awards-banner" aria-expanded="${expanded ? 'true' : 'false'}">
                        <h2 class="sectionTitle sectionTitle-cards">${JE.escapeHtml(t('awards_title'))}</h2>
                        <span class="material-icons je-awards-chevron" aria-hidden="true">expand_more</span>
                    </button>
                    <div class="mediaInfoItems je-awards-summary">
                        ${renderLeadAward(summary)}
                        ${renderCounts(summary)}
                    </div>
                </div>
                <div class="je-awards-panel" ${expanded ? '' : 'hidden'}></div>`;
        } else {
            // Standalone banner modelled on TMDB's: a self-contained gradient bar
            // with a wordmark, the counts, and an expander on the right.
            section.className = `${BANNER_CLASS} je-awards--tmdb`;

            section.innerHTML = `
                <button type="button" class="je-awards-banner" aria-expanded="${expanded ? 'true' : 'false'}">
                    <span class="je-awards-mark">
                        <span class="je-awards-icon" aria-hidden="true">${JE.icon(JE.IconName.TROPHY)}</span>
                        <span class="je-awards-wordmark">${JE.escapeHtml(t('awards_title'))}</span>
                    </span>
                    <span class="je-awards-summary">
                        ${renderLeadAward(summary)}
                        ${renderCounts(summary)}
                    </span>
                    <span class="material-icons je-awards-chevron" aria-hidden="true">expand_more</span>
                </button>
                <div class="je-awards-panel" ${expanded ? '' : 'hidden'}></div>`;
        }

        const button = section.querySelector('.je-awards-banner');
        const panel = section.querySelector('.je-awards-panel');

        // The panel body is only built when it is first shown, so a collapsed
        // banner costs nothing beyond the banner row itself.
        let rendered = false;
        const renderPanel = () => {
            if (!rendered) {
                panel.innerHTML = renderDetails(record);
                wireRefresh(section, panel, record);
                rendered = true;
            }
        };

        if (expanded) {
            renderPanel();
        }

        const chevron = section.querySelector('.je-awards-chevron');

        /**
         * Swaps the chevron between its two Material ligatures.
         *
         * Rotating one glyph looked correct in some renders and clipped in others;
         * using the two icons the client already ships for this is deterministic
         * and matches how Jellyfin draws its own expanders.
         * @param {boolean} open Whether the panel is open.
         */
        const setChevron = (open) => {
            if (chevron) {
                chevron.textContent = open ? 'expand_less' : 'expand_more';
            }
        };

        setChevron(expanded);

        button.addEventListener('click', () => {
            const isOpen = button.getAttribute('aria-expanded') === 'true';
            if (isOpen) {
                panel.hidden = true;
                button.setAttribute('aria-expanded', 'false');
                setChevron(false);
            } else {
                renderPanel();
                panel.hidden = false;
                button.setAttribute('aria-expanded', 'true');
                setChevron(true);
            }
        });

        if (!hasDetails && !summary?.rawText) {
            // Nothing to open — present it as static text instead of a dead control.
            button.setAttribute('aria-expanded', 'false');
            button.disabled = true;
            section.classList.add('je-awards-static');
        }

        return section;
    }

    /**
     * Finds the element the banner should be inserted after.
     * @param {HTMLElement} page The visible detail page.
     * @returns {HTMLElement|null}
     */
    function findAnchor(page) {
        // Everything here lives inside .detailSectionContent, which the details
        // controller builds once and never rebuilds — unlike the .itemMiscInfo
        // ribbon, whose innerHTML is replaced when item data lands and would take
        // the banner with it. The chain mirrors the one the reviews section uses,
        // so the banner sits in the same place whether or not Elsewhere is on.
        return page.querySelector('.streaming-lookup-container')
            || page.querySelector('.itemExternalLinks')
            || page.querySelector('.overview')
            || page.querySelector('.tagline');
    }

    /**
     * Returns the detail page the user is actually looking at.
     * @returns {HTMLElement|null}
     */
    function visibleDetailPage() {
        // Jellyfin keeps up to three cached views alive, all carrying
        // id="itemDetailPage" (measured: 3 coexist after browsing three titles).
        // Selecting by attribute and filtering is unambiguous about which one is
        // live, where an id selector relies on the engine evaluating the whole
        // compound rather than shortcutting to the first getElementById hit.
        return Array.prototype.find.call(
            document.querySelectorAll('[id="itemDetailPage"]'),
            candidate => !candidate.classList.contains('hide')
        ) || null;
    }

    /**
     * Fetches and renders the banner for one detail page, if it is not there already.
     * @param {string} itemId The Jellyfin item id.
     * @param {string} itemType The Jellyfin item type.
     * @param {HTMLElement} page The visible detail page element.
     */
    async function renderForItem(itemId, itemType, page) {
        if (!SUPPORTED_TYPES.includes(itemType)) {
            return;
        }

        if (!resolveSetting('showAwards', 'AwardsShowBanner', true)) {
            return;
        }

        // Already rendered for this item; the observer fires many times per page.
        const existing = page.querySelector('.' + BANNER_CLASS);
        if (existing && existing.dataset.itemId === itemId) {
            return;
        }

        const cached = readSession(itemId);
        let record = cached ? cached.value : undefined;

        if (record === undefined) {
            if (inFlight.has(itemId)) {
                return;
            }

            inFlight.add(itemId);
            try {
                record = await fetchAwards(itemId, false);
                // A record the server stamped with no fetchedUtc is its
                // "the lookup failed, retry next time" sentinel, and a null is a
                // transport error. Neither is a definitive answer, so neither is
                // memoised for long.
                const definitive = record !== null && !!record.fetchedUtc;
                writeSession(itemId, record, definitive);
            } finally {
                inFlight.delete(itemId);
            }
        }

        if (!record || record.noAwards || !record.summary) {
            return;
        }

        if (!record.summary.wins && !record.summary.nominations) {
            return;
        }

        // Re-resolve the page: the fetch is asynchronous and the user may have
        // navigated on, in which case there is nothing left to attach to.
        const currentPage = visibleDetailPage();
        if (!currentPage) {
            return;
        }

        const currentId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
        if (currentId !== itemId) {
            return;
        }

        const stale = currentPage.querySelector('.' + BANNER_CLASS);
        if (stale) {
            if (stale.dataset.itemId === itemId) {
                return;
            }
            stale.remove();
        }

        const anchor = findAnchor(currentPage);
        if (!anchor || !anchor.parentNode) {
            return;
        }

        const expanded = resolveSetting('awardsExpandedByDefault', 'AwardsExpandedByDefault', false);
        const banner = buildBanner(record, expanded);
        banner.dataset.itemId = itemId;

        // Insert in a single frame with the final content already built, so the
        // page is painted once rather than growing after the fact.
        requestAnimationFrame(() => {
            if (!anchor.parentNode || currentPage.querySelector('.' + BANNER_CLASS)) {
                return;
            }
            anchor.parentNode.insertBefore(banner, anchor.nextSibling);
        });
    }

    /**
     * Injects the stylesheet once.
     */
    function injectStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* The section wrapper, heading and count row are native Jellyfin
               classes (verticalSection / sectionTitleContainer / sectionTitle /
               mediaInfoItem), so nearly all of the look comes from the client's
               own stylesheet and follows whatever theme the user has applied.
               Only layout and the award list itself are defined here. */
            .je-awards .je-awards-head {
                display: flex;
                align-items: baseline;
                flex-wrap: wrap;
                gap: 0 1em;
            }
            .je-awards .je-awards-banner {
                align-items: baseline;
                cursor: pointer;
            }
            .je-awards .je-awards-summary {
                display: flex;
                align-items: baseline;
                flex-wrap: wrap;
                opacity: 0.85;
            }
            .je-awards .je-awards-wins {
                font-weight: 600;
                opacity: 1;
            }
            .je-awards .je-awards-chevron {
                /* The native rule sizes this at 1.5em with a bottom margin; keep
                   the size but sit it on the text baseline next to the title. */
                margin-bottom: 0 !important;
                align-self: center;
            }
            .je-awards-static .je-awards-chevron {
                display: none;
            }
            /* ---- TMDB-style banner (admin opt-in) ------------------------
               A self-contained bar rather than a Jellyfin section: gradient
               background, serif wordmark and the counts inline, modelled on the
               banner in the feature request. */
            .je-awards--tmdb {
                margin: 1.2em 0;
            }
            .je-awards--tmdb .je-awards-banner {
                display: flex;
                align-items: center;
                gap: 0.9em;
                width: 100%;
                padding: 0.75em 1.1em;
                border: none;
                border-radius: 0.6em;
                cursor: pointer;
                color: #fff;
                font-family: inherit;
                font-size: inherit;
                text-align: left;
                background: linear-gradient(100deg, #0d2b38 0%, #14495c 55%, #1b6076 100%);
            }
            .je-awards--tmdb.je-awards-static .je-awards-banner {
                cursor: default;
            }
            .je-awards--tmdb .je-awards-banner:focus-visible {
                outline: 2px solid #fff;
                outline-offset: 2px;
            }
            .je-awards--tmdb .je-awards-mark {
                display: inline-flex;
                align-items: center;
                gap: 0.45em;
                flex: 0 0 auto;
            }
            .je-awards--tmdb .je-awards-icon {
                display: inline-flex;
                font-size: 1.25em;
                line-height: 1;
            }
            .je-awards--tmdb .je-awards-wordmark {
                font-family: Georgia, 'Times New Roman', serif;
                font-size: 1.35em;
                letter-spacing: 0.14em;
                text-transform: uppercase;
                line-height: 1;
            }
            .je-awards--tmdb .je-awards-summary {
                display: flex;
                align-items: center;
                gap: 0.7em;
                flex: 1 1 auto;
                min-width: 0;
                flex-wrap: wrap;
                opacity: 1;
            }
            .je-awards--tmdb .je-awards-lead {
                font-weight: 600;
            }
            .je-awards--tmdb .je-awards-count {
                white-space: nowrap;
            }
            .je-awards--tmdb .je-awards-divider {
                display: inline-block;
                width: 1px;
                height: 1.1em;
                background: rgba(255, 255, 255, 0.45);
            }
            .je-awards--tmdb .je-awards-chevron {
                align-self: center;
            }
            @media (max-width: 46em) {
                .je-awards--tmdb .je-awards-banner {
                    flex-wrap: wrap;
                    gap: 0.5em 0.8em;
                }
                .je-awards--tmdb .je-awards-wordmark {
                    font-size: 1.15em;
                }
                .je-awards--tmdb .je-awards-divider {
                    display: none;
                }
                .je-awards--tmdb .je-awards-chevron {
                    margin-left: auto;
                }
            }

            .je-awards .je-awards-panel {
                padding: 0.25em 0 0.5em;
            }
            .je-awards .je-awards-group + .je-awards-group {
                margin-top: 1.4em;
            }
            .je-awards .je-awards-group-title {
                margin: 0 0 0.3em;
                font-size: 1.09em;
            }
            .je-awards .je-awards-list {
                list-style: none;
                margin: 0;
                padding: 0;
            }
            .je-awards .je-awards-row {
                display: flex;
                align-items: baseline;
                gap: 0.6em;
                padding: 0.4em 0;
            }
            .je-awards .je-awards-row + .je-awards-row {
                border-top: 1px solid rgba(255, 255, 255, 0.07);
            }
            .je-awards .je-awards-status-icon {
                flex: 0 0 auto;
                font-size: 1.1em;
                align-self: center;
            }
            /* Winners take the theme's accent; nominees stay muted, so the
               distinction reads the same way in every Jellyfin theme rather than
               relying on a hardcoded green. */
            .je-awards .je-awards-is-win .je-awards-status-icon {
                color: var(--accent, #00a4dc);
            }
            .je-awards .je-awards-is-nom .je-awards-status-icon {
                opacity: 0.4;
            }
            .je-awards .je-awards-is-win .je-awards-category {
                font-weight: 600;
            }
            .je-awards .je-awards-row-body {
                display: flex;
                flex-direction: column;
                flex: 1 1 auto;
                min-width: 0;
            }
            .je-awards .je-awards-link {
                /* Strip the emby-linkbutton chrome so the row reads as text, and
                   only underline on hover the way the client's own links do. */
                display: inline;
                padding: 0;
                margin: 0;
                background: none;
                color: inherit;
                font: inherit;
                text-align: inherit;
                text-decoration: none;
            }
            .je-awards .je-awards-link:hover,
            .je-awards .je-awards-link:focus-visible {
                text-decoration: underline;
            }
            .je-awards .je-awards-meta {
                opacity: 0.6;
                font-size: 0.9em;
            }
            .je-awards .je-awards-status-text {
                flex: 0 0 auto;
                align-self: center;
                opacity: 0.55;
                font-size: 0.82em;
                text-transform: uppercase;
                letter-spacing: 0.04em;
            }
            .je-awards .je-awards-empty,
            .je-awards .je-awards-attribution {
                opacity: 0.6;
                font-size: 0.85em;
                margin: 0.9em 0 0;
            }
            .je-awards .je-awards-attribution {
                display: flex;
                align-items: baseline;
                justify-content: space-between;
                gap: 1em;
            }
            .je-awards .je-awards-refresh {
                flex: 0 0 auto;
                padding: 0;
                border: none;
                background: none;
                color: inherit;
                font: inherit;
                text-decoration: underline;
                cursor: pointer;
            }
            .je-awards .je-awards-refresh[disabled] {
                cursor: default;
                text-decoration: none;
                opacity: 0.6;
            }
            @media (max-width: 46em) {
                .je-awards .je-awards-head {
                    gap: 0;
                }
                .je-awards .je-awards-summary {
                    width: 100%;
                }
                .je-awards .je-awards-status-text {
                    display: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * Wires the feature to the item-details dispatcher.
     * @param {string} itemId The Jellyfin item id.
     * @param {string} itemType The Jellyfin item type.
     * @param {HTMLElement} page The visible detail page element.
     */
    internal.displayAwards = function (itemId, itemType, page) {
        if (JE?.pluginConfig?.AwardsEnabled !== true) {
            return;
        }

        injectStyles();
        renderForItem(itemId, itemType, page);
    };

    /**
     * Drops the per-session cache. Called when the user changes the relevant
     * settings so the next detail page reflects them immediately.
     */
    internal.resetAwardsCache = function () {
        sessionCache.clear();
    };

})(window.JellyfinEnhanced);
