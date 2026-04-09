/*
 * Isolated test: does theme-selector.js actually throw ReferenceError in the browser?
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
  const context = await browser.newContext();
  const page = await context.newPage();

  const allErrors = [];
  page.on('pageerror', err => {
    allErrors.push({ kind: 'pageerror', message: err.message, stack: err.stack?.slice(0, 300) });
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      allErrors.push({ kind: 'console.error', message: msg.text().slice(0, 300) });
    }
  });

  await login(page);
  await page.waitForTimeout(4000);

  // Directly evaluate the problematic expression in the console to see the actual behavior
  const referrorTest = await page.evaluate(() => {
    try {
      'use strict';
      // Exact same expression as theme-selector.js line 443
      const ctx = JE?.helpers?.createModuleContext('test-theme-selector-referror');
      return { ok: true, ctx: typeof ctx };
    } catch (e) {
      return { ok: false, name: e.name, message: e.message };
    }
  });
  console.log('Direct eval of line 443:', JSON.stringify(referrorTest));

  // Check if window.JellyfinEnhanced.initializeThemeSelector exists
  const initExists = await page.evaluate(() => ({
    initializeThemeSelector: typeof window.JellyfinEnhanced?.initializeThemeSelector,
    registered: !!window.JellyfinEnhanced?.moduleRegistry?.getModule('theme-selector'),
    registeredKeys: window.JellyfinEnhanced?.moduleRegistry?.getModule('theme-selector') || null
  }));
  console.log('Theme selector state:', JSON.stringify(initExists));

  // Dump all captured errors related to theme-selector or JE
  const themeErrors = allErrors.filter(e => /theme|JE is not defined/i.test(e.message));
  console.log(`\nTotal errors captured: ${allErrors.length}`);
  console.log(`Theme/JE errors: ${themeErrors.length}`);
  themeErrors.forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.kind}] ${e.message}`);
    if (e.stack) console.log(`     ${e.stack}`);
  });

  // Print the first 10 errors regardless
  console.log('\nFirst 10 errors:');
  allErrors.slice(0, 10).forEach((e, i) => {
    console.log(`  ${i + 1}. [${e.kind}] ${e.message.slice(0, 200)}`);
  });

  await browser.close();
})();
