// Unit tests for src/enhanced/pages/order.ts — order resolution precedence
// (per-user override → admin default → registration) and enabled filtering.
import { describe, expect, it, beforeEach } from 'vitest';
import { registerPage } from './registry';
import { resolveOrder, getOrderedEnabledPages } from './order';
import type { JePageDefinition } from './types';

const JE = window.JellyfinEnhanced as {
    pluginConfig: { PagesOrder?: unknown };
    currentSettings?: { pagesOrder?: unknown };
};

let bravoEnabled = true;

function def(id: string, isEnabled: () => boolean = () => true): JePageDefinition {
    return { id, route: `#/${id}`, labelKey: `${id}_t`, labelFallback: id, icon: 'x', isEnabled, mount: () => {} };
}

// Registration happens once for the file; the three pages are the fixture.
registerPage(def('a'));
registerPage(def('b', () => bravoEnabled));
registerPage(def('c'));

describe('resolveOrder', () => {
    beforeEach(() => {
        JE.pluginConfig.PagesOrder = undefined;
        JE.currentSettings = { pagesOrder: undefined };
        bravoEnabled = true;
    });

    it('defaults to registration order when nothing is configured', () => {
        expect(resolveOrder()).toEqual(['a', 'b', 'c']);
    });

    it('uses the admin order when set', () => {
        JE.pluginConfig.PagesOrder = ['c', 'a', 'b'];
        expect(resolveOrder()).toEqual(['c', 'a', 'b']);
    });

    it('per-user order overrides the admin order', () => {
        JE.pluginConfig.PagesOrder = ['c', 'a', 'b'];
        JE.currentSettings = { pagesOrder: ['b', 'a', 'c'] };
        expect(resolveOrder()).toEqual(['b', 'a', 'c']);
    });

    it('appends registered pages missing from a partial list', () => {
        JE.currentSettings = { pagesOrder: ['c'] };
        expect(resolveOrder()).toEqual(['c', 'a', 'b']);
    });

    it('drops unknown ids and de-duplicates', () => {
        JE.pluginConfig.PagesOrder = ['b', 'zzz', 'b', 'a'];
        expect(resolveOrder()).toEqual(['b', 'a', 'c']);
    });

    it('empty per-user list falls through to admin (not treated as an order)', () => {
        JE.pluginConfig.PagesOrder = ['c', 'b', 'a'];
        JE.currentSettings = { pagesOrder: [] };
        expect(resolveOrder()).toEqual(['c', 'b', 'a']);
    });
});

describe('getOrderedEnabledPages', () => {
    beforeEach(() => {
        JE.pluginConfig.PagesOrder = undefined;
        JE.currentSettings = { pagesOrder: undefined };
        bravoEnabled = true;
    });

    it('returns enabled pages in resolved order', () => {
        JE.pluginConfig.PagesOrder = ['c', 'b', 'a'];
        expect(getOrderedEnabledPages().map((p) => p.id)).toEqual(['c', 'b', 'a']);
    });

    it('excludes disabled pages', () => {
        bravoEnabled = false;
        expect(getOrderedEnabledPages().map((p) => p.id)).toEqual(['a', 'c']);
    });
});
