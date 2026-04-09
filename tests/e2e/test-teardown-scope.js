/*
 * Test: trigger moduleRegistry teardown on arr-links and verify it throws ReferenceError
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8097';

async function login(page) {
  await page.goto(`${BASE}/web/#/login`);
  await page.waitForSelector('.btnManual', { timeout: 15000 });
  await page.getByRole('button', { name: 'admin', exact: true }).click();
  await page.waitForSelector('#txtManualPassword', { state: 'visible', timeout: 5000 });
  await page.fill('#txtManualPassword', '4817');
  await page.click('button.button-submit[type="submit"]');
  await page.waitForFunction(() => !window.location.hash.includes('login'), { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[c] ' + m.text()); });

  await login(page);
  await page.waitForTimeout(4000);

  // Ensure arr-links is enabled so init() actually ran
  const state = await page.evaluate(async () => {
    const mr = window.JellyfinEnhanced.moduleRegistry;
    const mod = mr.getModule('arr-links');
    return { exists: !!mod, initialized: mod?.initialized, config: window.JellyfinEnhanced.pluginConfig.ArrLinksEnabled };
  });
  console.log('arr-links state before:', JSON.stringify(state));

  // If not enabled, enable it and reload config
  if (!state.config) {
    console.log('arr-links is disabled — enable it first via plugin config');
    const enableResult = await page.evaluate(async () => {
      const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        headers: { 'X-Emby-Token': ApiClient.accessToken() }
      }).then(r => r.json());
      cfg.ArrLinksEnabled = true;
      await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
        body: JSON.stringify(cfg)
      });
      return true;
    });
    // Wait and reload page to pick up fresh config
    await page.reload();
    await page.waitForTimeout(4000);
  }

  // Now directly call the teardown via moduleRegistry + config change
  const teardownResult = await page.evaluate(async () => {
    const errors = [];

    // Method 1: directly call the registered teardown
    try {
      const mod = window.JellyfinEnhanced.moduleRegistry.getModule('arr-links');
      if (mod && mod.teardown) {
        try {
          mod.teardown();
        } catch (e) {
          errors.push({ method: 'direct-teardown', name: e.name, message: e.message });
        }
      }
    } catch (e) {
      errors.push({ method: 'direct-teardown-outer', name: e.name, message: e.message });
    }

    // Method 2: via config change — flip ArrLinksEnabled to false
    try {
      const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        headers: { 'X-Emby-Token': ApiClient.accessToken() }
      }).then(r => r.json());
      cfg.ArrLinksEnabled = false;
      await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
        body: JSON.stringify(cfg)
      });
      // Force reactive reload
      window.JellyfinEnhanced.configStore.broadcastChange();
      await window.JellyfinEnhanced.configStore.reloadConfig();
      await new Promise(r => setTimeout(r, 600));
    } catch (e) {
      errors.push({ method: 'config-change', name: e.name, message: e.message });
    }

    return errors;
  });

  console.log('Teardown errors:', JSON.stringify(teardownResult, null, 2));
  console.log('\nAll pageerrors/console.errors captured:');
  errors.forEach((e, i) => console.log(`  ${i + 1}. ${e.slice(0, 300)}`));

  // Re-enable for cleanup
  await page.evaluate(async () => {
    const cfg = await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      headers: { 'X-Emby-Token': ApiClient.accessToken() }
    }).then(r => r.json());
    cfg.ArrLinksEnabled = true;
    await fetch(ApiClient.getUrl('/Plugins/f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b/Configuration'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Emby-Token': ApiClient.accessToken() },
      body: JSON.stringify(cfg)
    });
  });

  await browser.close();
})();
