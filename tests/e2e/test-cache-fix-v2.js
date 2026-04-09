/*
 * End-to-end smoke test for cache-fix-v2 branch.
 *
 * Verifies:
 * 1. theme-selector.js ReferenceError — script fails to register initializeThemeSelector
 * 2. Plugin loads successfully on home page (sanity check)
 * 3. Reactive config: save a hashed setting, verify hash changes
 * 4. SPA navigation dashboard roundtrip: custom tabs regression — if observer is bound
 *    to .mainAnimatedPages, it orphans after visiting dashboard and returning home
 * 5. Cross-tab reactive sync: non-hashed field change doesn't propagate
 */

const { chromium } = require('playwright');

const BASE = 'http://localhost:8097';
const USER = 'admin';
const PASS = '4817';

const results = [];
function pass(label, info) { results.push({ ok: true, label, info: info || '' }); }
function fail(label, info) { results.push({ ok: false, label, info: info || '' }); }

async function login(page) {
  await page.goto(`${BASE}/web/#/login`);
  await page.waitForSelector('.btnManual', { timeout: 15000 });
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.waitForSelector('#txtManualPassword', { state: 'visible', timeout: 5000 });
  await page.fill('#txtManualPassword', PASS);
  await page.click('button.button-submit[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
}

async function waitForPluginReady(page) {
  await page.waitForFunction(() => {
    return !!(window.JellyfinEnhanced && window.JellyfinEnhanced.pluginConfig);
  }, { timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    pageErrors.push(err.message);
  });

  try {
    console.log('=== Login ===');
    await login(page);
    console.log('Logged in OK');

    console.log('=== Wait for plugin ===');
    await waitForPluginReady(page);
    pass('Plugin loaded on home');

    // Allow all modules a moment to run their IIFEs
    await page.waitForTimeout(2500);

    // Check 1: theme-selector ReferenceError
    console.log('=== Theme selector check ===');
    const themeSelectorError = pageErrors.find(e => /JE is not defined/i.test(e))
                            || consoleErrors.find(e => /JE is not defined/i.test(e));
    if (themeSelectorError) {
      fail('theme-selector.js throws ReferenceError at load', themeSelectorError.slice(0, 200));
    } else {
      // Also check if the init function was exported
      const initExported = await page.evaluate(() => {
        return typeof window.JellyfinEnhanced?.initializeThemeSelector === 'function';
      });
      if (!initExported) {
        fail('theme-selector.js did not export initializeThemeSelector', 'No ReferenceError captured but export missing');
      } else {
        pass('theme-selector.js loaded and exported init function');
      }
    }

    // Also check if theme-selector is registered with moduleRegistry
    const themeSelectorRegistered = await page.evaluate(() => {
      if (!window.JellyfinEnhanced?.moduleRegistry?.getModule) return 'no-registry';
      return window.JellyfinEnhanced.moduleRegistry.getModule('theme-selector') ? 'yes' : 'no';
    });
    console.log(`theme-selector moduleRegistry status: ${themeSelectorRegistered}`);
    if (themeSelectorRegistered === 'yes') {
      pass('theme-selector registered with moduleRegistry');
    } else if (themeSelectorRegistered === 'no') {
      fail('theme-selector NOT registered with moduleRegistry', 'Matches ReferenceError at line 443 aborting IIFE before register() call');
    }

    // Check 2: configStore + moduleRegistry wired up
    console.log('=== Config store check ===');
    const configStoreReady = await page.evaluate(() => {
      return !!window.JellyfinEnhanced?.configStore
          && !!window.JellyfinEnhanced?.moduleRegistry
          && typeof window.JellyfinEnhanced.configStore.fetchHash === 'function';
    });
    if (configStoreReady) pass('configStore and moduleRegistry available');
    else fail('configStore or moduleRegistry missing', '');

    // Check 3: Module registry enumeration — how many modules registered?
    const registeredCount = await page.evaluate(() => {
      const mr = window.JellyfinEnhanced?.moduleRegistry;
      if (!mr) return -1;
      // Module registry doesn't expose a count; we probe by known names
      const known = [
        'colored-activity-icons', 'colored-ratings', 'plugin-icons', 'theme-selector',
        'hidden-content', 'hidden-content-page', 'calendar-page', 'downloads-page',
        'elsewhere', 'reviews', 'arr-links', 'arr-tag-links',
        'jellyseerr-item-details', 'jellyseerr-search', 'letterboxd-links',
        'hss-discovery-handler'
      ];
      const present = known.filter(n => mr.getModule(n));
      return { present, missing: known.filter(n => !mr.getModule(n)) };
    });
    console.log('Registered modules:', JSON.stringify(registeredCount));
    if (registeredCount.missing && registeredCount.missing.length === 0) {
      pass('All 16 expected modules registered');
    } else {
      fail('Some expected modules NOT registered', `missing: ${(registeredCount.missing || []).join(', ')}`);
    }

    // Check 4: Dashboard roundtrip — verify custom tab observers don't orphan
    console.log('=== Dashboard roundtrip test (issue 536 regression) ===');

    // First enable Calendar page and custom tabs
    const beforeDashboard = await page.evaluate(() => {
      return {
        mainAnimatedPagesExists: !!document.querySelector('.mainAnimatedPages'),
        hash: window.location.hash
      };
    });
    console.log('Before dashboard:', JSON.stringify(beforeDashboard));

    await page.goto(`${BASE}/web/#/dashboard`, { waitUntil: 'commit' });
    await page.waitForTimeout(1500);

    const duringDashboard = await page.evaluate(() => {
      return {
        mainAnimatedPagesExists: !!document.querySelector('.mainAnimatedPages'),
        hash: window.location.hash
      };
    });
    console.log('During dashboard:', JSON.stringify(duringDashboard));

    // Back to home
    await page.goto(`${BASE}/web/#/home.html`, { waitUntil: 'commit' });
    await page.waitForTimeout(2000);

    const afterDashboard = await page.evaluate(() => {
      return {
        mainAnimatedPagesExists: !!document.querySelector('.mainAnimatedPages'),
        hash: window.location.hash,
        // The custom-tab observers should be routed through the shared body observer
        bodySubscriberCount: window.JellyfinEnhanced?.helpers?.getBodySubscriberCount?.() ?? -1,
        observerCount: window.JellyfinEnhanced?.helpers?.getObserverCount?.() ?? -1,
      };
    });
    console.log('After dashboard roundtrip:', JSON.stringify(afterDashboard));

    // Note: proving the orphan condition requires the custom tab feature to actually be enabled
    // AND the home page to have the target container. This is environmental. We document what we see.
    pass('Dashboard roundtrip completed without runtime throw', JSON.stringify(afterDashboard));

    // Check 5: save a non-hashed setting, verify hash does NOT change (confirms curl finding from page context)
    console.log('=== Non-hashed setting test ===');
    const hashTest = await page.evaluate(async () => {
      const hash1 = await window.JellyfinEnhanced.configStore.fetchHash();
      // Get current config
      const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        headers: { 'X-Emby-Token': ApiClient.accessToken() }
      }).then(r => r.json());
      // Toggle ArrTagsPrefix (not in hash source)
      const oldVal = cfg.ArrTagsPrefix || '';
      cfg.ArrTagsPrefix = oldVal === 'e2e-test1' ? 'e2e-test2' : 'e2e-test1';
      await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
        body: JSON.stringify(cfg)
      });
      await new Promise(r => setTimeout(r, 300));
      const hash2 = await window.JellyfinEnhanced.configStore.fetchHash();
      return { hash1, hash2, changed: hash1 !== hash2, oldVal, newVal: cfg.ArrTagsPrefix };
    });
    console.log('Non-hashed hash test:', JSON.stringify(hashTest));
    if (!hashTest.changed) {
      fail('Non-hashed field (ArrTagsPrefix) save did not change config-hash',
           `Admin changes to non-hashed fields won't trigger reactive updates on other tabs/devices. old=${hashTest.oldVal} new=${hashTest.newVal}`);
    } else {
      pass('ArrTagsPrefix change DID trigger hash — maybe finding is wrong');
    }

    // Check 6: save a hashed setting, verify reactive flow actually fires
    console.log('=== Reactive flow test ===');
    const reactiveTest = await page.evaluate(async () => {
      let notified = false;
      let receivedKeys = null;
      const unsub = window.JellyfinEnhanced.configStore.subscribe((event) => {
        notified = true;
        receivedKeys = event.changedKeys;
      });

      const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        headers: { 'X-Emby-Token': ApiClient.accessToken() }
      }).then(r => r.json());
      const oldToast = cfg.ToastDuration || 3000;
      cfg.ToastDuration = oldToast === 3000 ? 3100 : 3000;
      await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
        body: JSON.stringify(cfg)
      });
      await new Promise(r => setTimeout(r, 300));
      // Trigger the poll via broadcastChange + reloadConfig
      window.JellyfinEnhanced.configStore.broadcastChange();
      await window.JellyfinEnhanced.configStore.reloadConfig();
      await new Promise(r => setTimeout(r, 500));
      unsub();
      return { notified, receivedKeys, newToast: cfg.ToastDuration, pluginConfigToast: window.JellyfinEnhanced.pluginConfig.ToastDuration };
    });
    console.log('Reactive test:', JSON.stringify(reactiveTest));
    if (reactiveTest.notified && reactiveTest.pluginConfigToast === reactiveTest.newToast) {
      pass('Reactive flow: hashed field change notified subscribers and updated pluginConfig');
    } else {
      fail('Reactive flow broken', JSON.stringify(reactiveTest));
    }

    // Final: dump any accumulated JS errors
    if (pageErrors.length > 0) {
      console.log('\n=== CAPTURED pageerror events ===');
      pageErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 300)}`));
    }
    if (consoleErrors.length > 0) {
      console.log('\n=== CAPTURED console.error events ===');
      consoleErrors.slice(0, 15).forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 300)}`));
    }

  } catch (err) {
    console.log('TEST CRASH:', err.message);
    fail('Test crashed', err.message);
  } finally {
    console.log('\n\n=== RESULTS ===');
    let passes = 0, fails = 0;
    for (const r of results) {
      if (r.ok) passes++; else fails++;
      console.log(`${r.ok ? 'PASS' : 'FAIL'}: ${r.label}${r.info ? ' — ' + r.info : ''}`);
    }
    console.log(`\n${passes} passed, ${fails} failed`);
    await browser.close();
    process.exit(fails > 0 ? 1 : 0);
  }
})();
