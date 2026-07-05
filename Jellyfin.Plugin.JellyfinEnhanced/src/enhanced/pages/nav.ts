// src/enhanced/pages/nav.ts
//
// The layout-aware nav injector — the "most native on every layout" core.
//
// Jellyfin 12 has three nav surfaces; JE renders its page entries wherever the
// host's own library links live for that layout:
//   • legacy layout        → sidebar drawer  (`.jellyfinEnhancedSection`)
//   • modern layout, mobile→ MUI hamburger drawer (same section, in the drawer)
//   • modern layout, desktop→ AppBar action tray (icon buttons) — the modern
//     layout has NO drawer at all, which is exactly why the old sidebar-only
//     injection was invisible there and users were forced into external modes.
//
// One ordered, idempotent injector drives all three (the four features used to
// carry a copy each, with fragile insertBefore chains for ordering). Order comes
// from the resolved page order (per-user → admin → registration); Plugin Pages
// integration, when active, suppresses the auto-native nav so pages aren't
// duplicated.

import { JE } from '../../globals';
import { onNavigate } from '../../core/navigation';
import { ensureInjected, onSidebarRebuild, onBodyMutation } from '../../core/dom-observer';
import { getSidebarContainer, getHeaderRightContainer } from '../helpers';
import { getOrderedEnabledPages } from './order';
import { pageLabel, onRegistryChange } from './registry';
import { showPage, getVisiblePageId } from './shell';
import type { JePageDefinition } from './types';

const SIDEBAR_ITEM_CLASS = 'je-page-nav-item';
const HEADER_BTN_CLASS = 'je-page-nav-btn';
const HEADER_GROUP_ID = 'je-pages-nav-group';
const ACTIVE_CLASS = 'je-page-nav-active';

/**
 * True when the Plugin Pages integration is active AND its main-menu links are
 * actually present (plugin installed + synced). We then suppress the auto-native
 * nav so pages aren't listed twice.
 */
function pluginPagesActive(): boolean {
    if (!(JE.pluginConfig as { PagesUsePluginPages?: boolean } | undefined)?.PagesUsePluginPages) return false;
    return !!document.querySelector(
        'a[is="emby-linkbutton"][data-itemid^="Jellyfin.Plugin.JellyfinEnhanced."][data-itemid$="Page"]'
    );
}

// PERF(R4): resolve the nav mode once per navigation. getSidebarContainer /
// getHeaderRightContainer perform layout reads (offsetParent); caching the
// resolution and invalidating it on navigation keeps mutation-driven reconciles
// (which call getNavMode repeatedly) from forcing reflow on every tick.
let cachedMode: 'sidebar' | 'header' | null = null;
onNavigate(() => { cachedMode = null; });

function getNavMode(): 'sidebar' | 'header' | null {
    if (cachedMode) return cachedMode;
    // Sidebar/drawer wins where present (legacy sidebar, or the mobile MUI drawer).
    if (getSidebarContainer()) { cachedMode = 'sidebar'; return cachedMode; }
    // Modern desktop: no drawer — fall back to the AppBar action tray.
    if (getHeaderRightContainer()) { cachedMode = 'header'; return cachedMode; }
    return null; // nothing ready yet — don't cache, retry on the next pass
}

/** Current active page id for nav highlighting. */
function activePageId(): string | null {
    return getVisiblePageId();
}

// --- Sidebar / drawer links -------------------------------------------------

function buildSidebarLink(def: JePageDefinition): HTMLAnchorElement {
    const link = document.createElement('a');
    link.setAttribute('is', 'emby-linkbutton');
    link.className = `navMenuOption lnkMediaFolder emby-button ${SIDEBAR_ITEM_CLASS}`;
    link.href = '#';
    link.dataset.jePageId = def.id;

    const icon = document.createElement('span');
    icon.className = 'navMenuOptionIcon material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = def.icon;
    link.appendChild(icon);

    const text = document.createElement('span');
    text.className = 'sectionName navMenuOptionText';
    text.textContent = pageLabel(def);
    link.appendChild(text);

    link.addEventListener('click', (e) => {
        e.preventDefault();
        showPage(def.id);
    });
    return link;
}

/** Reorder the section's page links to match `pages`, only when they differ. */
function orderSidebarLinks(section: HTMLElement, pages: JePageDefinition[]): void {
    const current = Array.from(section.querySelectorAll<HTMLElement>(`.${SIDEBAR_ITEM_CLASS}`))
        .map((el) => el.dataset.jePageId || '');
    const desired = pages.map((p) => p.id);
    if (current.length === desired.length && current.every((id, i) => id === desired[i])) return;
    // Re-append in resolved order (keeps the section header + Enhanced Panel link
    // where they are; page links collect after them in order).
    for (const def of pages) {
        const el = section.querySelector<HTMLElement>(`.${SIDEBAR_ITEM_CLASS}[data-je-page-id="${def.id}"]`);
        if (el) section.appendChild(el);
    }
}

function reconcileSidebar(): void {
    // Header-mode / Plugin-Pages / not-ready: strip any sidebar links we own.
    if (pluginPagesActive() || getNavMode() !== 'sidebar') {
        document.querySelectorAll(`.${SIDEBAR_ITEM_CLASS}`).forEach((el) => el.remove());
        return;
    }
    const section = document.querySelector<HTMLElement>('.jellyfinEnhancedSection');
    if (!section) return; // created by settings-panel entry-points; retry on rebuild

    const pages = getOrderedEnabledPages();
    const wanted = new Set(pages.map((p) => p.id));

    section.querySelectorAll<HTMLElement>(`.${SIDEBAR_ITEM_CLASS}`).forEach((el) => {
        if (!wanted.has(el.dataset.jePageId || '')) el.remove();
    });
    for (const def of pages) {
        if (!section.querySelector(`.${SIDEBAR_ITEM_CLASS}[data-je-page-id="${def.id}"]`)) {
            section.appendChild(buildSidebarLink(def));
        }
    }
    orderSidebarLinks(section, pages);
    markActive();
}

