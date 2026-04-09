/**
 * Tests for js/enhanced/module-registry.js.
 *
 * Locks in:
 *   - H6: reentrant handleConfigChange events are queued, not dropped.
 *   - H8: module replacement calls teardown on the old descriptor.
 *   - init/teardown transitions fire when enableKey flips.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_SRC = readFileSync(
  resolve(__dirname, '../../Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/module-registry.js'),
  'utf-8'
);

function loadRegistry(je = {}) {
  const JE = {
    pluginConfig: {},
    currentSettings: {},
    ...je,
  };
  const fakeWindow = { JellyfinEnhanced: JE };
  const context = vm.createContext({
    window: fakeWindow,
    console,
    Promise,
    Set,
    Map,
    Object,
    Array,
  });
  vm.runInContext(REGISTRY_SRC, context);
  return JE;
}

describe('module-registry', () => {
  it('exposes the expected API', () => {
    const JE = loadRegistry();
    expect(JE.moduleRegistry).toBeDefined();
    expect(typeof JE.moduleRegistry.register).toBe('function');
    expect(typeof JE.moduleRegistry.unregister).toBe('function');
    expect(typeof JE.moduleRegistry.handleConfigChange).toBe('function');
    expect(typeof JE.moduleRegistry.getModule).toBe('function');
    expect(typeof JE.moduleRegistry.markAllInitialized).toBe('function');
  });

  it('fires teardown then init when enableKey flips false->true', () => {
    const JE = loadRegistry({ pluginConfig: { TestEnabled: false } });
    const init = vi.fn();
    const teardown = vi.fn();
    JE.moduleRegistry.register('test-mod', {
      configKeys: ['TestEnabled'],
      init,
      teardown,
    });
    // Module starts uninitialized. markAllInitialized() only flips the
    // flag for modules that were actually enabled at the time, so here
    // the module should NOT be marked initialized (TestEnabled=false).
    JE.moduleRegistry.markAllInitialized();
    // Simulate a change that enables the module
    JE.moduleRegistry.handleConfigChange(
      ['TestEnabled'],
      { TestEnabled: false },
      { TestEnabled: true },
      {}
    );
    expect(init).toHaveBeenCalledTimes(1);
    expect(teardown).not.toHaveBeenCalled();
  });

  it('fires teardown when enableKey flips true->false', () => {
    const JE = loadRegistry({ pluginConfig: { TestEnabled: true } });
    const init = vi.fn();
    const teardown = vi.fn();
    JE.moduleRegistry.register('test-mod', {
      configKeys: ['TestEnabled'],
      init,
      teardown,
    });
    JE.moduleRegistry.markAllInitialized();
    JE.moduleRegistry.handleConfigChange(
      ['TestEnabled'],
      { TestEnabled: true },
      { TestEnabled: false },
      {}
    );
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('ignores changes to unrelated config keys', () => {
    const JE = loadRegistry({ pluginConfig: { TestEnabled: true } });
    const init = vi.fn();
    const teardown = vi.fn();
    JE.moduleRegistry.register('test-mod', {
      configKeys: ['TestEnabled'],
      init,
      teardown,
    });
    JE.moduleRegistry.markAllInitialized();
    JE.moduleRegistry.handleConfigChange(
      ['UnrelatedKey'],
      { UnrelatedKey: false },
      { UnrelatedKey: true },
      {}
    );
    expect(init).not.toHaveBeenCalled();
    expect(teardown).not.toHaveBeenCalled();
  });

  it('replaces a registered module by calling teardown on the old one (H8)', () => {
    const JE = loadRegistry({ pluginConfig: { TestEnabled: true } });
    const oldTeardown = vi.fn();
    JE.moduleRegistry.register('test-mod', {
      configKeys: ['TestEnabled'],
      init: vi.fn(),
      teardown: oldTeardown,
    });
    JE.moduleRegistry.markAllInitialized();
    // Re-register with new callbacks — old teardown should fire
    const newInit = vi.fn();
    const newTeardown = vi.fn();
    JE.moduleRegistry.register('test-mod', {
      configKeys: ['TestEnabled'],
      init: newInit,
      teardown: newTeardown,
    });
    expect(oldTeardown).toHaveBeenCalledTimes(1);
  });

  it('queues reentrant handleConfigChange events rather than dropping them (H6)', () => {
    const JE = loadRegistry({ pluginConfig: { TestEnabled: false } });
    const ticks = [];
    JE.moduleRegistry.register('outer-mod', {
      configKeys: ['TestEnabled'],
      init: () => {
        ticks.push('outer-init');
        // Trigger a reentrant call while handleConfigChange is still
        // running. Without the H6 queue, this second call is silently
        // dropped. With the queue, it's processed after the current
        // dispatch finishes — ticks should include the second init.
        JE.moduleRegistry.handleConfigChange(
          ['InnerEnabled'],
          { InnerEnabled: false },
          { InnerEnabled: true },
          {}
        );
      },
      teardown: vi.fn(),
    });
    JE.moduleRegistry.register('inner-mod', {
      configKeys: ['InnerEnabled'],
      init: () => ticks.push('inner-init'),
      teardown: vi.fn(),
    });
    JE.moduleRegistry.markAllInitialized();

    JE.moduleRegistry.handleConfigChange(
      ['TestEnabled'],
      { TestEnabled: false },
      { TestEnabled: true },
      {}
    );
    // The reentrant call drains via microtask. Drain via Promise.resolve.
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      expect(ticks).toContain('outer-init');
      expect(ticks).toContain('inner-init');
    });
  });
});
