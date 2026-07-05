// src/arr/calendar/init.ts
// Calendar Page — registration into the unified Pages framework and the public
// JE.calendarPage surface (split from calendar-page.js).
//
// The standalone page container, navigation interception, sidebar nav item and
// the location-watcher are gone; the shared framework in src/enhanced/pages owns
// them. This file keeps the content: mount/unmount and the render entries the
// Plugin Pages embedded HTML (PluginPages/CalendarPage.html) calls.
// Public surface (frozen): JE.calendarPage + JE.initializeCalendarPage —
// called by js/plugin.js Stage 6 and PluginPages/CalendarPage.html.

import { JE } from '../arr-globals';
import { loadSettings, state } from './data';
import { renderPage } from './render-views';
import { injectStyles } from './styles';
import {
    goToday,
    handleEventClick,
    loadAllData,
    setDisplayMode,
    setViewMode,
    shiftPeriod,
    toggleFilter,
    toggleShowUnmonitored
} from './actions';

/** The frozen JE.calendarPage contract (js/plugin.js + PluginPages HTML). */
export interface CalendarPageApi {
    initialize: () => void;
    showPage: () => void;
    hidePage: () => void;
    refresh: () => Promise<void>;
    setViewMode: (mode: string) => void;
    shiftPeriod: (direction: string) => void;
    goToday: () => void;
    toggleFilter: (filterType: string) => void;
    toggleShowUnmonitored: () => void;
    renderPage: (targetContainer?: HTMLElement) => void;
    renderForCustomTab: (targetContainer?: HTMLElement) => void;
    injectStyles: () => void;
    loadSettings: () => void;
    handleEventClick: (e: MouseEvent) => void;
    setDisplayMode: (mode: string) => void;
}

const logPrefix = '🪼 Jellyfin Enhanced: Calendar Page:';

/** One-time guard for the calendar-event click delegate. */
let eventClickWired = false;

/**
 * Build the page body's DOM skeleton — called once by the Pages shell. Mirrors
 * the former createPageContainer inner markup so the existing styles apply
 * unchanged. Data load happens in onShow (every show).
 */
function mount(content: HTMLElement): void {
    injectStyles();
    content.innerHTML =
        '<div class="content-primary je-calendar-page">'
        + '<div id="je-calendar-container" style="padding-top: 5em; padding-left: 0.5em; padding-right: 0.5em;"></div>'
        + '</div>';
}

/** Activate on every show: mark visible, re-read settings, (re)load data. */
function onShow(): void {
    state.pageVisible = true;
    loadSettings();
    if (!state.isLoading) void loadAllData();
}

/** Mark the page hidden when it is left. */
function onHide(): void {
    state.pageVisible = false;
}

/**
 * Render content into a caller-provided container without page-state management —
 * used by the Plugin Pages embedded HTML.
 */
function renderForCustomTab(targetContainer?: HTMLElement): void {
    injectStyles();
    loadSettings();
    renderPage(targetContainer);
    void loadAllData();
}

/** Register the Calendar page with the unified Pages framework. */
function registerCalendarPage(): void {
    JE.pages?.register({
        id: 'calendar',
        route: '#/calendar',
        labelKey: 'calendar_title',
        labelFallback: 'Calendar',
        icon: 'calendar_today',
        isEnabled: () => !!JE.pluginConfig?.CalendarPageEnabled,
        mount,
        onShow,
        onHide,
    });
}

/** Initialize the calendar page module. */
function initialize(): void {
    console.log(`${logPrefix} Initializing calendar page module`);

    const config = JE.pluginConfig || {};
    if (!config.CalendarPageEnabled) {
        console.log(`${logPrefix} Calendar page is disabled`);
        return;
    }

    injectStyles();
    loadSettings();

    // Calendar-event clicks open the item — a content behavior, safe to bind once
    // globally (the handler no-ops unless the click landed on a calendar event).
    if (!eventClickWired) {
        document.addEventListener('click', handleEventClick);
        eventClickWired = true;
    }

    // Register with the unified Pages framework (nav + shell own container/routing).
    registerCalendarPage();

    console.log(`${logPrefix} Calendar page module initialized`);
}

// showPage/hidePage delegate to the shared Pages shell (kept on the surface for
// the Plugin Pages HTML and any external caller).
function showPage(): void {
    JE.pages?.show('calendar');
}
function hidePage(): void {
    JE.pages?.hide();
}

// Export to JE namespace
JE.calendarPage = {
    initialize,
    showPage,
    hidePage,
    refresh: loadAllData,
    setViewMode,
    shiftPeriod,
    goToday,
    toggleFilter,
    toggleShowUnmonitored,
    renderPage,
    renderForCustomTab,
    injectStyles,
    loadSettings,
    handleEventClick,
    setDisplayMode
};

JE.initializeCalendarPage = initialize;
