// src/enhanced/pages/types.ts
//
// Shared types for the unified Pages framework — the single home for JE's
// standalone navigation pages (Bookmarks, Requests, Calendar, Hidden Content).
//
// A "page" is a full-screen view reached from a JE-injected nav entry. Before
// this framework each feature reimplemented its own nav injection, standalone
// `.mainAnimatedPage` container, show/hide, viewshow dispatch and route
// interception (four near-verbatim clones). They now register ONE definition
// here and the framework owns all of that once — layout-aware, ordered, and
// with no polling.

/**
 * A registered JE page. Features supply the identity + a `mount` that fills the
 * page body with their existing content; the framework owns the surrounding
 * `.page` container, nav entry, show/hide and routing.
 */
export interface JePageDefinition {
    /** Stable id, e.g. `"bookmarks"`. Used in routes, DOM ids and the order list. */
    id: string;
    /** Hash route the page lives at, e.g. `"#/bookmarks"`. */
    route: string;
    /** i18n key for the nav label. */
    labelKey: string;
    /** English fallback used when the key is untranslated. */
    labelFallback: string;
    /** Material Icons ligature for the nav entry. */
    icon: string;
    /** Whether the page is currently enabled (reads `JE.pluginConfig.*Enabled`). */
    isEnabled: () => boolean;
    /**
     * Build the page body's DOM skeleton. Called once the first time the page is
     * shown (and again if the body was recreated) — NOT on every show. Receives
     * the `[data-role=content]` element; build the feature's `.content-primary …`
     * structure inside it. Do per-show work (data loads, polling, re-render) in
     * {@link onShow}, not here.
     */
    mount: (content: HTMLElement) => void;
    /**
     * Activate the page — called on EVERY show, after mount. Load/refresh data,
     * start polling, render current state. This is where the live behavior lives
     * so revisits stay fresh (mount only builds the skeleton once).
     */
    onShow?: () => void;
    /** Deactivate on EVERY hide: stop polling, reset transient view state. */
    onHide?: () => void;
}

/** Public `JE.pages` surface (frozen contract for cross-area registration). */
export interface PagesApi {
    /** Register a page. Idempotent per id (later duplicates are ignored). */
    register(def: JePageDefinition): void;
    /** Programmatically show a registered, enabled page by id. */
    show(id: string): void;
    /** Hide whichever JE page is currently visible. */
    hide(): void;
    /** Re-evaluate nav entries (after config/order changes). */
    refresh(): void;
    /** The enabled page ids in resolved nav order (for diagnostics/tests). */
    list(): string[];
}
