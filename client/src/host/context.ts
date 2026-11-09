/**
 * The platform services a feature may reach through host/ (frontend.md §2.3; feature-boundaries rule 1 allows
 * features to import this file). Step C2 adds the `FeatureContext` factory here. For now it declares, types
 * only, the settings document and save options the core settings service uses (features/settings/host.ts
 * re-exports them), and `FeatureName`.
 */
import type { JsonValue } from '../contracts/generated';

/** A JSON document boundary retains fields supplied by later plugin versions. */
export type SettingsDocument = { [key: string]: JsonValue | undefined };

export interface SaveOptions {
    throwOnError?: boolean; beforeSave?(): void; onError?(error: unknown): void | Promise<void>; isCurrent?(): boolean;
    /** Notification lifetime may end before an originating document's rollback does. */
    notifyOnError?(): boolean;
}

/** The client features (`client/src/features/*`; PLAN.md canonical feature list, admin-tags folded into media-tags). */
export type FeatureName =
    | 'activity' | 'bookmarks' | 'calendar' | 'catchup' | 'chrome' | 'details-providers' | 'downloads'
    | 'hidden-content' | 'media-tags' | 'player' | 'seerr' | 'settings' | 'settings-panel' | 'shared' | 'spoiler-guard';
