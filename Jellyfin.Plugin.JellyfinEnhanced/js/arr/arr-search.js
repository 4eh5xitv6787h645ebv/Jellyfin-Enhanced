// /js/arr/arr-search.js
//
// Adds "Search" (automatic) and "Interactive Search" (manual release picker) to the native
// 3-dot / long-press action sheet of movies, series, seasons and episodes, driving the
// configured Sonarr/Radarr instances. Admin-only. All arr traffic goes through the plugin's
// server-side endpoints (which hold the instance API keys and are SSRF-guarded) — the browser
// never talks to Sonarr/Radarr directly.
//
// Injection reuses JE.actionSheet (exported by features.js) so the two items are built from a
// live sibling's class list and fitted with Jellyfin's own overflow logic — they look and size
// exactly like native items and never reflow the sheet after it paints.
(function (JE) {
    'use strict';

    JE.initializeArrSearchScript = function () {
        const logPrefix = '🪼 Jellyfin Enhanced: Arr Search:';

        if (JE._arrSearchInitialized) return; // idempotent — only wire listeners once
        if (!JE?.pluginConfig?.ArrSearchEnabled) {
            return;
        }

        // ── Escape helper ────────────────────────────────────────────────────────
        // JE.toast renders via innerHTML, and release titles / indexer names / error reasons
        // originate from indexers upstream of Sonarr/Radarr, so every interpolated value passes
        // through escape() first. The inline fallback is a real escaper for load-order safety.
        const esc = (s) => {
            if (JE.helpers?.escHtml) return JE.helpers.escHtml(s);
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        };

        // ── Admin gate (mirror arr-links.js) ─────────────────────────────────────
        // Only admins may trigger searches / grab releases, so resolve the current user's admin
        // flag before wiring anything. Uses the prefetched JE.currentUser when available.
        (async function initWhenAdmin() {
            let isAdmin = false;
            try {
                let user = JE.currentUser || null;
                if (!user) {
                    for (let i = 0; i < 5; i++) {
                        try { user = await ApiClient.getCurrentUser(); if (user) break; } catch (e) { /* retry */ }
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
                if (!user) { console.error(`${logPrefix} Could not resolve current user; aborting.`); return; }
                isAdmin = user?.Policy?.IsAdministrator === true;
            } catch (err) {
                console.error(`${logPrefix} admin check failed`, err);
                return;
            }
            if (!isAdmin) {
                console.log(`${logPrefix} User is not an administrator; feature not wired.`);
                return;
            }

            // Bail out if no arr instance is configured — nothing to search against. Reads the
            // same instance arrays arr-links uses (private-config), with a legacy single-field fallback.
            const enabled = (arr) => Array.isArray(arr) && arr.some(i => i && i.Enabled !== false && i.Url);
            const anyArr = enabled(JE.pluginConfig.SonarrInstances) || enabled(JE.pluginConfig.RadarrInstances)
                || !!JE.pluginConfig.SonarrUrl || !!JE.pluginConfig.RadarrUrl;
            if (!anyArr) {
                console.log(`${logPrefix} No Sonarr/Radarr instance configured; feature not wired.`);
                return;
            }

            JE._arrSearchInitialized = true;
            wire();
            console.log(`${logPrefix} Initialized.`);
        })();

        // ── Constants ────────────────────────────────────────────────────────────
        // How long a captured menu context stays valid — the sheet observer fires within ~150ms
        // of a menu opening; this bounds how stale a context may be before it's ignored.
        const CONTEXT_TTL_MS = 5000;
        const GUID_RE = /^[a-f0-9]{32}$/i;
        // Item types the arr backend can resolve. Used to skip injecting on non-video sheets
        // (music tracks, photos, …) once the captured item's type is known.
        const VIDEO_TYPES = new Set(['Movie', 'Series', 'Season', 'Episode']);

        // { itemId, ts, type } captured when a card's menu is triggered, so the sheet observer
        // knows which item the freshly-opened action sheet belongs to.
        let searchContext = null;

        // ── Context capture ──────────────────────────────────────────────────────
        /**
         * Records the item whose menu is being opened. Also kicks off a best-effort cached
         * item lookup so the injector can skip non-video item types before the sheet paints.
         * @param {Element|null} el Element inside/at the triggering card.
         */
        function captureContext(el) {
            if (!el || typeof el.closest !== 'function') return;
            const holder = el.closest('[data-id]');
            const itemId = holder && holder.getAttribute('data-id');
            if (!itemId || !GUID_RE.test(itemId)) return;

            const ctx = { itemId, ts: Date.now(), type: null };
            searchContext = ctx;

            // Resolve the type asynchronously; if it comes back before the sheet is injected we can
            // suppress the items on non-video sheets. If it's slow, we inject optimistically and the
            // click-time server resolve returns a clear "unsupported" message instead.
            if (JE.helpers && typeof JE.helpers.getItemCached === 'function') {
                JE.helpers.getItemCached(itemId)
                    .then((it) => { if (searchContext === ctx && it && it.Type) ctx.type = it.Type; })
                    .catch(() => { /* optimistic */ });
            }
        }

        const isInsideOpenMenu = (t) =>
            !!(t && t.closest && t.closest('.actionSheetContent, .actionSheet, .dialogContainer, dialog'));

        /** The item id of the currently-visible detail page (fallback when no card context). */
        function currentDetailItemId() {
            const page = document.querySelector('#itemDetailPage:not(.hide)');
            if (!page) return null;
            try {
                const id = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                return (id && GUID_RE.test(id)) ? id : null;
            } catch (e) { return null; }
        }

        // ── Wiring: context listeners + action-sheet observer ────────────────────
        function wire() {
            injectStyles();

            // Three-dot menu buttons (cards + detail page use data-action="menu").
            document.body.addEventListener('mousedown', (e) => {
                const menuButton = e.target.closest && e.target.closest('button[data-action="menu"]');
                if (menuButton) captureContext(menuButton);
            }, true);

            // Right-click / long-press on a card.
            document.body.addEventListener('contextmenu', (e) => {
                if (isInsideOpenMenu(e.target)) return;
                captureContext(e.target.closest && e.target.closest('.card[data-id], .listItem[data-id]'));
            }, true);

            // rAF-coalesced observer: inject before the freshly-opened sheet paints so the items
            // land on its first frame and never reflow it (matches the Remove-item approach).
            let scheduled = false;
            JE.helpers.createObserver('arr-search-sheets', () => {
                if (scheduled) return;
                scheduled = true;
                requestAnimationFrame(() => { scheduled = false; injectSearchItems(); });
            }, document.body, { childList: true, subtree: true });
        }

        /**
         * Injects the "Search" + "Interactive Search" items into the currently-open per-item
         * action sheet, bound to the captured (or detail-page) item. Idempotent per sheet and
         * scoped to single media-item sheets (skips sort menus, OSD pickers, and multi-select).
         */
        function injectSearchItems() {
            const util = JE.actionSheet;
            if (!util || typeof util.getActiveScroller !== 'function') return;

            const scroller = util.getActiveScroller();
            if (!scroller) return;

            // Only a single media-item sheet exposes play/resume; skip everything else.
            const anchor = scroller.querySelector('[data-id="resume"]')
                || scroller.querySelector('[data-id="play"]')
                || scroller.querySelector('[data-id="playallfromhere"]');
            if (!anchor) return;
            // The multi-select / long-press bulk menu is not a single-item sheet.
            if (scroller.querySelector('[data-id="selectall"]')) return;

            // Resolve the target item: a fresh card context wins; otherwise the detail page's item.
            let itemId = null;
            let itemType = null;
            if (searchContext && (Date.now() - searchContext.ts) <= CONTEXT_TTL_MS) {
                itemId = searchContext.itemId;
                itemType = searchContext.type;
            } else {
                itemId = currentDetailItemId();
            }
            if (!itemId) return;
            // Known non-video type → don't offer arr search on it.
            if (itemType && !VIDEO_TYPES.has(itemType)) return;

            // Reconcile against a possibly-reused sheet element: if our items already exist for THIS
            // item nothing to do; if they were left over from a DIFFERENT item (Jellyfin can reuse the
            // action-sheet content across opens) drop them so we re-bind to the current item instead
            // of silently searching the wrong one.
            const existing = scroller.querySelector('[data-id="je-arr-search"]');
            if (existing) {
                if (existing.dataset.jeItemId === itemId) return;
                existing.remove();
                const staleInteractive = scroller.querySelector('[data-id="je-arr-interactive-search"]');
                if (staleInteractive) staleInteractive.remove();
            }

            // Sonarr has no whole-series interactive search (it searches per season/episode), and the
            // backend rejects a series release lookup with 422. So when we KNOW the item is a series,
            // offer only automatic "Search" — not "Interactive Search". Episodes/seasons/movies get both.
            // When the type is unknown (detail-page fallback) we still offer both; the modal shows the
            // backend's "open a season or an episode" message if it does turn out to be a series.
            const seriesOnlyAuto = itemType === 'Series';

            const searchItem = util.buildItem(scroller, {
                dataId: 'je-arr-search', icon: 'search', text: JE.t('arr_search_auto')
            });
            searchItem.dataset.jeItemId = itemId;
            searchItem.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                onAutoSearch(searchItem, itemId);
            });
            anchor.after(searchItem);
            let lastInserted = searchItem;

            if (!seriesOnlyAuto) {
                const interactiveItem = util.buildItem(scroller, {
                    dataId: 'je-arr-interactive-search', icon: 'travel_explore', text: JE.t('arr_search_interactive')
                });
                interactiveItem.dataset.jeItemId = itemId;
                interactiveItem.addEventListener('click', (e) => {
                    e.preventDefault(); e.stopPropagation();
                    if (util.closeOpen) util.closeOpen();
                    openInteractiveModal(itemId);
                });
                searchItem.after(interactiveItem);
                lastInserted = interactiveItem;
            }
            // Fit after insertion; the wider label drives any nudge.
            util.fitToMenu(lastInserted, scroller);
        }

        // ── Networking ───────────────────────────────────────────────────────────
        /**
         * Fetches a plugin arr endpoint with the browser's Jellyfin auth headers (raw fetch so a
         * long interactive-search GET isn't cut short by any ajax timeout).
         * @param {string} method
         * @param {string} path Absolute plugin path (e.g. '/JellyfinEnhanced/arr/search/auto').
         * @param {object} [body] JSON body for POSTs.
         */
        function arrFetch(method, path, body) {
            const token = ApiClient.accessToken();
            const opts = {
                method,
                headers: {
                    'Authorization': 'MediaBrowser Token="' + token + '"',
                    'X-MediaBrowser-Token': token
                }
            };
            if (body !== undefined) {
                opts.headers['Content-Type'] = 'application/json';
                opts.body = JSON.stringify(body);
            }
            return fetch(ApiClient.getUrl(path), opts);
        }
        async function parseJson(resp) { try { return await resp.json(); } catch (e) { return null; } }

        // ── Automatic search ─────────────────────────────────────────────────────
        /**
         * Fires the appropriate Sonarr/Radarr automatic-search command for the item, showing
         * in-item progress and a result toast.
         */
        async function onAutoSearch(button, itemId) {
            const textEl = button.querySelector('.actionSheetItemText');
            const original = textEl ? textEl.textContent : '';
            button.disabled = true;
            if (textEl) textEl.textContent = JE.t('arr_search_searching');
            JE.actionSheet.setIcon(button, 'hourglass_empty');

            const restore = () => {
                if (textEl) textEl.textContent = original;
                JE.actionSheet.setIcon(button, 'search');
                button.disabled = false;
            };

            try {
                const resp = await arrFetch('POST', '/JellyfinEnhanced/arr/search/auto', { itemId });
                const data = await parseJson(resp);
                if (resp.ok) {
                    if (JE.actionSheet.closeOpen) JE.actionSheet.closeOpen();
                    JE.toast(esc(JE.t('arr_search_triggered', { instance: data?.instanceName || 'arr' })));
                } else {
                    restore();
                    JE.toast('⚠ ' + esc((data && data.error) || JE.t('arr_search_failed')));
                }
            } catch (e) {
                console.error(`${logPrefix} auto search failed`, e);
                restore();
                JE.toast('⚠ ' + esc(JE.t('arr_search_failed')));
            }
        }

        // ── Formatting helpers (modal) ───────────────────────────────────────────
        function formatBytes(bytes) {
            if (!bytes || bytes <= 0) return '';
            if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
            if (bytes < 1073741824) return (bytes / 1048576).toFixed(0) + ' MB';
            return (bytes / 1073741824).toFixed(2) + ' GB';
        }
        function formatAge(hours) {
            const h = Number(hours) || 0;
            if (h < 1) return '<1h';
            if (h < 48) return Math.round(h) + 'h';
            return Math.round(h / 24) + 'd';
        }

        // ── Interactive search modal ─────────────────────────────────────────────
        let activeModalClose = null; // teardown of the currently-open modal (if any)

        /** Opens the interactive-search modal for an item, fetches releases, and renders them. */
        function openInteractiveModal(itemId) {
            if (activeModalClose) activeModalClose();

            const themeVars = (JE.themer && JE.themer.getThemeVariables && JE.themer.getThemeVariables()) || {};
            const bg = themeVars.secondaryBg || 'rgba(20,20,28,0.98)';
            const text = themeVars.textColor || '#fff';

            const overlay = document.createElement('div');
            overlay.className = 'je-arrsearch-overlay';

            const dialog = document.createElement('div');
            dialog.className = 'je-arrsearch-dialog';
            dialog.style.setProperty('--je-arrsearch-bg', bg);
            dialog.style.setProperty('--je-arrsearch-text', text);

            // Header
            const header = document.createElement('div');
            header.className = 'je-arrsearch-header';
            const titleEl = document.createElement('div');
            titleEl.className = 'je-arrsearch-title';
            titleEl.textContent = JE.t('arr_search_interactive');
            const closeBtn = document.createElement('button');
            closeBtn.className = 'je-arrsearch-close';
            closeBtn.setAttribute('is', 'paper-icon-button-light');
            closeBtn.setAttribute('aria-label', JE.t('arr_search_close'));
            closeBtn.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
            header.appendChild(titleEl);
            header.appendChild(closeBtn);

            // Body (starts in loading state)
            const bodyEl = document.createElement('div');
            bodyEl.className = 'je-arrsearch-body';
            bodyEl.appendChild(buildStatus('loading', JE.t('arr_search_loading')));

            dialog.appendChild(header);
            dialog.appendChild(bodyEl);
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const close = () => {
                if (activeModalClose === close) activeModalClose = null;
                document.removeEventListener('keydown', escHandler);
                overlay.remove();
            };
            activeModalClose = close;
            const escHandler = (e) => { if (e.key === 'Escape') close(); };
            document.addEventListener('keydown', escHandler);
            closeBtn.addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

            loadReleases(itemId, bodyEl, titleEl);
        }

        /** Builds a centered status block (loading spinner / empty / error). */
        function buildStatus(kind, message) {
            const wrap = document.createElement('div');
            wrap.className = 'je-arrsearch-status';
            if (kind === 'loading') {
                const spinner = document.createElement('div');
                spinner.className = 'je-arrsearch-spinner';
                wrap.appendChild(spinner);
            } else {
                const icon = document.createElement('span');
                icon.className = 'material-icons je-arrsearch-status-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = kind === 'error' ? 'error_outline' : 'search_off';
                wrap.appendChild(icon);
            }
            const msg = document.createElement('div');
            msg.className = 'je-arrsearch-status-msg';
            msg.textContent = message;
            wrap.appendChild(msg);
            return wrap;
        }

        /** Fetches the release list and renders it (or an empty/error state) into the modal body. */
        async function loadReleases(itemId, bodyEl, titleEl) {
            try {
                const resp = await arrFetch('GET', '/JellyfinEnhanced/arr/search/releases?itemId=' + encodeURIComponent(itemId));
                const data = await parseJson(resp);
                if (!resp.ok) {
                    bodyEl.replaceChildren(buildStatus('error', (data && data.error) || JE.t('arr_search_release_error')));
                    return;
                }
                if (data && data.title) {
                    titleEl.textContent = data.title;
                    if (data.instanceName) {
                        const sub = document.createElement('span');
                        sub.className = 'je-arrsearch-instance';
                        sub.textContent = data.instanceName;
                        titleEl.appendChild(sub);
                    }
                }
                const releases = (data && Array.isArray(data.releases)) ? data.releases : [];
                if (releases.length === 0) {
                    bodyEl.replaceChildren(buildStatus('empty', JE.t('arr_search_no_releases')));
                    return;
                }
                bodyEl.replaceChildren(buildReleaseList(releases, itemId));
            } catch (e) {
                console.error(`${logPrefix} release lookup failed`, e);
                bodyEl.replaceChildren(buildStatus('error', JE.t('arr_search_release_error')));
            }
        }

        /** Builds the scrollable list of release rows. */
        function buildReleaseList(releases, itemId) {
            const list = document.createElement('div');
            list.className = 'je-arrsearch-list';

            const count = document.createElement('div');
            count.className = 'je-arrsearch-count';
            count.textContent = JE.t('arr_search_result_count', { count: releases.length });
            list.appendChild(count);

            releases.forEach((r) => list.appendChild(buildReleaseRow(r, itemId)));
            return list;
        }

        /** Adds a labelled badge to a row's meta line when the value is present. */
        function addBadge(container, cls, value) {
            if (value === null || value === undefined || value === '') return;
            const b = document.createElement('span');
            b.className = 'je-arrsearch-badge ' + cls;
            b.textContent = value;
            container.appendChild(b);
        }

        /** Builds a single release row: title + meta badges + Grab button. */
        function buildReleaseRow(r, itemId) {
            const row = document.createElement('div');
            row.className = 'je-arrsearch-release';
            const rejected = !r.approved || (Array.isArray(r.rejections) && r.rejections.length > 0);
            if (rejected) row.classList.add('je-arrsearch-release--rejected');

            const info = document.createElement('div');
            info.className = 'je-arrsearch-release-info';

            const title = document.createElement('div');
            title.className = 'je-arrsearch-release-title';
            title.textContent = r.title || '';
            title.title = r.title || '';
            info.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'je-arrsearch-release-meta';
            addBadge(meta, 'je-arrsearch-badge--quality', r.quality);
            addBadge(meta, 'je-arrsearch-badge--proto', (r.protocol || '').toLowerCase() === 'usenet' ? 'Usenet' : (r.protocol ? 'Torrent' : ''));
            addBadge(meta, 'je-arrsearch-badge--size', formatBytes(r.size));
            // Seeders/leechers for torrents; age otherwise.
            if ((r.protocol || '').toLowerCase() === 'torrent' && (r.seeders !== null && r.seeders !== undefined)) {
                addBadge(meta, 'je-arrsearch-badge--peers', '↑' + r.seeders + ' ↓' + (r.leechers ?? 0));
            }
            addBadge(meta, 'je-arrsearch-badge--age', formatAge(r.ageHours));
            addBadge(meta, 'je-arrsearch-badge--indexer', r.indexer);
            if (Array.isArray(r.languages) && r.languages.length) {
                addBadge(meta, 'je-arrsearch-badge--lang', r.languages.join(', '));
            }
            if (r.customFormatScore) {
                addBadge(meta, 'je-arrsearch-badge--cf', 'CF ' + r.customFormatScore);
            }
            info.appendChild(meta);

            // Rejection reasons (why the release wasn't auto-grabbed) — shown so the admin can
            // decide whether to force-grab anyway (arr allows grabbing rejected releases).
            if (rejected && Array.isArray(r.rejections) && r.rejections.length) {
                const rej = document.createElement('div');
                rej.className = 'je-arrsearch-release-rejections';
                const icon = document.createElement('span');
                icon.className = 'material-icons';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = 'block';
                rej.appendChild(icon);
                const txt = document.createElement('span');
                txt.textContent = r.rejections.join(' • ');
                rej.appendChild(txt);
                info.appendChild(rej);
            }

            const grab = document.createElement('button');
            grab.className = 'je-arrsearch-grab';
            grab.setAttribute('is', 'emby-button');
            grab.type = 'button';
            grab.innerHTML = '<span class="material-icons" aria-hidden="true">download</span>';
            grab.title = JE.t('arr_search_grab');
            grab.addEventListener('click', () => onGrab(grab, r, itemId));

            row.appendChild(info);
            row.appendChild(grab);
            return row;
        }

        /** Grabs a specific release; shows per-row progress and a result toast. */
        async function onGrab(button, release, itemId) {
            if (button.disabled) return;
            button.disabled = true;
            const original = button.innerHTML;
            button.innerHTML = '<span class="material-icons je-arrsearch-spin" aria-hidden="true">hourglass_empty</span>';

            try {
                const resp = await arrFetch('POST', '/JellyfinEnhanced/arr/search/grab', {
                    itemId,
                    guid: release.guid,
                    indexerId: release.indexerId
                });
                const data = await parseJson(resp);
                if (resp.ok) {
                    button.classList.add('je-arrsearch-grab--done');
                    button.innerHTML = '<span class="material-icons" aria-hidden="true">check</span>';
                    button.title = JE.t('arr_search_grabbed');
                    JE.toast(esc(JE.t('arr_search_grab_success')));
                } else {
                    button.disabled = false;
                    button.innerHTML = original;
                    JE.toast('⚠ ' + esc((data && data.error) || JE.t('arr_search_grab_failed')));
                }
            } catch (e) {
                console.error(`${logPrefix} grab failed`, e);
                button.disabled = false;
                button.innerHTML = original;
                JE.toast('⚠ ' + esc(JE.t('arr_search_grab_failed')));
            }
        }

        // ── Styles ───────────────────────────────────────────────────────────────
        function injectStyles() {
            const id = 'je-arrsearch-styles';
            if (document.getElementById(id)) return;
            const style = document.createElement('style');
            style.id = id;
            style.textContent = `
                .je-arrsearch-overlay {
                    position: fixed; inset: 0; z-index: 1000001;
                    background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    display: flex; align-items: center; justify-content: center; padding: 16px;
                }
                .je-arrsearch-dialog {
                    background: var(--je-arrsearch-bg, rgba(20,20,28,0.98));
                    color: var(--je-arrsearch-text, #fff);
                    border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;
                    width: 100%; max-width: 820px; max-height: 85vh;
                    display: flex; flex-direction: column;
                    box-shadow: 0 18px 48px rgba(0,0,0,0.6);
                }
                .je-arrsearch-header {
                    display: flex; align-items: center; gap: 12px;
                    padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.1);
                }
                .je-arrsearch-title {
                    flex: 1; font-size: 1.05em; font-weight: 600;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .je-arrsearch-instance {
                    margin-left: 10px; font-size: 0.75em; font-weight: 500;
                    color: rgba(255,255,255,0.6);
                    background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 10px;
                    vertical-align: middle;
                }
                .je-arrsearch-close {
                    flex: 0 0 auto; background: transparent; border: none; color: inherit;
                    cursor: pointer; opacity: 0.8; padding: 4px; border-radius: 50%;
                }
                .je-arrsearch-close:hover { opacity: 1; background: rgba(255,255,255,0.1); }
                .je-arrsearch-body {
                    overflow-y: auto; padding: 8px 12px 14px; flex: 1 1 auto;
                }
                .je-arrsearch-status {
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    gap: 14px; padding: 48px 20px; text-align: center; color: rgba(255,255,255,0.7);
                }
                .je-arrsearch-status-icon { font-size: 42px; opacity: 0.7; }
                .je-arrsearch-status-msg { font-size: 0.95em; max-width: 460px; }
                .je-arrsearch-spinner {
                    width: 38px; height: 38px; border-radius: 50%;
                    border: 3px solid rgba(255,255,255,0.15); border-top-color: rgba(255,255,255,0.85);
                    animation: je-arrsearch-spin 0.8s linear infinite;
                }
                .je-arrsearch-spin { animation: je-arrsearch-spin 0.8s linear infinite; }
                @keyframes je-arrsearch-spin { to { transform: rotate(360deg); } }
                .je-arrsearch-count {
                    font-size: 0.8em; color: rgba(255,255,255,0.55);
                    padding: 6px 8px 10px; letter-spacing: 0.02em;
                }
                .je-arrsearch-list { display: flex; flex-direction: column; gap: 6px; }
                .je-arrsearch-release {
                    display: flex; align-items: center; gap: 12px;
                    padding: 10px 12px; border-radius: 8px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.06);
                }
                .je-arrsearch-release:hover { background: rgba(255,255,255,0.07); }
                .je-arrsearch-release--rejected { opacity: 0.82; }
                .je-arrsearch-release-info { flex: 1 1 auto; min-width: 0; }
                .je-arrsearch-release-title {
                    font-size: 0.9em; font-weight: 500; margin-bottom: 5px;
                    word-break: break-word;
                }
                .je-arrsearch-release-meta { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
                .je-arrsearch-badge {
                    font-size: 0.72em; padding: 2px 7px; border-radius: 4px; font-weight: 600;
                    background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); white-space: nowrap;
                }
                .je-arrsearch-badge--quality { background: rgba(82,181,75,0.22); color: #7fd47a; }
                .je-arrsearch-badge--proto { background: rgba(90,140,255,0.2); color: #9db6ff; }
                .je-arrsearch-badge--peers { background: rgba(229,160,13,0.18); color: #e5b93d; }
                .je-arrsearch-badge--cf { background: rgba(180,120,255,0.2); color: #c6a3ff; }
                .je-arrsearch-release-rejections {
                    display: flex; align-items: flex-start; gap: 5px; margin-top: 6px;
                    font-size: 0.75em; color: #e58a8a;
                }
                .je-arrsearch-release-rejections .material-icons { font-size: 15px; flex: 0 0 auto; margin-top: 1px; }
                .je-arrsearch-grab {
                    flex: 0 0 auto; width: 42px; height: 42px; border-radius: 8px;
                    background: rgba(82,181,75,0.85); border: none; color: #fff; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                    transition: background 0.15s;
                }
                .je-arrsearch-grab:hover { background: rgba(82,181,75,1); }
                .je-arrsearch-grab:disabled { cursor: default; opacity: 0.85; }
                .je-arrsearch-grab--done { background: rgba(82,181,75,0.4); }
                @media (max-width: 600px) {
                    .je-arrsearch-dialog { max-height: 92vh; }
                    .je-arrsearch-grab { width: 38px; height: 38px; }
                }
            `;
            document.head.appendChild(style);
        }
    };
})(window.JellyfinEnhanced);
