// je12 browse script (perf-runtime evidence): what the plugin serves for a few embedded client assets, and two
// things a user sees that the changed code produces.   je12 browse '#/home' --script <this file>
// The assets are embedded packed since perf-runtime; an unchanged file must be served with the same bytes and length
// as before (loader, a locale, a readable source map), and bundle.js.map must still be served.
export default async ({ page, sleep }) => {
  await sleep(4000);
  return await page.evaluate(async () => {
    const hex = buffer => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
    const asset = async path => {
      const response = await fetch(ApiClient.getUrl(path), { cache: 'no-store' });
      const body = await response.arrayBuffer();
      return { status: response.status, type: (response.headers.get('content-type') || '').split(';')[0], bytes: body.byteLength, sha256: hex(await crypto.subtle.digest('SHA-256', body)) };
    };
    const map = await (await fetch(ApiClient.getUrl('/JellyfinEnhanced/bundle.js.map'), { cache: 'no-store' })).json();
    const JE = window.JellyfinEnhanced;
    return {
      script: await asset('/JellyfinEnhanced/script'),
      locale: await asset('/JellyfinEnhanced/locales/en.json'),
      readableMap: await asset('/JellyfinEnhanced/js/enhanced/config.js.map'),
      font: await asset('/JellyfinEnhanced/fonts/materialsymbolsrounded-subset.woff2'),
      missing: (await asset('/JellyfinEnhanced/js/no-such-script.js')).status,
      bundleMapSections: map.sections.length,
      translations: Object.keys(JE.translations || {}).length,
      translated: JE.t('pausescreen_no_description'),
      initialized: JE.initialized === true,
    };
  });
};
