/*
 * Phase 0 E2E: content-hash asset cache pipeline.
 *
 * Verifies:
 * 1. /JellyfinEnhanced/asset-hash returns a non-empty hash with no-cache headers
 * 2. /JellyfinEnhanced/public-config includes the AssetHash field
 * 3. /JellyfinEnhanced/script?v=<hash> returns 200 with immutable cache headers + ETag
 * 4. Re-requesting with If-None-Match returns 304
 * 5. Plugin.js fingerprint matches API-returned hash
 * 6. The injected <script> tag in index.html has ?v=<hash> query
 */

const { chromium } = require('playwright');
const BASE = process.env.TEST_JELLYFIN_URL || 'http://localhost:8097';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  function check(label, cond, info) {
    results.push({ ok: !!cond, label, info: info || '' });
    console.log(`${cond ? 'PASS' : 'FAIL'}: ${label}${info ? ' — ' + info : ''}`);
  }

  try {
    // 1. asset-hash endpoint
    const r1 = await page.request.get(`${BASE}/JellyfinEnhanced/asset-hash`);
    const hash = (await r1.text()).trim();
    check('asset-hash endpoint returns 200', r1.status() === 200);
    check('asset-hash is non-empty', hash.length > 0, `hash="${hash}"`);
    const cc1 = r1.headers()['cache-control'] || '';
    check('asset-hash has no-store cache control', cc1.includes('no-store'), cc1);

    // 2. public-config includes AssetHash
    const r2 = await page.request.get(`${BASE}/JellyfinEnhanced/public-config`);
    const cfg = await r2.json();
    check('public-config AssetHash present', typeof cfg.AssetHash === 'string' && cfg.AssetHash.length > 0, cfg.AssetHash);
    check('public-config AssetHash matches endpoint', cfg.AssetHash === hash);

    // 3. script endpoint is cacheable
    const r3 = await page.request.get(`${BASE}/JellyfinEnhanced/js/plugin.js?v=${hash}`);
    check('script endpoint 200 with hash query', r3.status() === 200);
    const cc3 = r3.headers()['cache-control'] || '';
    check('script cache-control is immutable', cc3.includes('immutable') && cc3.includes('public'), cc3);
    const etag = r3.headers()['etag'] || '';
    check('script has strong ETag', etag.startsWith('"') && etag.includes(hash), etag);

    // 4. If-None-Match returns 304
    const r4 = await page.request.get(`${BASE}/JellyfinEnhanced/js/plugin.js?v=${hash}`, {
      headers: { 'If-None-Match': etag },
    });
    check('If-None-Match returns 304', r4.status() === 304);

    // 5. Wrong ETag returns 200
    const r5 = await page.request.get(`${BASE}/JellyfinEnhanced/js/plugin.js?v=${hash}`, {
      headers: { 'If-None-Match': '"stale:js:js/plugin.js"' },
    });
    check('Stale ETag returns 200', r5.status() === 200);

    // 6. Load the page and verify the injected script tag carries the hash
    await page.goto(`${BASE}/web/`, { waitUntil: 'load' });
    const injectedSrc = await page.evaluate(() => {
      const tag = document.querySelector('script[plugin="Jellyfin Enhanced"]');
      return tag ? tag.getAttribute('src') : null;
    });
    if (injectedSrc) {
      check('injected script src contains ?v=<hash>', injectedSrc.includes(`?v=${hash}`), injectedSrc);
    } else {
      check('injected script tag present', false, 'not found in <head> — file transformation may not have fired');
    }

    // 7. Locale endpoints also return the immutable cache headers
    const r7 = await page.request.get(`${BASE}/JellyfinEnhanced/locales/en.json?v=${hash}`);
    const cc7 = r7.headers()['cache-control'] || '';
    check('locale endpoint is cacheable', r7.status() === 200 && cc7.includes('immutable'), cc7);
  } finally {
    console.log('\n=== RESULTS ===');
    const passes = results.filter((r) => r.ok).length;
    const fails = results.filter((r) => !r.ok).length;
    console.log(`${passes} passed, ${fails} failed`);
    await browser.close();
    process.exit(fails > 0 ? 1 : 0);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
