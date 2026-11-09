import type { LanguageConfig, LanguageSettings, MediaLanguage } from '../features/media-tags/rules/media-language';
import type { RatingConfig, RatingSettings, RatingSources } from '../features/media-tags/types/ratings/rating-sources';
/** Only the legacy host surface consumed by this rule slice. Values remain untrusted at rule inputs. */
export interface TagRulesBridge {
    statusVocabulary?: typeof import('../features/media-tags/rules/status-vocabulary').statusVocabulary;
    core?: {
        mediaLanguage?: MediaLanguage;
        tagLook?: import('../features/media-tags/layout/tag-look').TagLook;
        tagLayout?: import('../features/media-tags/layout/tag-layout').TagLayout;
        ui?: {
            injectCss(id: string, css: string): unknown;
        };
        dom?: {
            afterNextPaint(callback: () => void): unknown;
        };
        tagRenderer?: {
            isIgnoredContext(element: HTMLElement): boolean;
        };
        tagScopes?: {
            excludes(group: string, element: HTMLElement): boolean;
        };
    };
    currentSettings?: LanguageSettings & RatingSettings & import('../features/media-tags/layout/layout-rules').LayoutDocument;
    pluginConfig?: LanguageConfig & RatingConfig & import('../features/media-tags/layout/layout-rules').LayoutDocument;
    session?: {
        getUserId?(): string | null;
        getServerId?(): string | null;
        getEpoch?(): unknown;
        onUserChange?(name: string, callback: () => void): unknown;
    };
    tagCacheStore?: import('../features/media-tags/layout/poster-colours').PosterColourStore;
    tagPosterColours?: import('../features/media-tags/layout/poster-colours').PosterColours;
    cdn: {
        flagSvg(code: string): string;
        url?(bucket: string, file: string): string;
    };
    t(key: string, values?: {
        tags: string;
    }): string;
    ratingSources?: RatingSources;
    normalizeOfficialRating?(text: string): unknown;
    saveUserSettings?: import('../features/media-tags/layout/tag-look').LookHost['saveUserSettings'];
    reinitializeTagLayout?(): unknown;
}
export function tagRulesHost(): TagRulesBridge {
    const host: Window & {
        JellyfinEnhanced?: TagRulesBridge;
    } = window;
    if (!host.JellyfinEnhanced)
        throw new Error('Jellyfin Enhanced must load before tag rules');
    return host.JellyfinEnhanced;
}
export function localeCandidates(bridge: TagRulesBridge): unknown[] {
    let saved: string | null = null;
    try {
        const id = bridge.session?.getUserId?.();
        if (id)
            saved = localStorage.getItem(`${id}-language`);
    }
    catch { /* Browser storage may be disabled. */ }
    return [saved, bridge.currentSettings?.displayLanguage, document.documentElement?.getAttribute('lang')];
}
export function posterScope(bridge: TagRulesBridge): string {
    const host: Window & {
        ApiClient?: {
            serverId?(): string;
            getCurrentUserId?(): string;
        };
    } = window;
    const server = bridge.session?.getServerId?.() || host.ApiClient?.serverId?.() || '';
    const user = bridge.session?.getUserId?.() || host.ApiClient?.getCurrentUserId?.() || '';
    return server && user ? `${server}:${user}` : '';
}
interface LookApiClient {
    serverId?: string | (() => string);
    _serverInfo?: {
        Id?: string;
    };
    getCurrentUserId?(): string;
    getPluginConfiguration(id: string): Promise<{
        TagLookItemOverrides?: unknown;
    }>;
    getUrl(path: string): string;
    ajax(options: {
        type: string;
        url: string;
        data: string;
        contentType: string;
        dataType: string;
    }): ReturnType<import('../features/media-tags/layout/tag-look').ItemLookApi['patch']>;
}
export function lookApiClient(): LookApiClient {
    const host: Window & {
        ApiClient?: LookApiClient;
    } = window;
    if (!host.ApiClient)
        throw new Error('Jellyfin client is unavailable');
    return host.ApiClient;
}
export function captureTagSession(bridge: TagRulesBridge): () => boolean {
    const identity = () => {
        try {
            const client = lookApiClient();
            const server = (typeof client.serverId === 'function' ? client.serverId() : client.serverId) || client._serverInfo?.Id;
            return `${server || ''}|${client.getCurrentUserId?.() || ''}`;
        }
        catch {
            return '|';
        }
    };
    const owner = identity();
    const epoch = bridge.session?.getEpoch?.();
    return () => owner === identity() && epoch === bridge.session?.getEpoch?.();
}
