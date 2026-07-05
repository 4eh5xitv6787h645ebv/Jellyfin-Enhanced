// src/arr/requests/init.ts
// Requests Page — registration into the unified Pages framework, data polling,
// the live-push nudge and the public JE.downloadsPage surface (split from
// requests-page.js).
//
// The standalone page container, navigation interception, sidebar nav item and
// the location-watcher are gone; the shared framework in src/enhanced/pages owns
// them. This file keeps the content: mount/unmount, polling, the live nudge and
// the render entries the Plugin Pages embedded HTML (PluginPages/DownloadsPage.html)
// calls.
// Public surface (frozen): JE.downloadsPage + JE.initializeDownloadsPage —
// called by js/plugin.js Stage 6 and PluginPages/DownloadsPage.html.

import { register as registerLifecycle } from '../../core/lifecycle';
import { LIVE } from '../../core/live';
import { JE } from '../arr-globals';
import { clearAvatarObjectUrlCache, loadAllData, state } from './data';
import { renderPage } from './render';
import { injectStyles } from './styles';
import {
    filterDownloads,
    filterIssues,
    filterRequests,
    nextIssuesPage,
    nextPage,
    prevIssuesPage,
    prevPage,
    searchDownloads
} from './actions';
import type { RequestsPageState } from './data';

/** The frozen JE.downloadsPage contract (js/plugin.js + PluginPages HTML). */
export interface DownloadsPageApi {
    initialize: () => void;
    showPage: () => void;
    hidePage: () => void;
    refresh: () => Promise<void>;
    startPolling: () => void;
    stopPolling: () => void;
    filterDownloads: (status: string) => void;
    searchDownloads: (query: string) => void;
    filterRequests: (filter: string) => void;
    filterIssues: (filter: string) => void;
    nextPage: () => void;
    prevPage: () => void;
    nextIssuesPage: () => void;
    prevIssuesPage: () => void;
    renderPage: (targetContainer?: HTMLElement) => void;
    renderForCustomTab: (targetContainer?: HTMLElement) => void;
    injectStyles: () => void;
    _state: RequestsPageState;
    /** Written by PluginPages/DownloadsPage.html at runtime. */
    _pluginPagePollTimer?: ReturnType<typeof setInterval>;
    _pluginPageVisible?: boolean;
}

// Feature-scoped resource registry (poll interval, unsubscribe fns).
const lifecycle = registerLifecycle('arr-requests-page');

const logPrefix = '🪼 Jellyfin Enhanced: Requests Page:';

/** Visible in any content mode: the shared page shell or the Plugin Pages embed. */
function isRequestsVisible(): boolean {
    return !!(state.pageVisible || state._pluginPageVisible);
}

/**
 * Build the page body's DOM skeleton — called once by the Pages shell. Mirrors
 * the former createPageContainer inner markup so the existing styles apply
 * unchanged. Data load + polling happen in onShow (every show).
 */
function mount(content: HTMLElement): void {
    injectStyles();
    content.innerHTML =
        '<div class="content-primary je-downloads-page">'
        + '<div id="je-downloads-container" style="padding-top: 5em;"></div>'
        + '</div>';
}

/** Activate on every show: mark visible, (re)load and start polling. */
function onShow(): void {
    state.pageVisible = true;
    if (!state.isLoading) void loadAllData();
    // startPolling is idempotent (stops first) and independent of an in-flight
    // load — hoist it out of the isLoading guard so a revisit mid-load still
    // (re)arms the poll instead of leaving auto-refresh off until the next visit.
    startPolling();
}

/** Deactivate on every hide: stop the page's work. */
function onHide(): void {
    state.pageVisible = false;
    clearAvatarObjectUrlCache(true);
    stopPolling();
}

// Debounce timer for the live-push refresh (LibraryChanged can arrive batched).
let liveNudgeTimer: ReturnType<typeof setTimeout> | null = null;
let liveNudgeWired = false;

/**
 * Subscribe to the live hub so a library push refreshes the requests/downloads
 * view immediately. Idempotent; the poll interval remains the fallback for
 * Seerr-only state changes.
 */
