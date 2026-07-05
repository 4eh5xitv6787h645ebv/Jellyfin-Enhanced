// src/enhanced/bookmarks/library-page.ts
//
// Bookmarks Library View — registration into the unified Pages framework.
//
// The former standalone page container, show/hide, sidebar nav item,
// sidebar-rebuild watcher and 150 ms location poller are gone; the shared
// framework in src/enhanced/pages owns all of that. This file supplies the
// mount (which builds the `.sections.bookmarks` host the renderer targets) and
// the registration.

import { JE } from '../../globals';
import { renderIfSectionExists } from './library-render';

/** Build the page body's DOM skeleton — called once by the Pages shell. */
export function mount(content: HTMLElement): void {
    content.innerHTML =
        '<div class="content-primary je-bookmarks-page"><div class="sections bookmarks"></div></div>';
}

/** Render the bookmarks on every show so revisits reflect the latest state. */
export function onShow(): void {
    renderIfSectionExists();
}

/** Register the Bookmarks page with the unified Pages framework. */
export function registerBookmarksPage(): void {
    JE.pages?.register({
        id: 'bookmarks',
        route: '#/bookmarks',
        labelKey: 'bookmarks_library_title',
        labelFallback: 'Bookmarks',
        icon: 'bookmarks',
        isEnabled: () => !!JE.pluginConfig?.BookmarksEnabled,
        mount,
        onShow,
    });
}
