export interface SocialSession {
 getEpoch(): number; isCurrent(epoch: number): boolean;
 onUserChange(name: string, callback: () => void): (() => void) | void;
}
export interface RequestOptions { skipCache?: boolean; skipRetry?: boolean; method?: string; body?: unknown }
export interface ActivityHost {
 pluginConfig?: { ActivityFeedEnabled?: boolean; ActivityFeedUseCustomTabs?: boolean; ActivityFeedUseNativeTab?: boolean;
 ActiveStreamsEnabled?: boolean; ActivityFeedShowActiveStreams?: boolean; ActivityFeedShowWatched?: boolean; ActivityFeedShowFavorited?: boolean; ActivityFeedShowReviewed?: boolean };
 session?: SocialSession;
 t(key: string): string;
 themer?: {getThemeVariables(): {primaryAccent?: string}};
 core: {api: {plugin(path: string, options?: RequestOptions): Promise<unknown>};
 ui: {skeletonGridHtml(count: number, options: {minWidth: string; height: string}): string};
 lifecycle: {register(name: string): {track(dispose: unknown): void; teardown(): void}};
 navigation: {onNavigate(callback: () => void): unknown}};
 helpers: {isActiveTabContainer(node: HTMLElement): boolean; observeTabContainers(name: string, selector: string, callback: () => void): unknown;
 onBodyMutation?(name: string, callback: (records: MutationRecord[]) => void): {unsubscribe(): void}};
 nativeTabs: {register(id: string, title: string, mount: (panel: HTMLElement) => void, icon: string): void};
 activityPage?: {injectStyles(): void; renderForCustomTab(host: HTMLElement): Promise<void>; stopPolling(): void};
 initializeActivityIcons?(): void; stopActivityIconsMonitoring?(): void;
}
export interface SocialApi {getCurrentUserId(): string; getUrl(path: string, query?: Record<string, string | number>): string;
 getImageUrl(id: string, options: {type: string; width: number; quality: number; tag?: string}): string}
interface ActivityWindow extends Window {JellyfinEnhanced?: ActivityHost; JE?: ActivityHost; ApiClient?: SocialApi; Emby?: {Page?: {showItem(id: string): void}}}
export function activityHost() { const host: ActivityWindow = window; return {host, JE: host.JellyfinEnhanced, getApi: () => host.ApiClient, Emby: host.Emby}; }
export function currentLease(session: SocialSession | undefined, getApi?: () => SocialApi | undefined): () => boolean {
 const epoch = session?.getEpoch(), user = getApi?.()?.getCurrentUserId(), server = getApi?.()?.getUrl('/');
 return () => (epoch === undefined || session?.isCurrent(epoch) === true) && user === getApi?.()?.getCurrentUserId() && server === getApi?.()?.getUrl('/');
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
export function record(value: unknown): value is Record<string, unknown> {return typeof value === 'object' && value !== null && !Array.isArray(value);}
export function object(value: unknown): Record<string, unknown> {if (!record(value)) throw Error('Invalid response object'); return value;}
export function string(value: unknown): string {if (typeof value !== 'string') throw Error('Invalid response string'); return value;}
export function number(value: unknown): number {if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('Invalid response number'); return value;}
export function optionalString(value: unknown): string | undefined {return value == null ? undefined : string(value);}
export function optionalNumber(value: unknown): number | undefined {return value == null ? undefined : number(value);}
export function optionalBoolean(value: unknown): boolean | undefined {if (value == null) return undefined; if (typeof value !== 'boolean') throw Error('Invalid response boolean'); return value;}
export function array<T>(value: unknown, decode: (value: unknown) => T): T[] {if (!Array.isArray(value)) throw Error('Invalid response array'); return value.map(decode);}
