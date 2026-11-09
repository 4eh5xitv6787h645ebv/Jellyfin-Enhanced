import type { JsonValue } from '../../contracts/generated';
import type { SaveOptions, SettingsDocument } from '../../host/context';
// Declared in host/context.ts (the core settings service's types, frontend.md §2.3); re-exported for this feature.
export type { SaveOptions, SettingsDocument };
interface Shortcut { Name: string; Key: string }
export interface SettingsBridge {
    CONFIG: { readonly TOAST_DURATION: JsonValue; readonly HELP_PANEL_AUTOCLOSE_DELAY: JsonValue };
    state: { activeShortcuts: Record<string, string>; removeContext: unknown; pauseScreenClickTimer: number | null };
    pluginConfig?: SettingsDocument & { Shortcuts?: Shortcut[] };
    userConfig?: { settings?: SettingsDocument; settingsRevision?: string | null; shortcuts?: { Shortcuts?: Shortcut[] }; bookmark?: SettingsDocument; elsewhere?: SettingsDocument; hiddenContent?: SettingsDocument };
    currentSettings?: SettingsDocument;
    core?: { mediaLanguage?: { priorityList(value: unknown): string[] | null } };
    ratingSources?: { normalizeSources(value: unknown): string[] | null; settings(user: SettingsDocument, plugin?: SettingsDocument): { minimum: number; color: boolean } };
    toast?(message: string): void;
    getStatusDateContext?(): { locale: string; timeZone: string };
    toPascalCase?(value: SettingsDocument): SettingsDocument;
    inheritedSettingKeys: readonly string[];
    isSettingInherited(settings: SettingsDocument, key: string): boolean;
    setSettingInherited(settings: SettingsDocument, key: string, inherit: boolean): boolean;
    inheritedSettingDefault(settings: SettingsDocument, key: string): JsonValue | undefined;
    loadSettings(): SettingsDocument;
    getSettingsSaveState?(): { version: number; pending: number };
    saveUserSettings(file: string, settings: SettingsDocument, options?: SaveOptions): Promise<void>;
    keyCombo(event: KeyboardEvent): string;
    normalizeShortcutKey(key: string): string;
    initializeShortcuts(): void;
}
export interface SettingsClient {
    getCurrentUserId(): string;
    getUrl(path: string): string;
    accessToken?(): string;
    serverId?: string | (() => string);
    ajax(request: { type: string; url: string; data?: string; contentType?: string; dataType?: string }): Promise<unknown>;
}
export function settingsHost(): Window & { JellyfinEnhanced: SettingsBridge; ApiClient?: SettingsClient } {
    const host: Window & { JellyfinEnhanced?: SettingsBridge; ApiClient?: SettingsClient } = window;
    if (!host.JellyfinEnhanced) throw new Error('Settings require Jellyfin Enhanced');
    return host as Window & { JellyfinEnhanced: SettingsBridge; ApiClient?: SettingsClient };
}
