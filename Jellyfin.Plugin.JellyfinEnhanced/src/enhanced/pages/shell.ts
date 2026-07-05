// src/enhanced/pages/shell.ts
//
// The page shell: ONE standalone-page container manager for every registered
// JE page. It owns the `.page.mainAnimatedPage` wrapper, show/hide, the
// viewshow/viewhide/pageshow dispatch Jellyfin's chrome listens for, and route
// interception. Each of the four page features used to carry a near-verbatim
// copy of all this (plus a 150 ms location-polling loop); it now lives here
// once and is driven by navigation events — no polling (PERF R5).

import { onNavigate } from '../../core/navigation';
import { getPage, getRegisteredPages, onRegistryChange } from './registry';
import type { JePageDefinition } from './types';

const logPrefix = '🪼 Jellyfin Enhanced: Pages:';

/** id of the JE page currently shown, or null. */
let visibleId: string | null = null;
/** The native Jellyfin page we hid to show ours (restored on leave). */
let previousPage: HTMLElement | null = null;
/** Page ids whose body content has been mounted. */
const mounted = new Set<string>();

/** DOM id of a page's outer wrapper. */
function pageElementId(id: string): string {
    return `je-page-${id}`;
}

/** True when an element is one of our page wrappers. */
function isOurPage(el: Element | null): boolean {
    return !!el && el.id.startsWith('je-page-');
}

/** The visible native (non-JE) `.mainAnimatedPage`, if any. */
function findActiveNativePage(): HTMLElement | null {
    const pages = document.querySelectorAll<HTMLElement>('.mainAnimatedPage:not(.hide)');
    for (const page of pages) {
        if (!isOurPage(page)) return page;
    }
    return null;
}

/**
 * Create (or return) a page's wrapper. Mirrors each feature's former
 * createPageContainer so their existing styles apply unchanged: the feature's
 * `mount` fills the `[data-role=content]` element with its `.content-primary …`
 * markup. Appends to `.mainAnimatedPages` (the legacy view host, present on both
 * layouts) — falling back to body only if that host isn't ready yet.
 */
function ensureContainer(def: JePageDefinition): HTMLElement {
    const elementId = pageElementId(def.id);
    let page = document.getElementById(elementId);
    if (page) return page;

    // Recreating the wrapper means the old mounted content is gone too.
    mounted.delete(def.id);

    page = document.createElement('div');
    page.id = elementId;
    page.className = 'page type-interior mainAnimatedPage hide';
    page.setAttribute('data-title', def.labelFallback);
    page.setAttribute('data-backbutton', 'true');
    page.setAttribute('data-url', def.route);
    page.setAttribute('data-type', 'custom');

    const content = document.createElement('div');
    content.setAttribute('data-role', 'content');
    page.appendChild(content);

    const host = document.querySelector('.mainAnimatedPages');
    (host || document.body).appendChild(page);
    return page;
}

/** Fill the page body once (or again if it was emptied). */
function ensureMounted(def: JePageDefinition, page: HTMLElement): void {
    const content = page.querySelector<HTMLElement>('[data-role="content"]');
    if (!content) return;
    if (mounted.has(def.id) && content.hasChildNodes()) return;
    content.textContent = '';
    try {
        def.mount(content);
        mounted.add(def.id);
    } catch (err) {
        console.error(`${logPrefix} mount failed for "${def.id}":`, err);
    }
}

function dispatchViewShow(page: HTMLElement, isRestored: boolean): void {
    page.dispatchEvent(new CustomEvent('viewshow', {
        bubbles: true,
        detail: { type: 'custom', isRestored, options: {} },
    }));
    page.dispatchEvent(new CustomEvent('pageshow', { bubbles: true, detail: {} }));
}

function dispatchViewHide(page: HTMLElement): void {
    page.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'custom' } }));
}

/** Hide a JE page element (no native restore) and run its onHide. */
function hidePageElement(id: string): void {
    const page = document.getElementById(pageElementId(id));
    if (page) {
        page.classList.add('hide');
        dispatchViewHide(page);
    }
    const def = getPage(id);
    if (def?.onHide) {
        try {
            def.onHide();
        } catch (err) {
            console.error(`${logPrefix} onHide failed for "${id}":`, err);
        }
    }
}

