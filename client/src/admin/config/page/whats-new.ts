import { mediaTagsSurface } from '../../../host/admin-config-host';
import type { PageModules } from './modules';
import { humanizeSettingId, mediaTagsLocations, mediaTagsWhatsNewEntries } from '../domain/whats-new';
import { asObject, shown, text } from '../domain/config';
import { asHtml, asSelect, needAnchor, needHtml, plainLabel } from './dom';
import type { WhatsNewEntry, WhatsNewSetting } from './types';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type WhatsNewDeps = Pick<PageModules, 'context' | 'mediaTagsTab' | 'serviceStatus' | 'tabs'>;

export function createWhatsNew(m: WhatsNewDeps) {
    const { ApiClient, lifecycle } = m.context;

        /**
         * Build the Integration Health checklist inside #je-checklist.
         *
         * Row rules:
         *   - Only render a row when the integration is enabled.
         *   - Row state: 'ok' (green), 'amber' (warn), 'error' (red),
         *     'pending' (grey — enabled + complete config but no cached
         *     test result within TTL).
         *   - Zero rows is a valid outcome — render the empty hint.
         *   - Clicking a row jumps to the target tab.
         *
         * No HTML is injected from runtime data — every row is built with
         * createElement + textContent so untrusted instance names / URLs
         * can never inject markup into the checklist.
         */
        function renderChecklist() : void {
            // Thin delegator: the Integration Health checklist was merged into
            // Service Status, but multiple callers still reference this name —
            // keep the symbol to avoid breaking them. The original per-row
            // construction (#je-checklist + .je-checklist-* classes) was
            // removed along with its DOM host and CSS.
            m.serviceStatus.renderServiceStatusDashboard();
        }

        // What's New: settings the server detected as newly added, powered
        // by WhatsNewService.CheckForNewSettings on the backend.

        /** camelCase/PascalCase id -> "Camel Case Id" for display. */
        /**
         * New settings that live on the Media Tags tab (drawn only once it opens, so
         * the banner cannot point at their controls): one banner entry per section of
         * that tab, per group on Groups, opening it there.
         * @param {string[]} ids - The new setting ids to route.
         * @param {Object} locations - GET whats-new `mediaTags`: id -> {page, tab, group} (`tab`: one of the Media Tags tab's own tabs).
         * @returns {Array<{tab: string, tabLabel: string, title: string, href: string, mediaTags: {section: string, group: ?string}, ids: string[]}>}
         */

        // Warns when this build targets a different Jellyfin line or the file was replaced (GET host-compat).
        function checkHostCompat() : void {
            ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/host-compat'),
                dataType: 'json'
            }).then(function(response) {
                const data = asObject(response);
                var banner = asHtml(document.getElementById('je-host-mismatch-warning'));
                if (!banner) return;
                if (!data.mismatch && !data.stale) {
                    banner.style.display = 'none';
                    return;
                }
                // This rewrite supports Jellyfin 12.x only; a missing expected asset is the fallback signal.
                var unsupported = !!data.mismatch && (data.hostTarget === 'unsupported' || !data.expectedAsset);
                needHtml(document.getElementById('je-host-mismatch-title')).textContent = data.stale
                    ? 'Plugin restart required'
                    : unsupported
                        ? 'This Jellyfin version is not supported'
                        : 'Wrong plugin build for this Jellyfin version';
                needHtml(document.getElementById('je-host-mismatch-msg')).textContent = ' ' + text(data.message);
                needHtml(document.getElementById('je-host-mismatch-install')).style.display = data.mismatch && !unsupported ? '' : 'none';
                needHtml(document.getElementById('je-host-mismatch-asset')).textContent = text(data.expectedAsset);
                var hostMajor = parseInt(String(data.hostVersion || ''), 10);
                needHtml(document.getElementById('je-host-unsupported-check')).style.display = unsupported ? '' : 'none';
                needHtml(document.getElementById('je-host-unsupported-line')).textContent = isNaN(hostMajor) ? 'this Jellyfin version' : 'Jellyfin ' + hostMajor;
                var link = needAnchor(document.getElementById('je-host-mismatch-link'));
                link.textContent = text(data.manifestUrl);
                if (/^https:\/\//i.test(text(data.manifestUrl))) {
                    link.href = text(data.manifestUrl);
                } else {
                    link.removeAttribute('href');
                }
                banner.style.display = '';
            }).catch(function(err) {
                console.warn('[JE] host-compat check failed:', err);
            });
        }

        function checkWhatsNew() : void {
            ApiClient.ajax({
                type: 'GET',
                url: ApiClient.getUrl('/JellyfinEnhanced/whats-new'),
                dataType: 'json'
            }).then(function(response) {
                const data = asObject(response);
                var pluginVersion = text(data.pluginVersion);
                if (!pluginVersion) return;

                // Drop ids that no longer exist in this build (renamed/removed).
                const newSettings = asObject(data.newSettings);
                var perSetting = Object.keys(newSettings).flatMap(function(id): WhatsNewSetting[] {
                    var el = asHtml(document.getElementById(id));
                    var tabContent = el ? el.closest('.jellyfin-tab-content') : null;
                    // The Media Tags tab's controls (when it is already open) get its own entries below.
                    if (tabContent && tabContent.id === 'media-tags') return [];
                    return tabContent ? [{ id: id, tab: tabContent.id, selector: '#' + id, title: humanizeSettingId(id), version: shown(newSettings[id]) }] : [];
                });

                // Settings on the Media Tags tab get entries opening it there.
                const mediaTags = mediaTagsLocations(data.mediaTags);
                var onMain = new Set(perSetting.map(function(f) { return f.id; }));
                var moved = Object.keys(newSettings).filter(function(id) { return !onMain.has(id) && mediaTags[id]; });
                var je = mediaTagsSurface();
                var movedEntries = mediaTagsWhatsNewEntries(moved, mediaTags);

                var versions = perSetting.map(function(f) { return f.version; }).concat(moved.map(function(id) { return shown(newSettings[id]); }));
                var distinctVersions = new Set(versions);
                var singleVersion = distinctVersions.size === 1 ? versions[0] ?? null : null;

                var oldestVersion = Array.from(distinctVersions).sort(function(a, b) { return a.localeCompare(b, undefined, { numeric: true }); })[0] ?? null;
                renderWhatsNewBanner((perSetting.length ? groupWhatsNewByFieldset(perSetting) : []).concat(movedEntries), pluginVersion, singleVersion, oldestVersion);
                // The list keeps everything not yet dismissed; a badge marks only what this release added (the server
                // records the version each setting was first seen in, so older ones were there on earlier visits).
                renderWhatsNewBadges(perSetting.filter(function(f) { return f.version === pluginVersion; }));
                jeWatchMediaTagsBadges(new Map(Object.keys(newSettings).filter(function(id) { return shown(newSettings[id]) === pluginVersion; }).map(function(id) { return [id, shown(newSettings[id])]; })));
            }).catch(function(err) {
                console.warn('[JE] whats-new check failed:', err);
            });
        }

        var _jeAutoFieldsetIdCounter = 0;

        /** Tab content id (e.g. "seerr") -> its visible nav label (e.g. "Seerr"), read straight off the tab button so it never drifts from what's on screen. */
        function jeTabLabel(tabId: string) : string {
            var btn = asHtml(document.querySelector('.jellyfin-tab-button[data-tab="' + tabId + '"] .je-tab-label'));
            if (!btn) return tabId;
            return plainLabel(btn) || tabId;
        }

        /** Collapses new settings to one banner entry per fieldset, so a whole new feature reads as one line, not a wall of chips. */
        function groupWhatsNewByFieldset(perSetting: readonly WhatsNewSetting[]) : WhatsNewEntry[] {
            var newIdSet = new Set(perSetting.map(function(f) { return f.id; }));
            var groups: Record<string, WhatsNewEntry & { flashSelectors: string[] }> = {};
            var order: string[] = [];
            perSetting.forEach(function(f) {
                const fieldset = needHtml(document.querySelector(f.selector)).closest('fieldset');
                var legend = fieldset ? asHtml(fieldset.querySelector(':scope > legend.sectionTitle')) : null;
                var title = f.title;
                if (legend) {
                    var legendText = plainLabel(legend);
                    if (legendText) title = legendText;
                }
                var key = f.tab + ':' + title;
                const group = groups[key];
                if (!group) {
                    // Flash the whole fieldset only when every control in it is new;
                    // otherwise flash each new control individually.
                    var selector = f.selector;
                    var isWholeFieldset = false;
                    if (fieldset) {
                        var allIds = Array.from(fieldset.querySelectorAll<HTMLElement>('input[id], select[id], textarea[id], button[id]')).map(function(el) { return el.id; });
                        var allNew = allIds.length > 0 && allIds.every(function(id) { return newIdSet.has(id); });
                        if (allNew) {
                            if (!fieldset.id) fieldset.id = 'je-fieldset-auto-' + (++_jeAutoFieldsetIdCounter);
                            selector = '#' + fieldset.id;
                            isWholeFieldset = true;
                        }
                    }
                    groups[key] = {
                        tab: f.tab,
                        tabLabel: jeTabLabel(f.tab),
                        selector: selector,
                        title: title,
                        isWholeFieldset: isWholeFieldset,
                        flashSelectors: [isWholeFieldset ? selector : f.selector]
                    };
                    order.push(key);
                } else if (!group.isWholeFieldset) {
                    group.flashSelectors.push(f.selector);
                }
            });
            return order.flatMap(function(key) { const group = groups[key]; return group ? [group] : []; });
        }

        function dismissWhatsNew() : void {
            ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl('/JellyfinEnhanced/whats-new/dismiss') })
                .catch(function(err) { console.warn('[JE] whats-new dismiss failed:', err); });
            renderWhatsNewBanner([], '', null);
            // Acknowledged: the Media Tags tab's badges go with the form's, and a later redraw does not bring them back.
            _jeMtNewSettings = new Map();
            renderWhatsNewBadges([]);
        }

        /** Tab ids in the order the sidebar lists them, so the expanded list reads like the page. */
        function jeNavOrder() : string[] {
            return Array.from(document.querySelectorAll<HTMLElement>('.jellyfin-tab-button')).map(function(b) { return b.dataset.tab ?? ''; });
        }

        /** Where an entry sits on its tab: document order of its target there, the Media Tags tab's own section order for its entries. */
        function jeEntryRank(f: WhatsNewEntry) : number {
            if (f.mediaTags) {
                var sections = m.mediaTagsTab.JE_MT_SECTIONS.map(function(s) { return s[0]; });
                var groups = ['quality', 'genre', 'language', 'rating', 'ageRating', 'status', 'awards', 'logos', 'custom', 'people'];
                var section = sections.indexOf(f.mediaTags.section);
                var group = f.mediaTags.group ? groups.indexOf(f.mediaTags.group) : -1;
                return (section < 0 ? 99 : section) * 100 + (group < 0 ? 0 : group + 1);
            }
            var target = f.selector ? asHtml(document.querySelector(f.selector)) : null;
            if (!target) return Number.MAX_SAFE_INTEGER;
            return Array.prototype.indexOf.call(document.querySelectorAll('fieldset, [id]'), target.closest('fieldset') || target);
        }

        /**
         * One line under Service Status: how many settings are new, Show (the list grouped by tab in sidebar order),
         * the release notes and Dismiss. The page opens on status; the list is there when the administrator asks.
         */
        function renderWhatsNewBanner(unseen: readonly WhatsNewEntry[], pluginVersion: string, singleVersion: string | null, oldestVersion?: string | null) : void {
            var existing = asHtml(document.getElementById('je-whats-new-banner'));
            if (existing) existing.remove();
            if (!pluginVersion) return;

            var banner = document.createElement('div');
            banner.id = 'je-whats-new-banner';
            banner.className = 'je-info-banner je-fieldset-wide je-whats-new-banner';
            banner.setAttribute('role', 'region');
            banner.setAttribute('aria-label', "What's new");

            var icon = document.createElement('i');
            icon.className = 'material-icons je-info-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = 'auto_awesome';
            banner.appendChild(icon);

            var body = document.createElement('div');
            body.className = 'je-whats-new-body';
            var headingRow = document.createElement('div');
            headingRow.className = 'je-whats-new-heading-row';
            // Counts what Show lists: one entry per card (or Media Tags section) with new settings.
            var count = unseen.length;
            var heading = document.createElement('strong');
            heading.className = 'je-whats-new-heading';
            heading.textContent = unseen.length === 0
                ? 'No new settings in v' + pluginVersion
                : count + (count === 1 ? ' section has' : ' sections have') + ' new settings'
                    + (singleVersion ? ' in v' + singleVersion : oldestVersion ? ' (v' + oldestVersion + ' to v' + pluginVersion + ')' : '');
            headingRow.appendChild(heading);

            var list: HTMLElement | null = null;
            if (unseen.length > 0) {
                list = document.createElement('div');
                list.className = 'je-whats-new-list';
                list.hidden = true;
                var order = jeNavOrder();
                var byTab = new Map<string, WhatsNewEntry[]>();
                unseen.forEach(function(f) { const entries = byTab.get(f.tab) ?? []; entries.push(f); byTab.set(f.tab, entries); });
                Array.from(byTab.keys()).sort(function(a, b) {
                    var ia = order.indexOf(a), ib = order.indexOf(b);
                    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
                }).forEach(function(tabId) {
                    var entries = (byTab.get(tabId) ?? []).slice().sort(function(a, b) { return jeEntryRank(a) - jeEntryRank(b); });
                    var group = document.createElement('div');
                    group.className = 'je-whats-new-group';
                    var title = document.createElement('div');
                    title.className = 'je-whats-new-tab';
                    title.textContent = entries[0]?.tabLabel ?? jeTabLabel(tabId);
                    group.appendChild(title);
                    var chips = document.createElement('div');
                    chips.className = 'je-whats-new-chips';
                    entries.forEach(function(f) {
                        var chip = document.createElement('button');
                        chip.type = 'button';
                        chip.className = 'je-whats-new-chip';
                        chip.textContent = f.title;
                        chip.setAttribute('aria-label', f.tabLabel + ' › ' + f.title);
                        chip.addEventListener('click', function() {
                            // Settings on the Media Tags tab: open it at their section, in place.
                            if (f.mediaTags) m.mediaTagsTab.jeOpenMediaTags(f.mediaTags.section, f.mediaTags.group, true);
                            else m.tabs.jeJumpToTab(f.tab, f.selector, f.flashSelectors);
                        });
                        chips.appendChild(chip);
                    });
                    group.appendChild(chips);
                    list?.appendChild(group);
                });
                var toggle = document.createElement('button');
                toggle.type = 'button';
                toggle.className = 'jea-btn je-whats-new-toggle';
                toggle.setAttribute('aria-expanded', 'false');
                toggle.textContent = 'Show';
                toggle.addEventListener('click', function() {
                    if (!list) return;
                    list.hidden = !list.hidden;
                    toggle.setAttribute('aria-expanded', String(!list.hidden));
                    toggle.textContent = list.hidden ? 'Show' : 'Hide';
                });
                headingRow.appendChild(toggle);
            }

            var releaseLink = document.createElement('a');
            releaseLink.href = unseen.length === 0
                ? 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases/tag/' + encodeURIComponent(pluginVersion)
                : (singleVersion
                    ? 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases/tag/' + encodeURIComponent(singleVersion)
                    : 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases');
            releaseLink.target = '_blank';
            releaseLink.rel = 'noopener noreferrer';
            releaseLink.className = 'je-whats-new-release-link';
            releaseLink.appendChild(document.createTextNode('Release notes'));
            var releaseLinkIcon = document.createElement('i');
            releaseLinkIcon.className = 'material-icons';
            releaseLinkIcon.setAttribute('aria-hidden', 'true');
            releaseLinkIcon.textContent = 'open_in_new';
            releaseLink.appendChild(releaseLinkIcon);
            headingRow.appendChild(releaseLink);

            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'jea-btn je-whats-new-close';
            closeBtn.textContent = 'Dismiss';
            closeBtn.setAttribute('aria-label', "Dismiss what's new");
            closeBtn.addEventListener('click', dismissWhatsNew);
            headingRow.appendChild(closeBtn);

            body.appendChild(headingRow);
            if (list) body.appendChild(list);
            banner.appendChild(body);
            var overview = asHtml(document.getElementById('overview'));
            if (!overview) return;
            // Below Service Status, so the tab opens on the state of the server.
            var status = overview.querySelector(':scope > fieldset');
            if (status) status.after(banner); else overview.insertBefore(banner, overview.firstChild);
        }

        /** New settings (id -> the version they arrived in); the ones drawn on the Media Tags tab are badged from it. */
        var _jeMtNewSettings: ReadonlyMap<string, string> = new Map();

        var _jeMtBadgeObserver: MutationObserver | null = null;

        /** Badges the new settings whose controls are drawn on the Media Tags tab (re-run when the tab redraws a section or opens a group). */
        function jeBadgeMediaTags() : void {
            var tab = asHtml(document.getElementById('media-tags'));
            if (!tab || _jeMtNewSettings.size === 0) return;
            var badged = new Set<string>();
            // A card whose settings are all new gets one badge on its title, as a wholly new card on the form does.
            tab.querySelectorAll<HTMLElement>('.je-ta-card').forEach(function(card) {
                var rows = Array.from(card.querySelectorAll<HTMLElement>('[data-field-row]'));
                if (rows.length < 2 || !rows.every(function(row) { return _jeMtNewSettings.has(row.dataset.fieldRow ?? ''); })) return;
                rows.forEach(function(row) { badged.add(row.dataset.fieldRow ?? ''); });
                var title = asHtml(card.querySelector('.je-ta-card-title'));
                if (title && !title.querySelector(':scope > .je-new-badge')) jeAppendNewBadge(title, _jeMtNewSettings.get(rows[0]?.dataset.fieldRow ?? '') ?? '');
            });
            tab.querySelectorAll<HTMLElement>('[data-field-row]').forEach(function(row) {
                var id = row.dataset.fieldRow ?? '';
                var version = _jeMtNewSettings.get(id);
                // The first row of a setting, as a lookup by id would find it.
                if (version === undefined || badged.has(id)) return;
                badged.add(id);
                var host = row.querySelector('[data-je-label], .je-ta-switch-name');
                if (!host || host.querySelector(':scope > .je-new-badge')) return;
                jeAppendNewBadge(host, version);
            });
        }

        function jeWatchMediaTagsBadges(newSettings: ReadonlyMap<string, string>) : void {
            _jeMtNewSettings = newSettings;
            var tab = asHtml(document.getElementById('media-tags'));
            if (!tab) return;
            // Watched only once there is something to badge; the view's lifecycle disconnects it.
            if (!_jeMtBadgeObserver && newSettings.size > 0) {
                var queued = false;
                _jeMtBadgeObserver = lifecycle.track(new MutationObserver(function() {
                    if (queued) return;
                    queued = true;
                    lifecycle.frame(function() { queued = false; jeBadgeMediaTags(); });
                }));
                _jeMtBadgeObserver.observe(tab, { childList: true, subtree: true });
            }
            jeBadgeMediaTags();
        }

        function jeAppendNewBadge(container: Element, version: string) : void {
            if (!container) return;
            var badge = document.createElement('span');
            badge.className = 'je-new-badge';
            // Not part of the control's name (it sits in its label): the What's new list says what is new.
            badge.setAttribute('aria-hidden', 'true');
            var badgeIcon = document.createElement('i');
            badgeIcon.className = 'material-icons';
            badgeIcon.setAttribute('aria-hidden', 'true');
            badgeIcon.textContent = 'auto_awesome';
            badge.appendChild(badgeIcon);
            badge.appendChild(document.createTextNode(version ? ('New in v' + version) : 'New'));
            container.appendChild(badge);
        }

        /** When a whole fieldset (or expander) is new, badge just its legend (or summary) instead of every control inside it. Each badge uses its own setting's first-detected version. */
        /** Where a setting's badge goes: after its label text, beside its other markers (one placement everywhere). */
        function jeBadgeHost(el: HTMLElement) : HTMLElement | null {
            var label = el.closest('label') || (el.id ? document.querySelector('label[for="' + el.id + '"]') : null);
            var marks = label ? asHtml(label.querySelector('.jea-marks')) : null;
            return marks || asHtml(label) || el.parentElement;
        }

        function renderWhatsNewBadges(settings: readonly WhatsNewSetting[]) : void {
            document.querySelectorAll<HTMLElement>('.je-new-badge').forEach(function(b) { b.remove(); });
            jeBadgeMediaTags();
            // A linked copy (Services) of a new setting is new too, and carries the same badge.
            var perSetting = settings.concat(settings.flatMap(function(f): WhatsNewSetting[] {
                return document.getElementById(f.id + '--mirror') ? [{ ...f, id: f.id + '--mirror', selector: '#' + f.id + '--mirror' }] : [];
            }));
            var newIdSet = new Set(perSetting.map(function(f) { return f.id; }));
            var versionById = new Map(perSetting.map(function(f) { return [f.id, f.version]; }));

            var byFieldset = new Map<HTMLElement, HTMLElement[]>();
            var noFieldset: HTMLElement[] = [];
            perSetting.forEach(function(f) {
                var el = asHtml(document.getElementById(f.id));
                if (!el) return;
                var fieldset = el.closest('fieldset');
                if (!fieldset) { noFieldset.push(el); return; }
                const inFieldset = byFieldset.get(fieldset) ?? [];
                inFieldset.push(el);
                byFieldset.set(fieldset, inFieldset);
            });

            noFieldset.forEach(function(el) {
                const host = jeBadgeHost(el);
                if (host) jeAppendNewBadge(host, versionById.get(el.id) ?? '');
            });

            byFieldset.forEach(function(newEls, fieldset) {
                if (jeAllControlsNew(fieldset, newIdSet)) {
                    const legend = fieldset.querySelector(':scope > legend.sectionTitle');
                    const first = newEls[0];
                    if (legend && first) jeAppendNewBadge(legend, versionById.get(first.id) ?? '');
                } else {
                    newEls.forEach(function(el) {
                        // Same rule one level down: an expander whose controls are all new gets
                        // one badge on its summary, and a tag row (Enable + Position) one on its label.
                        var details = el.closest('details');
                        var host = (details && jeAllControlsNew(details, newIdSet))
                            ? asHtml(details.querySelector(':scope > summary'))
                            : (el.closest('.je-tag-row') ? asHtml(el.closest('.je-tag-row')?.querySelector('label') ?? null) : jeBadgeHost(el));
                        if (!host || asHtml(host.querySelector(':scope > .je-new-badge'))) return;
                        jeAppendNewBadge(host, versionById.get(el.id) ?? '');
                    });
                }
            });
        }

        /** True when every control inside container is a newly added setting. */
        function jeAllControlsNew(container: Element, newIdSet: ReadonlySet<string>) : boolean {
            var ids = Array.from(container.querySelectorAll<HTMLElement>('input[id], select[id], textarea[id], button[id]')).map(function(el) { return el.id; });
            return ids.length > 0 && ids.every(function(id) { return newIdSet.has(id); });
        }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {

    }

    return {
        wire,
        checkHostCompat,
        checkWhatsNew,
        renderChecklist,
    };
}
