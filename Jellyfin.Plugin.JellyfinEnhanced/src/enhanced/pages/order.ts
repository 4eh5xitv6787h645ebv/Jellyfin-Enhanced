// src/enhanced/pages/order.ts
//
// Order resolution for the Pages nav. Precedence:
//   1. per-user override  — JE.currentSettings.pagesOrder (camelCased list)
//   2. admin default      — JE.pluginConfig.PagesOrder
//   3. registration order — the order features registered in
// Any registered page not named in the chosen list is appended (in registration
// order), so a newly added page is never silently dropped by a stale saved list.

import { JE } from '../../globals';
import type { JePageDefinition } from './types';
import { getPage, getRegistrationOrder } from './registry';

/** Read a value into a clean string[] (tolerates null/undefined/non-arrays). */
function readIdList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

/** The admin default order from plugin config. */
export function getAdminOrder(): string[] {
    return readIdList((JE.pluginConfig as { PagesOrder?: unknown } | undefined)?.PagesOrder);
}

/** The per-user override order (empty when the user hasn't customised). */
export function getUserOrder(): string[] {
    return readIdList((JE.currentSettings as { pagesOrder?: unknown } | undefined)?.pagesOrder);
}

/**
 * The resolved id order (user → admin → registration), filtered to currently
 * registered ids, with any unlisted registered ids appended.
 */
export function resolveOrder(): string[] {
    const registered = getRegistrationOrder();
    const registeredSet = new Set(registered);

    const userOrder = getUserOrder();
    const adminOrder = getAdminOrder();
    const base = userOrder.length ? userOrder : adminOrder.length ? adminOrder : registered;

    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of base) {
        if (registeredSet.has(id) && !seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }
    // Append any registered pages the list didn't mention (stable: registration order).
    for (const id of registered) {
        if (!seen.has(id)) {
            seen.add(id);
            result.push(id);
        }
    }
    return result;
}

/** Registered + enabled pages, in resolved order. */
export function getOrderedEnabledPages(): JePageDefinition[] {
    const out: JePageDefinition[] = [];
    for (const id of resolveOrder()) {
        const def = getPage(id);
        if (def && def.isEnabled()) out.push(def);
    }
    return out;
}
