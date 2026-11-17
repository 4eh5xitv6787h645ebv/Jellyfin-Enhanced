// The Elsewhere custom branding icon on the administrator page (as real-admin): the upload slot, the URL warning, an
// upload the browser refuses, one the server refuses, an SVG upload, the anonymous icon route, public config's upload
// version and the Elsewhere panel's icon with the upload in place; the icon is deleted again at the end. Nothing is
// saved: the message and URL typed here only feed the page's own check.
export default async ({ page, go, until, sleep }) => {
  const out = [];
  const admin = '#/configurationpage?name=Jellyfin%20Enhanced';
  const ready = () => until(() => page.evaluate(() => !!document.getElementById('ElsewhereCustomBrandingImageUrl')), 20000);
  // Start from an empty slot: delete an icon a previous run left behind, then load the page again.
  await ready();
  await page.evaluate(async () => {
    const form = new FormData();
    form.append('fileName', 'elsewhere-icon.png');
    const token = window.ApiClient.accessToken();
    await fetch(window.ApiClient.getUrl('/JellyfinEnhanced/DeleteBrandingImage'), { method: 'POST', body: form, headers: { Authorization: 'MediaBrowser Token="' + token + '"' } });
  });
  await page.reload();
  await ready();
  await sleep(2500);
  const state = () => page.evaluate(() => {
    const w = document.getElementById('je-elsewhere-icon-warning');
    return { slot: !!document.getElementById('elsewhereIconDropZone'), accept: document.getElementById('elsewhereIconInput')?.accept ?? null,
      warning: w ? (w.style.display === 'none' ? 'hidden' : w.textContent) : 'no warning element',
      status: document.getElementById('elsewhereIconStatus')?.textContent ?? null,
      preview: document.getElementById('elsewhereIconPreview')?.style.display ?? null,
      placeholder: document.getElementById('elsewhereIconPlaceholder')?.style.display ?? null };
  });
  const s0 = await state();
  out.push(`slot: ${s0.slot}, accept ${s0.accept}, preview ${s0.preview}, placeholder ${s0.placeholder}`);
  out.push(`URL /web/favicons/touchicon.png (saved): warning ${s0.warning}`);
  const typeUrl = value => page.evaluate(v => { const u = document.getElementById('ElsewhereCustomBrandingImageUrl'); u.value = v; u.dispatchEvent(new Event('input', { bubbles: true })); }, value);
  await typeUrl('/config/logo.png'); await sleep(2000);
  out.push(`URL /config/logo.png: warning ${(await state()).warning}`);
  await typeUrl('/web/favicons/touchicon.png'); await sleep(2000);
  out.push(`URL /web/favicons/touchicon.png again: warning ${(await state()).warning}`);
  const upload = async (name, mimeType, text) => {
    if (!s0.slot) return 'no upload slot';
    await page.setInputFiles('#elsewhereIconInput', { name, mimeType, buffer: Buffer.from(text) });
    await sleep(2500);
    return (await state()).status;
  };
  out.push(`upload logo.bmp (image/bmp): ${await upload('logo.bmp', 'image/bmp', 'BMnot really')}`);
  out.push(`upload logo.png (image/png, not an image): ${await upload('logo.png', 'image/png', 'not an image at all')}`);
  out.push(`upload logo.svg (image/svg+xml): ${await upload('logo.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e91e8c"/></svg>')}, preview ${(await state()).preview}`);
  const anonymous = () => page.evaluate(async () => {
    const r = await fetch(window.ApiClient.getUrl('/JellyfinEnhanced/ElsewhereBrandingIcon'));
    return `HTTP ${r.status} ${r.headers.get('content-type') || ''} | csp: ${r.headers.get('content-security-policy') || 'none'} | nosniff: ${r.headers.get('x-content-type-options') || 'none'} | cache: ${r.headers.get('cache-control') || 'none'}`;
  });
  const version = () => page.evaluate(async () => {
    const r = await fetch(window.ApiClient.getUrl('/JellyfinEnhanced/public-config'));
    const v = (await r.json()).ElsewhereCustomBrandingIconVersion;
    return v === undefined ? 'no such field' : v === '' ? 'empty' : /^\d+-\d+$/.test(v) ? '<ticks>-<size>' : 'other: ' + v;
  });
  out.push(`anonymous GET ElsewhereBrandingIcon: ${await anonymous()}`);
  out.push(`public-config ElsewhereCustomBrandingIconVersion: ${await version()}`);
  // The panel with the upload in place (the TMDB answer is given here, as in p73-panel.mjs).
  await page.route(/\/JellyfinEnhanced\/tmdb\/.*watch\/providers/i, route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 1, results: { US: { link: 'https://www.justwatch.com/us', flatrate: [] } } }) }));
  await page.reload();
  await go('#/details?id=0ff8461bed0a2658ec63487586efdbd3');
  await until(() => page.evaluate(() => !!document.querySelector('#itemDetailPage:not(.hide) .elsewhere-custom-branding img')), 20000).catch(() => null);
  await sleep(1500);
  out.push('panel icon with an upload: ' + await page.evaluate(() => {
    const icon = document.querySelector('#itemDetailPage:not(.hide) .elsewhere-custom-branding img');
    return icon ? `${icon.getAttribute('src').replace(/^https?:\/\/[^/]+/, '<server>').replace(/v=\d+-\d+/, 'v=<ticks>-<size>')}, loaded ${icon.complete && icon.naturalWidth > 0}` : 'no icon';
  }));
  await go(admin);
  await ready();
  await sleep(2500);
  out.push(`after reload: preview ${(await state()).preview}, warning ${(await state()).warning}`);
  await page.evaluate(() => document.getElementById('elsewhereIconDelete')?.click()); // the button sits on a tab that is not shown
  await sleep(1000); // the status clears itself after 2 s
  const s9 = await state();
  out.push(`delete: ${s9.status}, preview ${s9.preview}, placeholder ${s9.placeholder}`);
  out.push(`anonymous GET ElsewhereBrandingIcon: ${await anonymous()}`);
  out.push(`public-config ElsewhereCustomBrandingIconVersion: ${await version()}`);
  return out.join('\n');
};
