/**
 * The platform services a feature may reach through host/ (frontend.md §2.3; feature-boundaries rule 1 allows
 * features to import this file). It declares, types only, the settings document and save options the core
 * settings service uses (features/settings/host.ts re-exports them) and `FeatureName`, and (step C2) the
 * `FeatureContext` a feature host hands its modules.
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

/**
 * What a feature's modules get from its host (frontend.md §2.3). Runtime property names on
 * `window.JellyfinEnhanced` do not change; only the typed access path does.
 * - `core`: the feature's typed view of `window.JellyfinEnhanced`. The injected process-wide members (`t`,
 *   `currentSettings`, `toast`, `session`, `core.*`, …) stay on it (frontend.md §3 C3 scope).
 * - `own`: this feature's own slots: the facades it publishes on `window.JellyfinEnhanced` and its owner-only
 *   `JE.internals` slots (tests/frontend/architecture/internals-owners.json). Each property reads and writes the
 *   same runtime object as before, on every access.
 * - `peer(name)`: another feature's published facade, read on each call (the peer's script may load later), typed
 *   by that feature's public-api.ts.
 */
export interface FeatureContext<Own extends object, Peers extends object = Record<never, never>, Core extends object = object> {
    readonly feature: FeatureName;
    readonly core: Core;
    readonly own: Own;
    peer<K extends keyof Peers & string>(name: K): Peers[K] | undefined;
}

/** Where each key of a feature's `own` lives. */
export interface OwnSlots<Own extends object> {
    /** Facades the feature publishes on `window.JellyfinEnhanced` (`core[key]`). */
    readonly facades?: readonly (keyof Own & string)[];
    /** Owner-only `JE.internals` slots (`internals()[key]`). */
    readonly internalSlots?: readonly (keyof Own & string)[];
    /**
     * The `JE.internals` object. Only the owner's host file may touch it (feature-boundaries rule 3), so the
     * feature host passes this accessor; it is called on every access to an internals slot.
     */
    readonly internalsObject?: () => object;
}

/** Build a feature's context around the typed bridge its host read from `window.JellyfinEnhanced`. */
export function featureContext<Own extends object, Peers extends object = Record<never, never>, Core extends object = object>(
    feature: FeatureName, core: Core, slots: OwnSlots<Own>,
): FeatureContext<Own, Peers, Core> {
    const own = {} as Own;
    // Plain property reads and assignments, exactly what `JE.<key>` / `JE.internals.<key>` did before.
    const bind = (keys: readonly string[], target: () => object) => {
        for (const key of keys) {
            Object.defineProperty(own, key, {
                enumerable: true,
                get: () => (target() as Record<string, unknown>)[key],
                set: (value: unknown) => { (target() as Record<string, unknown>)[key] = value; },
            });
        }
    };
    bind(slots.facades ?? [], () => core);
    const internalsObject = slots.internalsObject;
    if (slots.internalSlots?.length) {
        if (!internalsObject) throw new Error(`${feature}: internal slots need the host's internalsObject accessor`);
        bind(slots.internalSlots, internalsObject);
    }
    return {
        feature,
        core,
        own,
        peer: name => (core as Record<string, unknown>)[name] as Peers[typeof name] | undefined,
    };
}
