// /js/extras/active-streams.js
// Shows a live Active Streams counter in the Jellyfin header.

(function (JE) {
    'use strict';

    const LOG = '🪼 Jellyfin Enhanced:';
    const internal = JE.internals.activeStreams;
    const broadcast = internal.createBroadcast();
    const renderPanel = sessions => internal.view.renderPanel(sessions, _lastUpdated);

    // ── State ────────────────────────────────────────────────────────────────
    let _panelOpen = false;
    let _observer = null;
    let _lifecycle = null;
    let _outsideClickListener = null;
    let _lastUpdated = null;

    // ── Theme-aware colours ──────────────────────────────────────────────────
    const getAccentColor = () => {
        try {
            return JE?.themer?.getThemeVariables?.()?.primaryAccent || '#00a4dc';
        } catch (_) {
            return '#00a4dc';
        }
    };

    const applyThemeVars = () => {
        document.documentElement.style.setProperty('--je-as-accent', getAccentColor());
    };

    // ── Visibility check ─────────────────────────────────────────────────────
    // Admins always see it. Non-admins only if ActiveStreamsAllUsers is enabled.
    const isVisible = () => {
        const isAdmin = JE?.helpers?.isAdmin() === true;
        if (isAdmin) return true;
        return JE?.pluginConfig?.ActiveStreamsAllUsers === true;
    };

    // ── API — uses plugin proxy so non-admins don't need Sessions permission ─
    const fetchSessions = async () => {
        try {
            // Core throws on non-OK responses — caught below, returning null
            // exactly like the old !resp.ok branch.
            return await JE.core.api.plugin('/active-streams/sessions');
        } catch (_) {
            return null;
        }
    };

    // Bumped by destroy(): in-flight session fetches and header-inject retry
    // timers from a torn-down (previous user's) instance must not touch the
    // DOM a re-initialized instance now owns.
    let _generation = 0;

    // ── Counter updater ──────────────────────────────────────────────────────
    const updateCounter = async () => {
        const startGeneration = _generation;
        const sessions = await fetchSessions();
        if (startGeneration !== _generation) return; // torn down / user switched mid-fetch
        _lastUpdated = new Date();
        const btn = document.getElementById('je-active-streams');
        if (!btn) return;

        const iconEl = btn.querySelector('.je-as-icon');
        const supEl = btn.querySelector('.je-as-sup');
        btn.classList.remove('je-as-active', 'je-as-err');

        if (!sessions) {
            iconEl.textContent = 'cast';
            supEl.textContent = '';
            btn.classList.add('je-as-err');
            btn.title = 'Failed to fetch sessions';
        } else {
            const playing = sessions.filter(s => s.NowPlayingItem && !s.PlayState?.IsPaused);
            const paused  = sessions.filter(s => s.NowPlayingItem &&  s.PlayState?.IsPaused);
            const total   = playing.length + paused.length;

            if (total === 0) {
                // Nothing playing — show a neutral "ready" icon, no badge
                iconEl.textContent = 'play_circle';
                supEl.textContent = '';
                btn.title = 'No active streams';
            } else if (playing.length === 0) {
                // Everything paused
                iconEl.textContent = 'pause_circle';
                supEl.textContent = `${total}`;
                btn.classList.add('je-as-active');
                btn.title = `${total} stream${total > 1 ? 's' : ''} paused`;
            } else if (total === 1) {
                // Single active stream
                iconEl.textContent = 'person';
                supEl.textContent = '1';
                btn.classList.add('je-as-active');
                btn.title = '1 active stream';
            } else {
                // Multiple streams — show playing count, note paused in tooltip
                iconEl.textContent = 'group';
                supEl.textContent = `${total}`;
                btn.classList.add('je-as-active');
                const pausedNote = paused.length ? `, ${paused.length} paused` : '';
                btn.title = `${playing.length} playing${pausedNote}`;
            }
        }

        if (_panelOpen) renderPanel(sessions);
    };

    // ── Panel ────────────────────────────────────────────────────────────────
    let _headerPanelTop = '';

    const togglePanel = () => {
        const panel = document.getElementById('je-active-streams-panel');
        if (!panel) return;
        _panelOpen = !_panelOpen;
        if (_panelOpen) {
            const btn = document.getElementById('je-active-streams');
            panel.style.top = btn?.closest('.osdHeader, .videoOsd-appBar')
                ? (btn.getBoundingClientRect().bottom + 2) + 'px'
                : _headerPanelTop;
        }
        panel.classList.toggle('je-as-panel-open', _panelOpen);
        if (_panelOpen) updateCounter();
    };

    const injectPanel = () => {
        if (document.getElementById('je-active-streams-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'je-active-streams-panel';

        const header = document.createElement('div');
        header.className = 'je-as-panel-header';

        const titleEl = document.createElement('span');
        titleEl.className = 'je-as-panel-title';
        titleEl.textContent = 'Sessions';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'je-as-panel-close';
        closeBtn.setAttribute('aria-label', 'Close sessions panel');
        const closeIcon = document.createElement('span');
        closeIcon.className = 'material-icons';
        closeIcon.style.fontSize = '18px';
        closeIcon.textContent = 'close';
        closeBtn.appendChild(closeIcon);
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            _panelOpen = false;
            panel.classList.remove('je-as-panel-open');
        });

        header.appendChild(titleEl);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'je-as-panel-body';

        panel.appendChild(header);
        panel.appendChild(body);
        document.body.appendChild(panel);

        const skinHeader = document.querySelector('.skinHeader');
        const skinHeaderHeight = skinHeader?.getBoundingClientRect().height || 0;
        if (skinHeaderHeight > 0) {
            panel.style.top = (skinHeaderHeight + 2) + 'px';
            _headerPanelTop = panel.style.top;
        } else {
            // Jellyfin 12 experimental layout: the legacy .skinHeader is hidden,
            // measure the new MUI AppBar toolbar instead.
            const appBar = document.querySelector('.MuiAppBar-root');
            if (appBar) {
                panel.style.top = (appBar.getBoundingClientRect().height + 2) + 'px';
                _headerPanelTop = panel.style.top;
            }
        }

        // Refresh button — available to all users who can see the panel
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'je-as-refresh-btn';
        refreshBtn.setAttribute('aria-label', 'Refresh sessions');
        refreshBtn.title = 'Refresh';
        const refreshIcon = document.createElement('span');
        refreshIcon.className = 'material-icons';
        refreshIcon.style.fontSize = '18px';
        refreshIcon.textContent = 'refresh';
        refreshBtn.appendChild(refreshIcon);
        refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshBtn.classList.add('je-as-refreshing');
            refreshBtn.addEventListener('animationend', () => refreshBtn.classList.remove('je-as-refreshing'), { once: true });
            updateCounter();
        });
        header.insertBefore(refreshBtn, closeBtn);

        // Inject broadcast button for admins only
        if (JE?.helpers?.isAdmin() === true) {
            broadcast.inject(panel);
        }

        _outsideClickListener = (e) => {
            const btn = document.getElementById('je-active-streams');
            if (_panelOpen && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
                _panelOpen = false;
                panel.classList.remove('je-as-panel-open');
            }
        };
        document.addEventListener('click', _outsideClickListener);
    };

    // ── Header button ────────────────────────────────────────────────────────
    const tryInjectHeader = (attempts = 0, generation = _generation) => {
        if (generation !== _generation) return; // torn down while retrying
        if (document.getElementById('je-active-streams')) return;
        if (attempts > 20) return;

        const headerRight = JE.isVideoPage?.() ? getOsdHeaderContainer() : JE.helpers.getHeaderButtonTray();
        if (!headerRight) {
            setTimeout(() => tryInjectHeader(attempts + 1, generation), 500);
            return;
        }
        // The shared tray may have just restored this button after a remount.
        if (document.getElementById('je-active-streams')) return;

        const btn = document.createElement('button');
        btn.id = 'je-active-streams';
        btn.type = 'button';
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.className = 'headerButton headerButtonRight paper-icon-button-light';
        btn.title = 'No active streams';
        btn.dataset.headerLabel = JE.t('activity_section_active_streams');

        const icon = document.createElement('i');
        icon.className = 'material-icons je-as-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'play_circle';

        const sup = document.createElement('span');
        sup.className = 'je-as-sup';
        sup.setAttribute('aria-hidden', 'true');

        btn.appendChild(icon);
        btn.appendChild(sup);
        btn.addEventListener('click', (e) => { e.stopPropagation(); togglePanel(); });

        headerRight.insertBefore(btn, headerRight.firstChild);
        syncPlacementClasses(btn);
        injectPanel();
        applyThemeVars();
        updateCounter(); // Initial fetch; opening the panel and Refresh fetch on demand.
    };

    const getOsdHeaderContainer = () => {
        const bar = document.querySelector('.videoOsd-appBar');
        if (bar) {
            const menuButtons = bar.querySelectorAll('[aria-controls="app-sync-play-menu"], [aria-controls="app-remote-play-menu"]');
            const visible = [...menuButtons].find((el) => el.offsetParent !== null) || menuButtons[0];
            return visible?.parentElement || null;
        }
        return document.querySelector('.skinHeader.osdHeader .headerRight');
    };

    // videoosd.scss hides every .headerButton in the player bar except back/cast/syncplay.
    const syncPlacementClasses = (btn) => {
        const inOsd = !!btn.closest('.osdHeader, .videoOsd-appBar');
        btn.classList.toggle('je-as-in-osd', inOsd);
        btn.classList.toggle('headerButton', !inOsd);
        btn.classList.toggle('headerButtonRight', !inOsd);
    };

    // ── Observer ─────────────────────────────────────────────────────────────
    const startObserver = () => {
        if (_observer) return;
        const callback = () => {
            if (!document.getElementById('je-active-streams')) tryInjectHeader(0);
            else syncPlacementClasses(document.getElementById('je-active-streams'));
        };
        if (JE?.helpers?.onBodyMutation) {
            _observer = JE.helpers.onBodyMutation('active-streams', callback);
        } else {
            const mo = new MutationObserver(callback);
            mo.observe(document.body, { childList: true, subtree: true });
            _observer = { unsubscribe() { mo.disconnect(); } };
        }
    };

    const stopObserver = () => {
        if (_observer) { _observer.unsubscribe(); _observer = null; }
    };

    // ── Public API ───────────────────────────────────────────────────────────
    JE.activeStreams = {
        initialize() {
            if (!JE?.pluginConfig?.ActiveStreamsEnabled) {
                return;
            }
            if (!isVisible()) {
                console.log(`${LOG} Active Streams: skipping — not visible for this user.`);
                return;
            }
            console.log(`${LOG} Active Streams: initializing.`);
            internal.injectStyles();
            startObserver();
            tryInjectHeader(0);
            // Re-apply theme vars on every navigation (hashchange, popstate
            // and pushState — the old raw hashchange listener missed the
            // latter). Tracked via a lifecycle handle so destroy() removes it.
            _lifecycle = JE.core.lifecycle.register('active-streams');
            _lifecycle.track(JE.core.navigation.onNavigate(() => applyThemeVars()));
        },

        destroy() {
            console.log(`${LOG} Active Streams: destroying.`);
            _generation++; // invalidate in-flight fetches and header-inject retries
            stopObserver();
            if (_lifecycle) { _lifecycle.teardown(); _lifecycle = null; }
            if (_outsideClickListener) { document.removeEventListener('click', _outsideClickListener); _outsideClickListener = null; }
            broadcast.destroy();
            document.getElementById('je-active-streams')?.remove();
            document.getElementById('je-active-streams-panel')?.remove();
            document.getElementById('je-active-streams-styles')?.remove();
            _panelOpen = false;
        }
    };

    // The panel shows other users' now-playing sessions (admin view) and its
    // visibility gate was evaluated for the OLD user — tear everything down
    // on a user switch and re-initialize once the new user's data (incl. the
    // admin policy) is loaded, so a non-admin never inherits the admin panel.
    JE.session?.onUserChange('active-streams', () => {
        JE.activeStreams.destroy();
    });
    document.addEventListener('je:user-data-loaded', () => {
        JE.activeStreams.initialize();
    });

})(window.JellyfinEnhanced);
