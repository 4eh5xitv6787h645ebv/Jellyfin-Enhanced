/**
 * hidden-content's host for its settings panel (step C4): the panel bridge and the shared settings registry
 * `JE.internals.enhancedUi`, which hidden-content co-owns with settings-panel and media-tags
 * (tests/frontend/architecture/internals-owners.json, frontend.md §2.4). The functions are the same code as their
 * namesakes in settings-panel/host.ts. Not ../host.ts: that one requires ApiClient when it loads.
 */
import type { EnhancedUi, PanelBridge } from '../../settings-panel/public-api';
export type { HiddenContentSettingKey, PanelBridge } from '../../settings-panel/public-api';

/** The facade captured when a module loads (legacy `(function(JE){})(window.JellyfinEnhanced)`). */
export function panelHost(): PanelBridge {
    const host: Window & { JellyfinEnhanced?: PanelBridge } = window;
    if (!host.JellyfinEnhanced) throw new TypeError('Jellyfin Enhanced must load before the settings panel');
    return host.JellyfinEnhanced;
}

/** The shared panel registry (`JE.internals.enhancedUi`), created on first use like the legacy modules. */
export function registry(JE: Pick<PanelBridge, 'internals'>): EnhancedUi {
    JE.internals = JE.internals || {};
    return JE.internals.enhancedUi = JE.internals.enhancedUi || {};
}
