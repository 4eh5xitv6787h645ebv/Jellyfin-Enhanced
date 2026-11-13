// Parity check for upstream 7649dda9: the stored hidden list does not parse (written before this run).
// The page loads with the list unknown; a hide is refused with a message, nothing is asked; the server set the
// content aside, so its next read is the defaults.
const MOVIE = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02';
export default async ({ page, go, until, sleep }) => {
  await go('#/home');
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.hiddenContent?.confirmAndHide), 30000);
  await sleep(1500);
  return await page.evaluate(async movie => {
    const JE = window.JellyfinEnhanced, seen = [], original = JE.toast;
    JE.toast = (message, duration) => { seen.push(message); try { return original?.call(JE, message, duration); } catch { return undefined; } };
    let threw = null, hidden = false;
    try { JE.hiddenContent.confirmAndHide({ itemId: movie, name: 'Movie', type: 'Movie' }, () => { hidden = true; }); } catch (e) { threw = String(e?.message); }
    const asked = !!document.querySelector('.je-hide-confirm-overlay');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const c = window.ApiClient;
    const stored = await c.ajax({ type: 'GET', url: c.getUrl(`/JellyfinEnhanced/user-settings/${c.getCurrentUserId()}/hidden-content.json?_=${Date.now()}`), dataType: 'json' });
    return { hiddenCountAtLoad: JE.hiddenContent.getHiddenCount(), toasts: seen, threw, asked, hidden, nextReadItems: Object.keys(stored.Items || {}) };
  }, MOVIE);
};
