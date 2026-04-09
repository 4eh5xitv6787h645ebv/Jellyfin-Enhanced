/**
 * Tests for js/enhanced/config-store.js.
 *
 * config-store was the site of ~10 bugs across the cache-fix-v2 review
 * passes (C5, H1-H4, CF1, CF2, M1-M4). Every fix there should become a
 * regression test here so future work cannot silently reopen them.
 *
 * The module is an IIFE that mutates window.JellyfinEnhanced.configStore.
 * We evaluate it in an isolated Node vm context per test so each test
 * starts from a clean slate. ApiClient and BroadcastChannel are stubbed
 * per-test because config-store depends on both.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_STORE_SRC = readFileSync(
  resolve(__dirname, '../../Jellyfin.Plugin.JellyfinEnhanced/js/enhanced/config-store.js'),
  'utf-8'
);

/**
 * Fresh-load the config-store IIFE against a clean JellyfinEnhanced
 * namespace. Returns the context's JE handle + the store.
 *
 * Uses Node's vm.createContext to isolate each test — the IIFE's top-
 * level reads (`window`, `document`, etc.) resolve against the context's
 * own globals rather than the test file's real window. That's what lets
 * us wire synthetic ApiClient and BroadcastChannel mocks.
 */
function loadConfigStore(overrides = {}) {
  const JE = {
    pluginConfig: { ToastDuration: 3000, ArrLinksEnabled: true },
    currentSettings: {},
    loadSettings: () => ({ ...JE.currentSettings }),
    jellyseerrAPI: { clearUserStatusCache: vi.fn() },
    helpers: { onNavigate: vi.fn(() => () => {}) },
    ...overrides,
  };
  const fakeWindow = {
    JellyfinEnhanced: JE,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout,
    clearTimeout,
  };
  const context = vm.createContext({
    window: fakeWindow,
    document: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      visibilityState: 'visible',
    },
    console,
    ApiClient: overrides.ApiClient,
    BroadcastChannel: overrides.BroadcastChannel,
    localStorage: overrides.localStorage || {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    setTimeout,
    clearTimeout,
    Promise,
    Date,
    JSON,
    Object,
  });
  vm.runInContext(CONFIG_STORE_SRC, context);
  return { JE, context };
}

