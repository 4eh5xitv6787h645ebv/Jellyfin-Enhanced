// src/enhanced/pages/index.ts
//
// Unified Pages framework barrel. Boots the shell + nav injector and exposes the
// `JE.pages` facade that the four page features (bookmarks, requests, calendar,
// hidden-content) register into. Loads early in the enhanced barrel so the
// facade exists before any feature module evaluates.

import { JE } from '../../globals';
import { registerPage } from './registry';
import { getOrderedEnabledPages } from './order';
import { initPageShell, showPage, hidePage } from './shell';
import { initPageNav, refreshNav } from './nav';
import type { PagesApi } from './types';

const pages: PagesApi = {
    register: registerPage,
    show: showPage,
    hide: hidePage,
    refresh: refreshNav,
    list: () => getOrderedEnabledPages().map((p) => p.id),
};

JE.pages = pages;

initPageShell();
initPageNav();

// Config hot-reload (live-config dispatches this after merging fresh config):
// re-evaluate nav entries so enable/disable and order changes apply without a
// reload. The shell's own onNavigate hook re-checks routes.
window.addEventListener('je:config-changed', () => {
    try {
        refreshNav();
    } catch (err) {
        console.error('🪼 Jellyfin Enhanced: Pages: refresh on config change failed:', err);
    }
});

export type { JePageDefinition, PagesApi } from './types';
