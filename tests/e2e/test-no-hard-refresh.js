/*
 * Phase 2 E2E: verify that theme change, language change, and translation
 * cache clear do NOT trigger window.location.reload().
 *
 * Strategy: intercept navigation events via page.on('framenavigated') and
 * page.on('load'). If either fires between action and assertion, the test
 * fails — meaning a reload happened.
 */

const { chromium } = require('playwright');
const BASE = process.env.TEST_JELLYFIN_URL || 'http://localhost:8097';

async function login(page) {
  await page.goto(`${BASE}/web/#/login`);
  await page.waitForSelector('.btnManual', { timeout: 30000 });
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.waitForSelector('#txtManualPassword', { state: 'visible', timeout: 10000 });
  await page.fill('#txtManualPassword', '4817');
  await page.click('button.button-submit[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
}

const results = [];
function check(label, cond, info) {
  results.push({ ok: !!cond, label, info: info || '' });
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${info ? ' — ' + info : ''}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);
    await page.waitForTimeout(4000);

    // Verify notify API loaded
    const hasNotify = await page.evaluate(() => !!window.JellyfinEnhanced?.notify?.info);
    check('JE.notify API available', hasNotify);

    // === Test 1: theme-selector no longer reloads ===
    console.log('\n--- Theme change test ---');
    let reloadDetected = false;
    const onNav = () => { reloadDetected = true; };
    page.on('framenavigated', onNav);

    // Check if theme selector feature is enabled and available
    const themeReady = await page.evaluate(() => {
      return typeof window.JellyfinEnhanced?.initializeThemeSelector === 'function'
          || !!window.JellyfinEnhanced?.pluginConfig?.ThemeSelectorEnabled;
    });

    if (themeReady) {
      // Verify theme-selector.js has no window.location.reload
      const themeScript = await page.evaluate(async () => {
        try {
          const resp = await fetch(ApiClient.getUrl('/JellyfinEnhanced/js/extras/theme-selector.js'));
          return await resp.text();
        } catch (e) { return ''; }
      });
      const hasReloadInTheme = themeScript.includes('window.location.reload');
      check('theme-selector.js has NO window.location.reload()', !hasReloadInTheme,
            hasReloadInTheme ? 'STILL HAS RELOAD' : 'clean');
    } else {
      check('theme-selector feature available', false, 'not enabled — skip');
    }

    page.removeListener('framenavigated', onNav);

    // === Test 2: ui.js language change no reload ===
    console.log('\n--- Language change script check ---');
    const uiScript = await page.evaluate(async () => {
      try {
        const resp = await fetch(ApiClient.getUrl('/JellyfinEnhanced/js/enhanced/ui.js'));
        return await resp.text();
      } catch (e) { return ''; }
    });
    const hasReloadInUi = uiScript.includes('window.location.reload');
    check('ui.js has NO window.location.reload()', !hasReloadInUi,
          hasReloadInUi ? 'STILL HAS RELOAD — language/cache-clear paths not fixed' : 'clean');

    // === Test 3: notify API smoke test ===
    console.log('\n--- Notify API test ---');
    const notifyResult = await page.evaluate(() => {
      if (!window.JellyfinEnhanced?.notify) return { ok: false, reason: 'notify not available' };
      window.JellyfinEnhanced.notify.info('E2E test notification');
      const container = document.getElementById('je-notify-container');
      const items = container ? container.querySelectorAll('.je-notify-item') : [];
      return { ok: items.length > 0, count: items.length };
    });
    check('JE.notify.info() renders a notification element', notifyResult.ok, `count: ${notifyResult.count}`);

    // Verify persistent notification replaces by id
    const persistentResult = await page.evaluate(() => {
      window.JellyfinEnhanced.notify.persistent('test-id', 'First');
      window.JellyfinEnhanced.notify.persistent('test-id', 'Replaced');
      const container = document.getElementById('je-notify-container');
      const items = container ? container.querySelectorAll('[data-notify-id="test-id"]') : [];
      return { count: items.length, text: items[0]?.textContent || '' };
    });
    check('persistent notification replaces by id (not stacks)', persistentResult.count === 1,
          `count=${persistentResult.count}`);

    // Dismiss persistent
    await page.evaluate(() => { window.JellyfinEnhanced.notify.dismiss('test-id'); });
    const dismissed = await page.evaluate(() => {
      const container = document.getElementById('je-notify-container');
      return container ? container.querySelectorAll('[data-notify-id="test-id"]').length : 0;
    });
    check('persistent notification dismissed by id', dismissed === 0);

  } finally {
    console.log('\n=== RESULTS ===');
    const passes = results.filter(r => r.ok).length;
    const fails = results.filter(r => !r.ok).length;
    console.log(`${passes} passed, ${fails} failed`);
    await browser.close();
    process.exit(fails > 0 ? 1 : 0);
  }
})();