describe('config-store', () => {
  let ajaxMock;
  let broadcastChannelInstances;
  let apiClientStub;
  let broadcastChannelClass;

  beforeEach(() => {
    // ApiClient.ajax is the authoritative fetch surface the store uses.
    ajaxMock = vi.fn();
    apiClientStub = {
      ajax: ajaxMock,
      getUrl: (path) => `http://localhost${path}`,
      getCurrentUserId: () => 'test-user-id',
      accessToken: () => 'test-token',
    };

    // Capture BroadcastChannel instances so we can drive them manually.
    broadcastChannelInstances = [];
    broadcastChannelClass = class {
      constructor(name) {
        this.name = name;
        this.onmessage = null;
        broadcastChannelInstances.push(this);
      }
      postMessage(msg) {
        // postMessage does NOT invoke the sender's own onmessage (per spec).
        // Other tabs would receive it — simulate via broadcastChannelInstances.
      }
      close() {}
    };
  });

  describe('exports', () => {
    it('registers configStore on JE namespace with expected API', () => {
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      expect(JE.configStore).toBeDefined();
      expect(typeof JE.configStore.subscribe).toBe('function');
      expect(typeof JE.configStore.reloadConfig).toBe('function');
      expect(typeof JE.configStore.broadcastChange).toBe('function');
      expect(typeof JE.configStore.fetchHash).toBe('function');
      expect(typeof JE.configStore.startPolling).toBe('function');
    });
  });

  describe('subscribe', () => {
    it('returns an unsubscribe function', () => {
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      const cb = vi.fn();
      const unsubscribe = JE.configStore.subscribe(cb);
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      // no assertion — just proving it doesn't throw
    });

    it('notifies subscribers when applyUpdate is invoked with changed config', async () => {
      ajaxMock.mockImplementation(({ url }) => {
        if (url.endsWith('/private-config')) return Promise.resolve({});
        return Promise.resolve(null);
      });
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      const cb = vi.fn();
      JE.configStore.subscribe(cb);
      await JE.configStore.applyUpdate({ ToastDuration: 5000, ArrLinksEnabled: true });
      expect(cb).toHaveBeenCalledTimes(1);
      const event = cb.mock.calls[0][0];
      expect(event.changedKeys).toContain('ToastDuration');
      expect(event.newConfig.ToastDuration).toBe(5000);
    });

    it('does not notify subscribers when applyUpdate sees no changes', async () => {
      ajaxMock.mockImplementation(() => Promise.resolve({}));
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      const cb = vi.fn();
      JE.configStore.subscribe(cb);
      // Apply identical config — diffKeys should return empty.
      await JE.configStore.applyUpdate({ ToastDuration: 3000, ArrLinksEnabled: true });
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('applyUpdate atomic merge (regression: H4 + CF2)', () => {
    it('merges public + private atomically in one assignment', async () => {
      ajaxMock.mockImplementation(({ url }) => {
        if (url.endsWith('/private-config')) return Promise.resolve({ SonarrUrl: 'http://sonarr:8989' });
        return Promise.resolve(null);
      });
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      await JE.configStore.applyUpdate({ ToastDuration: 4000, ArrLinksEnabled: true });
      expect(JE.pluginConfig.ToastDuration).toBe(4000);
      expect(JE.pluginConfig.SonarrUrl).toBe('http://sonarr:8989');
    });

    it('preserves previous private fields when fetchPrivateConfig rejects (transient 5xx)', async () => {
      ajaxMock.mockImplementation(({ url }) => {
        if (url.endsWith('/private-config')) return Promise.reject({ status: 500 });
        return Promise.resolve(null);
      });
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
        pluginConfig: {
          ToastDuration: 3000,
          ArrLinksEnabled: true,
          SonarrUrl: 'http://existing-sonarr:8989',
        },
      });
      await JE.configStore.applyUpdate({ ToastDuration: 4000, ArrLinksEnabled: true });
      // Private URL should still be present — NOT wiped by the transient error
      expect(JE.pluginConfig.SonarrUrl).toBe('http://existing-sonarr:8989');
    });

    it('drops previous private fields when fetchPrivateConfig returns empty (403 non-admin)', async () => {
      ajaxMock.mockImplementation(({ url }) => {
        if (url.endsWith('/private-config')) return Promise.reject({ status: 403 });
        return Promise.resolve(null);
      });
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
        pluginConfig: { ToastDuration: 3000, ArrLinksEnabled: true, SonarrUrl: 'http://old' },
      });
      await JE.configStore.applyUpdate({ ToastDuration: 4000, ArrLinksEnabled: true });
      // 403 means "no private config for this caller" — not a transient
      // error — so the old value must be dropped. CF2 distinguishes this.
      expect(JE.pluginConfig.SonarrUrl).toBeUndefined();
    });
  });

  describe('reloadConfig lastHash ordering (regression: H1)', () => {
    it('does not advance lastHash when public-config fetch fails', async () => {
      let publicConfigCalls = 0;
      ajaxMock.mockImplementation(({ url }) => {
        if (url.endsWith('/config-hash')) return Promise.resolve('hash-v2');
        if (url.endsWith('/public-config')) {
          publicConfigCalls++;
          if (publicConfigCalls === 1) return Promise.reject({ status: 503 });
          return Promise.resolve({ ToastDuration: 9000, ArrLinksEnabled: true });
        }
        if (url.endsWith('/private-config')) return Promise.resolve({});
        return Promise.resolve(null);
      });
      const { JE } = loadConfigStore({
        ApiClient: apiClientStub,
        BroadcastChannel: broadcastChannelClass,
      });
      // First reload: public-config rejects. Without the H1 fix, lastHash
      // would still advance and the next reload would short-circuit.
      await JE.configStore.reloadConfig({ bypassThrottle: true });
      const cb = vi.fn();
      JE.configStore.subscribe(cb);
      // Second reload: public-config succeeds. If H1 is correct, this
      // reload actually proceeds (lastHash was not wrongly advanced).
      await JE.configStore.reloadConfig({ bypassThrottle: true });
      expect(cb).toHaveBeenCalled();
      expect(JE.pluginConfig.ToastDuration).toBe(9000);
    });
  });
});