/** Show a registered, enabled page. */
export function showPage(id: string): void {
    const def = getPage(id);
    if (!def || !def.isEnabled()) return;
    if (visibleId === id) return;

    const prevVisible = visibleId;
    const cameFromNative = prevVisible === null;
    // Claim visibility BEFORE pushState: the history patch can fire onNavigate
    // synchronously, re-entering handleRoute → showPage(id); the early set makes
    // that re-entry a no-op instead of double-mounting.
    visibleId = id;

    // Switching directly between two JE pages: hide the old one first, but keep
    // the tracked native page so leaving still restores it.
    if (prevVisible && prevVisible !== id) hidePageElement(prevVisible);

    const page = ensureContainer(def);

    if (window.location.hash !== def.route) {
        history.pushState({ jePage: id }, def.labelFallback, def.route);
    }

    if (cameFromNative) {
        const active = findActiveNativePage();
        if (active) {
            previousPage = active;
            active.classList.add('hide');
            active.dispatchEvent(new CustomEvent('viewhide', { bubbles: true, detail: { type: 'interior' } }));
        }
    }

    page.classList.remove('hide');
    dispatchViewShow(page, false);
    ensureMounted(def, page);
    // onShow runs on EVERY show (mount only built the skeleton once) — this is
    // what keeps revisits fresh: reload data, restart polling, re-render.
    if (def.onShow) {
        try {
            def.onShow();
        } catch (err) {
            console.error(`${logPrefix} onShow failed for "${id}":`, err);
        }
    }
}

/** Hide whichever JE page is visible and restore the native page. */
export function hidePage(): void {
    if (!visibleId) return;
    const id = visibleId;
    // Clear BEFORE the DOM work so a synchronous re-entry can't loop.
    visibleId = null;
    hidePageElement(id);

    if (previousPage && previousPage.isConnected && !findActiveNativePage()) {
        previousPage.classList.remove('hide');
        previousPage.dispatchEvent(new CustomEvent('viewshow', {
            bubbles: true,
            detail: { type: 'interior', isRestored: true },
        }));
    }
    previousPage = null;
}

/** The id of the JE page currently shown, or null (for nav active-state). */
export function getVisiblePageId(): string | null {
    return visibleId;
}

/** The registered, ENABLED page whose route matches a hash, or null. A disabled
 * page must not intercept its route (that would swallow the navigation). */
function matchRoute(hash: string): string | null {
    for (const def of getRegisteredPages()) {
        if ((hash === def.route || hash.startsWith(`${def.route}?`)) && def.isEnabled()) return def.id;
    }
    return null;
}

/** Show/hide based on the current URL. The single nav-driven entry point. */
function handleRoute(): void {
    const id = matchRoute(window.location.hash);
    if (id) {
        showPage(id);
    } else if (visibleId) {
        hidePage();
    }
}

/**
 * Capture-phase interceptor: stop Jellyfin's router from trying to resolve our
 * synthetic routes before we handle them. One handler for every page (the old
 * code had one per feature).
 */
function interceptNavigation(e: HashChangeEvent | PopStateEvent): void {
    const url = (e as HashChangeEvent).newURL ? new URL((e as HashChangeEvent).newURL) : window.location;
    if (matchRoute(url.hash)) {
        e.stopImmediatePropagation?.();
        handleRoute();
    }
}

/** Hide our page if a real Jellyfin view mounts underneath us. */
function handleViewShow(e: Event): void {
    if (!visibleId) return;
    const target = e.target as HTMLElement | null;
    if (target && !isOurPage(target) && target.classList?.contains('mainAnimatedPage')) {
        hidePage();
    }
}

let wired = false;

/** Wire the shell's navigation listeners exactly once. */
export function initPageShell(): void {
    if (wired) return;
    wired = true;

    window.addEventListener('hashchange', interceptNavigation, true);
    window.addEventListener('popstate', interceptNavigation, true);
    document.addEventListener('viewshow', handleViewShow);
    // HISTORY_UPDATE-backed: catches pushState, replaceState and param-only navs
    // the raw listeners miss — the whole reason the per-feature 150 ms pollers existed.
    onNavigate(handleRoute);
    // A page registers AFTER the shell wires (feature init runs later in the
    // barrels). Re-check the route on registration so a direct load / refresh
    // straight onto a JE route (e.g. #/calendar) mounts the page once it exists.
    onRegistryChange(handleRoute);
    // Config hot-reload can disable the page the user is currently viewing;
    // re-checking the route then hides it (matchRoute drops disabled pages).
    window.addEventListener('je:config-changed', handleRoute);

    handleRoute();
}
