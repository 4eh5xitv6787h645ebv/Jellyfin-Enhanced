// src/enhanced/bookmarks/library-init.ts
//
// Bookmarks Library View — initialization / boot.
//
// Registers the Bookmarks page with the unified Pages framework and wires the
// content hooks (view events + the je-bookmarks-updated re-render) that both the
// Pages shell and the Plugin Pages embedded HTML rely on. Navigation, the
// standalone container, ordering, the sidebar/header nav entry and show/hide are
// all owned by src/enhanced/pages now.

import { JE } from '../../globals';
import { registerBookmarksPage } from './library-page';
import { renderIfSectionExists, hookViewEvents } from './library-render';

if (JE.pluginConfig?.BookmarksEnabled) {
    const logPrefix = '🪼 Jellyfin Enhanced: Bookmarks Library:';

    const init = (): void => {
        // Content wiring — used by the Pages shell mount and the Plugin Pages embed.
        hookViewEvents();
        document.addEventListener('je-bookmarks-updated', renderIfSectionExists);

        // Register with the unified Pages framework (nav + shell own the rest).
        registerBookmarksPage();

        // Render immediately if a bookmarks container is already present (Plugin
        // Pages embed); a no-op otherwise.
        renderIfSectionExists();
        console.log(`${logPrefix} ✓ Ready`);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}
