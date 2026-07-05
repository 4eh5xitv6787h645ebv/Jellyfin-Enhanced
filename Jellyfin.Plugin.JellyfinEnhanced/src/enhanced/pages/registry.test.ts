// Unit tests for src/enhanced/pages/registry.ts — registration identity,
// ordering and label resolution.
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { registerPage, getPage, getRegisteredPages, getRegistrationOrder, pageLabel } from './registry';
import type { JePageDefinition } from './types';

const JE = window.JellyfinEnhanced;

function def(id: string, extra: Partial<JePageDefinition> = {}): JePageDefinition {
    return {
        id,
        route: `#/${id}`,
        labelKey: `${id}_title`,
        labelFallback: id,
        icon: 'star',
        isEnabled: () => true,
        mount: () => {},
        ...extra,
    };
}

describe('registry', () => {
    it('registers pages and returns them in registration order', () => {
        registerPage(def('alpha'));
        registerPage(def('bravo'));
        expect(getRegistrationOrder()).toEqual(['alpha', 'bravo']);
        expect(getRegisteredPages().map((p) => p.id)).toEqual(['alpha', 'bravo']);
        expect(getPage('alpha')?.id).toBe('alpha');
        expect(getPage('missing')).toBeNull();
    });

    it('is idempotent per id (a second register is ignored)', () => {
        registerPage(def('charlie', { labelFallback: 'first' }));
        registerPage(def('charlie', { labelFallback: 'second' }));
        expect(getRegisteredPages().filter((p) => p.id === 'charlie')).toHaveLength(1);
        expect(getPage('charlie')?.labelFallback).toBe('first');
    });
});

describe('pageLabel', () => {
    afterEach(() => { delete (JE as { t?: unknown }).t; });

    it('falls back to the English label when there is no translator', () => {
        expect(pageLabel(def('delta', { labelFallback: 'Delta' }))).toBe('Delta');
    });

    it('falls back when the translator returns the key unchanged', () => {
        JE.t = (key: string) => key;
        expect(pageLabel(def('echo', { labelKey: 'echo_title', labelFallback: 'Echo' }))).toBe('Echo');
    });

    it('uses the translation when present', () => {
        JE.t = (key: string) => (key === 'foxtrot_title' ? 'Traducido' : key);
        expect(pageLabel(def('foxtrot', { labelKey: 'foxtrot_title', labelFallback: 'Foxtrot' }))).toBe('Traducido');
    });
});
