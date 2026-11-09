import type { CalendarLifetime } from './lifetime';
import type { CalendarEvent, CalendarInternal, CalendarFacade } from './types';
interface Settings { calendarDefaultViewMode?: string; calendarDisplayMode?: string }
interface Lifecycle {
 track<T extends (() => void) | {disconnect(): void}>(resource: T): T;
 untrack(resource: () => void): void; teardown(): void;
 addListener(target: EventTarget, type: string, callback: (event: Event) => void, capture?: boolean): void;
}
export interface CalendarHost {
 internals: {calendarLifetime?: CalendarLifetime; calendarPage?: Partial<CalendarInternal>}; calendarPage?: CalendarFacade;
 initializeCalendarPage?: () => void;
 currentSettings?: Settings; loadSettings?(): Settings;
 saveUserSettings?(file: string, settings: Settings): unknown;
 pluginConfig?: {
 CalendarPageEnabled?: boolean; CalendarUsePluginPages?: boolean; CalendarUseCustomTabs?: boolean; CalendarUseNativeTab?: boolean;
 CalendarFirstDayOfWeek?: string; CalendarTimeFormat?: string; CalendarHighlightFavorites?: boolean; CalendarHighlightWatchedSeries?: boolean;
 CalendarForceOnlyRequested?: boolean; CalendarShowOnlyRequested?: boolean; CalendarFilterByLibraryAccess?: boolean;
 JellyseerrEnabled?: boolean; ShokoConfigured?: boolean; ShokoUrl?: string; ShokoUrlMappings?: string;
 };
 session?: {userScopedKey(base: string): string; getEpoch(): number; isCurrent(epoch: number): boolean; getServerId?(): string | null; getUserId?(): string | null; createLease?(): {isCurrent(): boolean}; onUserChange(name: string, callback: () => void): (() => void) | void};
 t(key: string): string; escapeHtml(value: string | undefined): string; toast?(message: string): void;
 cdn: {selfhst(path: string): string}; themer?: {getThemeVariables(): {primaryAccent?: string}};
 hiddenContent?: {filterCalendarEvents(events: CalendarEvent[]): CalendarEvent[]};
 helpers: {escHtml?(value: unknown): string; onNavigate?(callback: () => void): () => void;
 onSidebarRebuilt(id: string, selector: string, callback: () => void): () => void;
 isActiveTabContainer(element: HTMLElement): boolean;
 observeTabContainers(id: string, selector: string, callback: () => void): {teardown(): void};};
 nativeTabs: {register(id: string, title: string, mount: (panel: HTMLElement) => void, icon: string): void};
 core: {api: {plugin(path: string, options?: {method: string; body: unknown}): Promise<unknown>};
 ui: {injectCss(id: string, css: string): void; skeletonGridHtml(count: number, options: {minWidth: string; height: string; label: string}): string};
 lifecycle: {register(name: string): Lifecycle}};
}
interface HostWindow extends Window { JellyfinEnhanced?: CalendarHost; ApiClient?: {serverAddress?(): string; getImageUrl(id: string, options: {type: string; quality: number}): string} }
/** Only this adapter touches the legacy namespace. Each ordered entry fills its declared facade slots. */
export function calendarHost() {
 const host: HostWindow = window;
 const JE = host.JellyfinEnhanced;
 if (!JE) throw new Error('Calendar loaded before Jellyfin Enhanced');
 JE.internals ||= {};
 const partial = JE.internals.calendarPage ||= {};
 // The production loader establishes data -> render -> actions -> init order.
 // This assertion describes that explicit staged facade, not an untrusted response.
 const P = partial as CalendarInternal;
 return {JE, host, P};
}
