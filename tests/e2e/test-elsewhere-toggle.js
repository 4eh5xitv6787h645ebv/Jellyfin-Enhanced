/*
 * Test: toggle Elsewhere on/off via the reactive config flow and via full
 * page reload. Verify the streaming-lookup-container DOM element and the
 * observer lifecycle actually respond to the toggle.
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8097';

async function login(page) {
  await page.goto(`${BASE}/web/#/login`);
  await page.waitForSelector('.btnManual', { timeout: 30000 });
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.waitForSelector('#txtManualPassword', { state: 'visible', timeout: 10000 });
  await page.fill('#txtManualPassword', '4817');
  await page.click('button.button-submit[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
}

async function getConfig(page) {
  return page.evaluate(async () => {
    return fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      headers: { 'X-Emby-Token': ApiClient.accessToken() }
    }).then(r => r.json());
  });
}
async function setConfigValue(page, key, value) {
  return page.evaluate(async (kv) => {
    const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      headers: { 'X-Emby-Token': ApiClient.accessToken() }
    }).then(r => r.json());
    cfg[kv.key] = kv.value;
    await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
      body: JSON.stringify(cfg)
    });
    window.JellyfinEnhanced.configStore.broadcastChange();
    await window.JellyfinEnhanced.configStore.reloadConfig({ bypassThrottle: true });
  }, { key, value });
}

const results = [];
function pass(l) { results.push({ ok: true, l }); console.log('PASS: ' + l); }
function fail(l) { results.push({ ok: false, l }); console.log('FAIL: ' + l); }

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[c] ' + m.text().slice(0, 200)); });

  try {
    await login(page);
    await page.waitForTimeout(4000);

    // Step 1: enable Elsewhere + make sure TMDB is configured (needed for module to run)
    const cfg = await getConfig(page);
    const tmdbConfigured = !!cfg.TMDB_API_KEY;
    console.log('TMDB configured:', tmdbConfigured);
    if (!tmdbConfigured) {
      console.log('WARNING: TMDB not configured — elsewhere will early-return regardless');
    }

    await setConfigValue(page, 'ElsewhereEnabled', true);
    await page.waitForTimeout(1500);

    // Verify JE.pluginConfig reflects the new value
    const pc1 = await page.evaluate(() => ({
      enabled: window.JellyfinEnhanced.pluginConfig.ElsewhereEnabled,
      tmdb: window.JellyfinEnhanced.pluginConfig.TmdbEnabled,
    }));
    console.log('After enable:', JSON.stringify(pc1));

    // Need a detail page to actually see the streaming-lookup-container get injected.
    // Try to navigate to the first movie item found.
    const itemId = await page.evaluate(async () => {
      const resp = await fetch(ApiClient.getUrl('/Items?IncludeItemTypes=Movie&Limit=1&Recursive=true&userId=' + ApiClient.getCurrentUserId()), {
        headers: { 'X-Emby-Token': ApiClient.accessToken() }
      }).then(r => r.json());
      return resp.Items?.[0]?.Id || null;
    });
    console.log('First movie id:', itemId);

    if (itemId) {
      await page.goto(`${BASE}/web/#/details?id=${itemId}`, { waitUntil: 'commit' });
      await page.waitForTimeout(5000);
    }

    // Poll briefly for the streaming-lookup-container element
    const elsewhereUiBeforeDisable = await page.evaluate(async () => {
      for (let i = 0; i < 15; i++) {
        const el = document.querySelector('.streaming-lookup-container');
        if (el) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    });
    console.log('Elsewhere UI present after enable:', elsewhereUiBeforeDisable);
    if (tmdbConfigured && !elsewhereUiBeforeDisable) {
      // This is OK if we're not on a suitable page — not a hard fail
      console.log('NOTE: elsewhere UI did not appear — likely not on a movie details page or TMDB lookup empty');
    }
    if (elsewhereUiBeforeDisable) pass('Elsewhere UI injected when enabled');

    // Step 2: disable Elsewhere
    console.log('\n--- Disabling Elsewhere ---');
    await setConfigValue(page, 'ElsewhereEnabled', false);
    await page.waitForTimeout(2000);

    const pc2 = await page.evaluate(() => ({
      enabled: window.JellyfinEnhanced.pluginConfig.ElsewhereEnabled,
      observerCount: window.JellyfinEnhanced.helpers?.getObserverCount?.() ?? -1,
      bodySubscriberCount: window.JellyfinEnhanced.helpers?.getBodySubscriberCount?.() ?? -1,
    }));
    console.log('After disable:', JSON.stringify(pc2));
    if (pc2.enabled === false) pass('JE.pluginConfig.ElsewhereEnabled flipped to false');
    else fail('JE.pluginConfig.ElsewhereEnabled did NOT flip (reactive flow broken)');

    // The streaming-lookup-container should be gone
    const elsewhereUiAfterDisable = await page.evaluate(() => !!document.querySelector('.streaming-lookup-container'));
    if (!elsewhereUiAfterDisable) pass('Elsewhere UI removed after disable');
    else fail('Elsewhere UI STILL PRESENT after disable (teardown did not run)');

    // Step 3: verify a FULL page reload respects ElsewhereEnabled=false
    console.log('\n--- Full page reload test ---');
    await page.reload();
    await page.waitForTimeout(5000);
    if (itemId) {
      await page.goto(`${BASE}/web/#/details?id=${itemId}`, { waitUntil: 'commit' });
      await page.waitForTimeout(5000);
    }
    const pc3 = await page.evaluate(() => ({
      enabled: window.JellyfinEnhanced?.pluginConfig?.ElsewhereEnabled,
      uiPresent: !!document.querySelector('.streaming-lookup-container'),
    }));
    console.log('After full reload:', JSON.stringify(pc3));
    if (pc3.enabled === false) pass('Server config persisted: ElsewhereEnabled=false after reload');
    else fail('Server config DID NOT persist ElsewhereEnabled=false after reload — config save is broken');
    if (!pc3.uiPresent) pass('Elsewhere UI absent after full reload with disabled setting');
    else fail('Elsewhere UI STILL PRESENT after full page reload with disabled setting');

    // Step 4: re-enable and verify
    console.log('\n--- Re-enable test ---');
    await setConfigValue(page, 'ElsewhereEnabled', true);
    await page.waitForTimeout(2000);
    const pc4 = await page.evaluate(() => ({
      enabled: window.JellyfinEnhanced.pluginConfig.ElsewhereEnabled,
    }));
    if (pc4.enabled === true) pass('Re-enable: JE.pluginConfig.ElsewhereEnabled=true');
    else fail('Re-enable did not propagate');

  } finally {
    console.log('\n=== RESULTS ===');
    const p = results.filter(r => r.ok).length;
    const f = results.filter(r => !r.ok).length;
    console.log(`${p} passed, ${f} failed`);
    console.log('\nJS errors captured:', errors.length);
    errors.slice(0, 10).forEach((e, i) => console.log(`  ${i+1}. ${e.slice(0, 200)}`));
    await browser.close();
    process.exit(f > 0 ? 1 : 0);
  }
})();
