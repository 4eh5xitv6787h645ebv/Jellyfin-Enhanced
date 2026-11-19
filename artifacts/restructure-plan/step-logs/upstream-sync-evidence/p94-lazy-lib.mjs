// Shared by the p94-lazy-*.mjs lab scripts (je12 browse --script). Started from the second port's p94-loader-lib.mjs.

/** Records every request for the component bundle: its group list, status and size. */
export function watchBundles(page) {
  const bundles = [];
  const pending = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith('/JellyfinEnhanced/bundle.js')) return;
    const entry = { groups: url.searchParams.get('g') || '(whole manifest)', status: response.status() };
    bundles.push(entry);
    pending.push((async () => {
      const body = await response.body().catch(() => null);
      entry.bytes = body ? body.length : null;
    })());
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/JellyfinEnhanced/bundle.js')) bundles.push({ groups: url.searchParams.get('g') || '(whole manifest)', status: 'failed' });
  });
  return {
    bundles,
    settled: () => Promise.all(pending),
    since: index => bundles.slice(index).map(entry => `${entry.groups} [${entry.status}${entry.bytes ? `, ${entry.bytes} bytes` : ''}]`),
  };
}

/** Clears the browser cache and loads the page again, then waits for JE to boot and for every group asked for. */
export async function coldReload({ page, until, sleep }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.clearBrowserCache');
  await page.reload();
  await until(() => page.evaluate(() => window.JellyfinEnhanced?.initialized === true), 60000);
  await quiet({ page, sleep });
}

/** Waits until the loader has nothing left to run, and a moment longer for what that starts. */
export async function quiet({ page, sleep }, ms = 1500) {
  await page.evaluate(() => window.JellyfinEnhanced?.loader?.settled?.());
  await sleep(ms);
  await page.evaluate(() => window.JellyfinEnhanced?.loader?.settled?.());
}

/** The lab's first movie by name. */
export const firstMovie = page => page.evaluate(async () => {
  const result = await window.ApiClient.getItems(window.ApiClient.getCurrentUserId(), { Recursive: true, IncludeItemTypes: 'Movie', Limit: 1, SortBy: 'SortName' });
  return { id: result.Items[0].Id, name: result.Items[0].Name };
});

/** The groups the loader has, in the order it reports them. */
export const loaded = page => page.evaluate(() => {
  const L = window.JellyfinEnhanced?.loader;
  return L ? Object.entries(L.state()).map(([id, state]) => `${id}:${state}`).join(' ') : 'no JE.loader';
});

/** Waits for Home's tag layout to settle: tags drawn, nothing left for the idle pass. */
export async function homeSettled({ page, sleep }, minimum = 20) {
  for (let i = 0; i < 60; i++) {
    const settled = await page.evaluate(min => {
      const L = window.JellyfinEnhanced?.core?.tagLayout;
      const drawn = document.querySelectorAll('.je-tag-host > .je-tag-slot').length;
      return drawn >= min && (!L?.idleStats || L.idleStats().waiting === 0);
    }, minimum);
    if (settled && i > 8) return true;
    await sleep(500);
  }
  return false;
}
