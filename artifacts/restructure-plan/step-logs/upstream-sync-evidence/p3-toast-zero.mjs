// Port 3 (upstream af5f9678): with Toast Notification Duration saved as 0, 10 and 4000 ms, what the web client's
// real toast does, then what the admin page's "Preview toast" says for typed values 0 and 50.
export default async ({ page, go, until, sleep }) => {
  const ID = 'f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b';
  const get = () => page.evaluate(async id => (await ApiClient.getPluginConfiguration(id)).ToastDuration, ID);
  const set = ms => page.evaluate(async ([id, value]) => { const c = await ApiClient.getPluginConfiguration(id); c.ToastDuration = value; await ApiClient.updatePluginConfiguration(id, c); }, [ID, ms]);
  const probe = async () => {
    await page.reload();
    await until(() => page.evaluate(() => window.JellyfinEnhanced?.initialized === true && !!window.JellyfinEnhanced.CONFIG), 30000);
    return page.evaluate(async () => {
      const JE = window.JellyfinEnhanced;
      JE.toast('probe'); JE.toast('probe with its own duration', 6000);
      await new Promise(resolve => setTimeout(resolve, 100));
      return { TOAST_DURATION: JE.CONFIG.TOAST_DURATION, toastsShown: document.querySelectorAll('.jellyfin-enhanced-toast').length };
    });
  };
  const original = await get();
  const out = {};
  try {
    for (const ms of [0, 10, 4000]) { await set(ms); out['saved' + ms] = await probe(); }
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(() => page.evaluate(() => !!document.getElementById('jeTestToast') && !!document.getElementById('ToastDuration')), 30000);
    const preview = value => page.evaluate(async typed => {
      const input = document.getElementById('ToastDuration'); input.value = typed;
      document.getElementById('jeTestToast').click();
      await new Promise(resolve => setTimeout(resolve, 100));
      return [...document.querySelectorAll('.je-preview-toast')].map(el => el.textContent);
    }, value);
    out.previewTyped0 = await preview('0');
    out.previewTyped50 = await preview('50');
  } finally { await set(original); }
  out.restoredTo = await get();
  return out;
};