function setupLiveNudge(): void {
    if (liveNudgeWired) return;
    const live = JE.core?.live;
    if (!live) return; // hub unavailable (older host) — polling still covers it
    liveNudgeWired = true;

    const unsub = live.on(LIVE.LIBRARY_CHANGED, () => {
        if (!isRequestsVisible() || state.isLoading) return;
        if (document.visibilityState === 'hidden') return;
        if (liveNudgeTimer) clearTimeout(liveNudgeTimer);
        liveNudgeTimer = setTimeout(() => {
            liveNudgeTimer = null;
            if (!state.isLoading) void loadAllData();
        }, 500);
    });

    lifecycle.track(unsub);
    lifecycle.onTeardown(() => {
        if (liveNudgeTimer) {
            clearTimeout(liveNudgeTimer);
            liveNudgeTimer = null;
        }
    });
}

/**
 * Start polling for updates. Page-scoped (only while visible), visibility-gated
 * (skips while the tab is hidden) and push-nudged (see setupLiveNudge) — PERF R5.
 */
function startPolling(): void {
    stopPolling();
    const config = JE.pluginConfig || {};
    if (!config.DownloadsPagePollingEnabled) return;

    const intervalSeconds = config.DownloadsPollIntervalSeconds !== undefined
        ? config.DownloadsPollIntervalSeconds
        : 30;

    if (!isRequestsVisible()) return;

    const interval = intervalSeconds * 1000;
    // Tracked with the feature lifecycle so teardownAll() can dispose it.
    state.pollTimer = lifecycle.track(setInterval(() => {
        // Stop entirely once the page is no longer visible in any mode (covers
        // Plugin Pages navigation-away where unmount() is never called).
        if (!isRequestsVisible()) {
            stopPolling();
            return;
        }
        if (document.visibilityState === 'hidden') return;
        if (!state.isLoading) void loadAllData();
    }, interval));
}

/** Stop polling. */
function stopPolling(): void {
    if (state.pollTimer) {
        lifecycle.untrack(state.pollTimer);
        clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

/**
 * Render content into a caller-provided container without page-state management —
 * used by the Plugin Pages embedded HTML.
 */
function renderForCustomTab(targetContainer?: HTMLElement): void {
    injectStyles();
    renderPage(targetContainer);
    void loadAllData();
    startPolling();
}

/** Register the Requests page with the unified Pages framework. */
function registerRequestsPage(): void {
    JE.pages?.register({
        id: 'requests',
        route: '#/downloads',
        labelKey: 'requests_requests',
        labelFallback: 'Requests',
        icon: 'download',
        isEnabled: () => !!JE.pluginConfig?.DownloadsPageEnabled,
        mount,
        onShow,
        onHide,
    });
}

/** Initialize the requests page module. */
function initialize(): void {
    console.log(`${logPrefix} Initializing requests page module`);

    const config = JE.pluginConfig || {};
    if (!config.DownloadsPageEnabled) {
        console.log(`${logPrefix} Requests page is disabled`);
        return;
    }

    injectStyles();

    // Live nudge: a completed download landing in the Jellyfin library fires a
    // LibraryChanged push — refresh at once instead of waiting for the next poll.
    // The interval poll stays as the fallback (Seerr request-state transitions are
    // not pushed over the Jellyfin socket).
    setupLiveNudge();

    // Register with the unified Pages framework (nav + shell own container/routing).
    registerRequestsPage();

    console.log(`${logPrefix} Requests page module initialized`);
}

// showPage/hidePage delegate to the shared Pages shell (kept on the surface for
// the Plugin Pages HTML and any external caller).
function showPage(): void {
    JE.pages?.show('requests');
}
function hidePage(): void {
    JE.pages?.hide();
}

// Export to JE namespace
JE.downloadsPage = {
    initialize,
    showPage,
    hidePage,
    refresh: loadAllData,
    startPolling,
    stopPolling,
    filterDownloads,
    searchDownloads,
    filterRequests,
    filterIssues,
    nextPage,
    prevPage,
    nextIssuesPage,
    prevIssuesPage,
    renderPage,
    renderForCustomTab,
    injectStyles,
    _state: state
};

JE.initializeDownloadsPage = initialize;
