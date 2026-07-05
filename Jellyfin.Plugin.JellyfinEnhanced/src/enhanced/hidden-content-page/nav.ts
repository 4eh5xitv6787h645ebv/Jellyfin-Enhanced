// src/enhanced/hidden-content-page/nav.ts
//
// Hidden Content Page — registration into the unified Pages framework plus the
// content render entries the Plugin Pages embedded HTML calls.
//
// The former standalone-page container, show/hide, capture-phase navigation
// interception, sidebar nav item, sidebar-rebuild watcher and 150 ms location
// poller all lived here; they are gone. The shared framework in
// src/enhanced/pages owns the container, ordering, layout-aware nav entry,
// show/hide and routing now — this file just supplies the mount/unmount and the
// registration.

import { JE } from '../../globals';
import { state } from './state';
import { injectStyles } from './styles';
import { renderPage } from './render';

/** Build the page body's DOM skeleton — called once by the Pages shell. */
export function mount(content: HTMLElement): void {
    injectStyles();
    content.innerHTML =
        '<div class="content-primary je-hidden-content-page">'
        + '<div id="je-hidden-content-container" style="padding-top: 5em; padding-left: 0.5em; padding-right: 0.5em;"></div>'
        + '</div>';
}

/** Render (fresh) on every show — onHide reset the state, so revisits repaint. */
export function onShow(): void {
    const container = document.getElementById('je-hidden-content-container');
    if (container) renderPage(container);
}

/**
 * Reset the admin cross-user view when the page is left, so re-opening starts on
 * the admin's own list rather than a stale "Viewing: <user>" snapshot. Bumping
 * adminLoadToken invalidates any in-flight cross-user fetch so a late completion
 * can't repopulate adminItems after the page has been left.
 */
export function onHide(): void {
    state.searchQuery = '';
    state.adminLoadToken++;
    state.selectedAdminUserId = null;
    state.adminEditMode = false;
    state.adminItems = null;
    state.adminItemsUserId = null;
    state.adminLoadError = false;
    state.adminUserName = '';
    state.scopedOnly = false;
    state.adminUsers = null;
    state.adminUsersLoading = false;
}

/**
 * Render content into a caller-provided container without any page-state
 * management — used by the Plugin Pages embedded HTML (HiddenContentPage.html).
 */
export function renderForCustomTab(targetContainer?: HTMLElement): void {
    injectStyles();
    renderPage(targetContainer);
}

/** Register the Hidden Content page with the unified Pages framework. */
export function registerHiddenContentPage(): void {
    JE.pages?.register({
        id: 'hidden-content',
        route: '#/hidden-content',
        labelKey: 'hidden_content_manage_title',
        labelFallback: 'Hidden Content',
        icon: 'visibility_off',
        isEnabled: () => !!JE.pluginConfig?.HiddenContentEnabled,
        mount,
        onShow,
        onHide,
    });
}
