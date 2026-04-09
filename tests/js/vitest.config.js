import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/*.test.js'],
    // Tests run against the real plugin JS files — the source under
    // ../../Jellyfin.Plugin.JellyfinEnhanced/js/. Most modules use IIFEs
    // and mutate window.JellyfinEnhanced so the tests have to set that up
    // in a beforeEach hook and reset it in afterEach. See individual test
    // files for the per-module setup pattern.
  },
});
