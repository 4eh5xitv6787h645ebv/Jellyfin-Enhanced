import type { CatchRuntime } from '../features/catchup/types';
import type { SocialApi, SocialSession, RequestOptions } from './activity-host';
export interface CatchHost {
 pluginConfig?: {CatchUpEnabled?: boolean; CatchUpUseCustomTabs?: boolean; CatchUpUseNativeTab?: boolean};
 themer?: {getThemeVariables(): {primaryAccent?: string; panelBg?: string; secondaryBg?: string}};
 internals: {catchUp?: CatchRuntime}; session?: SocialSession;
 t(key: string, params?: Record<string, string | number>): string; toast(message: string): void;
 core: {api: {jf(path: string, options?: RequestOptions): Promise<unknown>; plugin(path: string, options?: RequestOptions): Promise<unknown>}};
 helpers: {isActiveTabContainer(node: HTMLElement): boolean; observeTabContainers(name: string, selector: string, callback: () => void): unknown};
 nativeTabs: {register(id: string, title: string, mount: (panel: HTMLElement) => void, icon: string): void};
 catchUpPage?: {injectStyles(): void; renderPage(container?: HTMLElement): void};
}
interface CatchWindow extends Window {JellyfinEnhanced?: CatchHost; JE?: CatchHost; ApiClient?: SocialApi; Emby?: {Page?: {showItem(id: string): void}}}
export function catchupHost() {const host: CatchWindow = window; return {host, JE: host.JellyfinEnhanced, getApi: () => host.ApiClient, Emby: host.Emby};}
