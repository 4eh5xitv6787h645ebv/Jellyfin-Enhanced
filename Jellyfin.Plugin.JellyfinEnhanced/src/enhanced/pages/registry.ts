// src/enhanced/pages/registry.ts
//
// The page registry: a single ordered source of truth for the pages JE injects
// into main navigation. Features call registerPage() during module evaluation;
// nav/order/shell read back through the getters. Order resolution lives in
// order.ts (it depends on runtime config, this file only records registration).

import { JE } from '../../globals';
import type { JePageDefinition } from './types';

const logPrefix = '🪼 Jellyfin Enhanced: Pages:';

/** id -> definition. */
const registry = new Map<string, JePageDefinition>();
/** Registration order — the ultimate fallback when no order is configured. */
const registrationOrder: string[] = [];
/** Listeners notified when the set of registered pages changes. */
const changeListeners = new Set<() => void>();

/**
 * Register a page. Idempotent per id — a second call with an already-registered
 * id is ignored (matches how the nav-tab registry deduped).
 */
export function registerPage(def: JePageDefinition): void {
    if (registry.has(def.id)) return;
    registry.set(def.id, def);
    registrationOrder.push(def.id);
    console.log(`${logPrefix} registered "${def.labelFallback}" (id=${def.id})`);
    notifyChange();
}

/** The definition for an id, or null. */
export function getPage(id: string): JePageDefinition | null {
    return registry.get(id) || null;
}

/** All registered ids in registration order. */
export function getRegistrationOrder(): string[] {
    return registrationOrder.slice();
}

/** All registered definitions in registration order. */
export function getRegisteredPages(): JePageDefinition[] {
    return registrationOrder.map((id) => registry.get(id)).filter((d): d is JePageDefinition => !!d);
}

/**
 * Subscribe to registry changes (a page registered). Returns an unsubscribe fn.
 * Used by the nav injector to re-render when a late feature registers.
 */
export function onRegistryChange(cb: () => void): () => void {
    changeListeners.add(cb);
    return () => changeListeners.delete(cb);
}

function notifyChange(): void {
    changeListeners.forEach((cb) => {
        try {
            cb();
        } catch (err) {
            console.error(`${logPrefix} registry change listener failed:`, err);
        }
    });
}

/**
 * Resolve a page's display label — the translated key, or the English fallback
 * when the key is missing/untranslated (JE.t returns the key itself then).
 */
export function pageLabel(def: JePageDefinition): string {
    const t = JE.t;
    if (!t) return def.labelFallback;
    const translated = t(def.labelKey);
    return translated && translated !== def.labelKey ? translated : def.labelFallback;
}
