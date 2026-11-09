/**
 * media-tags' host for its settings panels (step C4): the panel bridge and the shared settings registry
 * `JE.internals.enhancedUi`, which media-tags co-owns with settings-panel and hidden-content
 * (tests/frontend/architecture/internals-owners.json, frontend.md §2.4). The functions are the same code as their
 * namesakes in settings-panel/host.ts, so a panel behaves the same with or without the shell loaded.
 */
import type { EnhancedUi, PanelApiClient, PanelBridge } from '../../settings-panel/public-api';
export type { CustomTagRule, PanelApiClient, PanelBridge, PanelTagLayout, PluginConfig, Settings } from '../../settings-panel/public-api';

interface BrowserHost { JellyfinEnhanced?: PanelBridge; ApiClient?: PanelApiClient }

/** The facade captured when a module loads (legacy `(function(JE){})(window.JellyfinEnhanced)`). */
export function panelHost(): PanelBridge {
    const host: Window & BrowserHost = window;
    if (!host.JellyfinEnhanced) throw new TypeError('Jellyfin Enhanced must load before the settings panel');
    return host.JellyfinEnhanced;
}

/** Jellyfin's client, read at call time like the legacy bare `ApiClient` global. */
export function apiClient(): PanelApiClient {
    const client = optionalApiClient();
    if (!client) throw new ReferenceError('ApiClient is not defined');
    return client;
}

/** The client when present (legacy `typeof ApiClient !== 'undefined'` checks). */
export function optionalApiClient(): PanelApiClient | undefined {
    const host: Window & BrowserHost = window;
    return host.ApiClient;
}

/** The shared panel registry (`JE.internals.enhancedUi`), created on first use like the legacy modules. */
export function registry(JE: Pick<PanelBridge, 'internals'>): EnhancedUi {
    JE.internals = JE.internals || {};
    return JE.internals.enhancedUi = JE.internals.enhancedUi || {};
}

/** The identity used by legacy per-user browser keys. */
export function currentUserKey(): string {
    return optionalApiClient()?.getCurrentUserId?.() || '';
}