// --- Header tray icon buttons (modern desktop) ------------------------------

function buildHeaderButton(def: JePageDefinition): HTMLElement {
    // Native MUI AppBar action-button markup via the UI kit; legacy header
    // classes keep it grouped with the other tray buttons on both layouts.
    const btn = JE.core.ui!.muiIconButton({
        icon: def.icon,
        title: pageLabel(def),
        className: `headerButton headerButtonRight paper-icon-button-light ${HEADER_BTN_CLASS}`,
        onClick: () => showPage(def.id),
    });
    btn.dataset.jePageId = def.id;
    return btn;
}

function reconcileHeader(group: HTMLElement): void {
    const pages = getOrderedEnabledPages();
    const wanted = new Set(pages.map((p) => p.id));

    group.querySelectorAll<HTMLElement>(`.${HEADER_BTN_CLASS}`).forEach((el) => {
        if (!wanted.has(el.dataset.jePageId || '')) el.remove();
    });
    pages.forEach((def, idx) => {
        let btn = group.querySelector<HTMLElement>(`.${HEADER_BTN_CLASS}[data-je-page-id="${def.id}"]`);
        if (!btn) {
            btn = buildHeaderButton(def);
            group.appendChild(btn);
            // PERF(R1): the tray painted long before JE booted; first appearance
            // expands from width 0 rather than snap-shifting the native buttons.
            JE.core.ui!.expandIn(btn);
        }
        // Flex order is a compositor-only reorder — no reflow of siblings' DOM.
        btn.style.order = String(idx);
    });
    markActive();
}

const headerInjector = ensureInjected(
    HEADER_GROUP_ID,
    () => (!pluginPagesActive() && getNavMode() === 'header' ? getHeaderRightContainer() : null),
    (anchor) => {
        let group = document.getElementById(HEADER_GROUP_ID);
        if (!group) {
            group = document.createElement('div');
            group.id = HEADER_GROUP_ID;
            group.style.cssText = 'display:flex;align-items:center;';
        }
        anchor.appendChild(group);
        reconcileHeader(group);
        return group;
    },
    { headerTray: true }
);

// --- Active-state highlight -------------------------------------------------

function markActive(): void {
    const active = activePageId();
    document.querySelectorAll<HTMLElement>(`.${SIDEBAR_ITEM_CLASS}, .${HEADER_BTN_CLASS}`).forEach((el) => {
        const on = el.dataset.jePageId === active;
        el.classList.toggle(ACTIVE_CLASS, on);
        if (on) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
    });
}

// --- Public reconcile + wiring ----------------------------------------------

/** Re-evaluate both nav surfaces (idempotent). */
export function refreshNav(): void {
    const suppressed = pluginPagesActive();
    const mode = getNavMode();

    // Remove nodes that don't belong in the current mode (or at all under Plugin
    // Pages), so a layout flip or a config change never leaves a stale entry.
    if (suppressed || mode !== 'header') document.getElementById(HEADER_GROUP_ID)?.remove();
    if (suppressed || mode !== 'sidebar') document.querySelectorAll(`.${SIDEBAR_ITEM_CLASS}`).forEach((el) => el.remove());

    if (suppressed) return;
    if (mode === 'header') {
        const group = document.getElementById(HEADER_GROUP_ID);
        if (group) reconcileHeader(group);
        else headerInjector.run();
    } else if (mode === 'sidebar') {
        reconcileSidebar();
    }
}

let wired = false;

/** Wire the nav injector exactly once. */
export function initPageNav(): void {
    if (wired) return;
    wired = true;

    injectPagesNavCss();

    // Sidebar/drawer rebuilds (Jellyfin re-renders the drawer) — cheap shared check.
    onSidebarRebuild('je-pages-nav', reconcileSidebar);
    // Structural body mutations (header tray remount etc.) — the header injector
    // already rides the multiplexed observer; this keeps the group in sync.
    onBodyMutation('je-pages-nav', () => { if (getNavMode() === 'header') refreshNav(); });
    // Every navigation: re-resolve mode + active highlight.
    onNavigate(() => { refreshNav(); });
    // A late feature registering (or config hot-reload) re-renders the nav.
    onRegistryChange(refreshNav);
    // The layout flips between the mobile MUI drawer and the desktop AppBar tray
    // on a viewport resize with NO navigation, so the per-nav mode cache would go
    // stale (drawer left with no links). Invalidate + re-render on resize (debounced).
    let resizeTimer: number | null = null;
    window.addEventListener('resize', () => {
        if (resizeTimer) return;
        resizeTimer = window.setTimeout(() => {
            resizeTimer = null;
            cachedMode = null;
            refreshNav();
        }, 200);
    });

    refreshNav();
}

function injectPagesNavCss(): void {
    JE.core.ui!.injectCss('je-pages-nav-css', `
        .${SIDEBAR_ITEM_CLASS}.${ACTIVE_CLASS} { background: rgba(255,255,255,0.08); }
        .${HEADER_BTN_CLASS}.${ACTIVE_CLASS} { color: var(--jf-palette-primary-main, inherit); }
    `);
}
