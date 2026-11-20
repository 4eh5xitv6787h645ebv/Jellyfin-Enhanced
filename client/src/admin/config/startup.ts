import {
    apiClient, engine, publishAssetVersion, publishCdnRoute, publishStartup, pluginVersion, startup,
    type AdminStartup,
} from '../../host/admin-config-host';
import { setHash } from './engine/address';
import type { AdminEngine } from './engine/api';

/** How long the engine may take before the page reports it could not load. */
export const ENGINE_LOAD_TIMEOUT_MS = 30000;

function versionQuery(version: string | null): { v: string } | undefined {
    return version ? { v: version } : undefined;
}

/** Whether a loaded script really was the settings engine with its sections. */
function usable(candidate: AdminEngine | undefined): candidate is AdminEngine {
    return !!candidate && typeof candidate.mount === 'function' && Object.keys(candidate.sections).length > 0;
}

/** Load jeAdmin.js with a script element; resolves only once it has defined the engine and its sections. */
function loadEngine(url: string): Promise<AdminEngine> {
    const running = engine();
    if (usable(running)) return Promise.resolve(running);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const timer = window.setTimeout(() => {
            script.remove();
            reject(new Error('the settings engine did not load in time'));
        }, ENGINE_LOAD_TIMEOUT_MS);
        script.async = true;
        script.src = url;
        script.onload = () => {
            window.clearTimeout(timer);
            const loaded = engine();
            if (usable(loaded)) resolve(loaded);
            else reject(new Error('the settings engine script defined no sections'));
        };
        script.onerror = () => {
            window.clearTimeout(timer);
            script.remove();
            reject(new Error('the settings engine script could not be loaded'));
        };
        document.head.appendChild(script);
    });
}

const PAGE_ID = 'JellyfinEnhancedPage';
/** Address parameter that makes a reopened view's address new to Jellyfin's view cache; removed again once the view starts. */
const REOPEN_PARAM = 'jeView';

/** A superseded view that Jellyfin shows again has nothing in it: ask the router for a new one in its place. */
function reopen(): void {
    const [path = '', query = ''] = window.location.hash.split('?');
    if (!path.includes('configurationpage')) return;
    const params = new URLSearchParams(query);
    params.set(REOPEN_PARAM, String(Date.now()));
    window.location.replace(path + '?' + params.toString().replace(/\+/g, '%20'));
}

/**
 * jellyfin-web keeps earlier views in its cache, and opens the page again as a second view whenever the address differs
 * from the cached one (it nearly always does: the page writes the open tab into it). Every script here finds its elements
 * by id, so a second copy in the document would wire itself to the hidden first one and stay unstyled and dead. Only the
 * newest view holds the page: earlier ones are stopped, emptied and lose the id.
 */
export function claimPage(): HTMLElement | null {
    const views = Array.from(document.querySelectorAll<HTMLElement>('[id="' + PAGE_ID + '"]'));
    const fresh = views.filter(view => !view.dataset.jeView).pop() ?? null;
    if (!fresh) return null;
    views.forEach(view => {
        if (view === fresh) return;
        view.dispatchEvent(new Event('jeadminretire'));
        view.replaceChildren();
        view.removeAttribute('id');
        view.dataset.jeView = 'retired';
        view.addEventListener('viewshow', reopen);
    });
    fresh.dataset.jeView = 'live';
    setHash(REOPEN_PARAM, null);
    return fresh;
}

function addOnce(id: string, create: () => HTMLElement): void {
    if (document.getElementById(id)) return;
    const element = create();
    element.id = id;
    document.head.appendChild(element);
}

/**
 * The page's first script: stylesheet, CDN route, icon font, and the start of the engine load. The page
 * script waits for that load, so nothing here blocks the main thread while the view is being inserted.
 */
export function beginStartup(): void {
    const page = claimPage();
    const client = apiClient();
    const version = pluginVersion();
    publishAssetVersion(version);
    const query = versionQuery(version);

    addOnce('jeAdminCss', () => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = client.getUrl('/JellyfinEnhanced/Configuration/jeAdmin.css', query);
        return css;
    });

    // Every external CDN asset this page used to load directly is served from the plugin's own route.
    publishCdnRoute(subpath => client.getUrl('/JellyfinEnhanced/cdn/' + subpath));

    // JE's icon subset, under a private family name so a theme's own 'Material Symbols Rounded' is never shadowed.
    addOnce('jeAdminIconFont', () => {
        const style = document.createElement('style');
        style.textContent = "@font-face{font-family:'JE Material Symbols Rounded';font-style:normal;font-weight:100 700;font-display:block;src:url("
            + client.getUrl('/JellyfinEnhanced/fonts/materialsymbolsrounded-subset.woff2', query) + ") format('woff2');}";
        return style;
    });

    const engineUrl = client.getUrl('/JellyfinEnhanced/Configuration/jeAdmin.js', query);
    const state: AdminStartup = {
        engine: loadEngine(engineUrl),
        pageShown: false,
        retry() {
            state.engine = loadEngine(engineUrl);
            return state.engine;
        },
    };
    // The page may be shown before the engine arrives; the page script replays that once it starts.
    page?.addEventListener('pageshow', () => { state.pageShown = true; }, { once: true });
    state.engine.catch(() => { /* The page script reports this; it may start after the rejection. */ });
    publishStartup(state);
}

export function startupState(): AdminStartup | undefined {
    return startup();
}
