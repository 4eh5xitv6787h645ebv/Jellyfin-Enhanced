// Parity check for upstream 6916b31b (#1050), the Requests page: the Remove request button on a card the
// server says the caller may remove, Jellyfin's confirmation, and the one DELETE it sends. Signed in as the
// lab administrator, who first makes a request for the mock's movie 990001 (the mock keeps answering with it
// after a DELETE, so the card is still listed after the refresh). Also reads the new section of the plugin's
// configuration page.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  const sent = [];
  page.on('request', request => { const url = new URL(request.url()); if (/\/JellyfinEnhanced\/arr\/requests/.test(url.pathname) && request.method() !== 'GET') sent.push(request.method() + ' ' + url.pathname); });
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.core)), 30000);
  out.requested = await page.evaluate(async () => {
    const r = await fetch(ApiClient.getUrl('JellyfinEnhanced/jellyseerr/request'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"' }, body: JSON.stringify({ mediaType: 'movie', mediaId: 990001 }) });
    return r.status;
  });
  const dialog = () => page.evaluate(() => {
    const box = [...document.querySelectorAll('.dialogContainer .dialog, .dialogContainer .formDialog')].pop();
    if (!box) return null;
    return { title: (box.querySelector('.formDialogHeaderTitle, h1, h2, h3')?.textContent || '').trim(), text: (box.querySelector('.formDialogContent .text, .text, .formDialogContent')?.textContent || '').replace(/\s+/g, ' ').trim(),
      buttons: [...box.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean) };
  });
  const answer = id => page.evaluate(id => { const box = [...document.querySelectorAll('.dialogContainer .dialog, .dialogContainer .formDialog')].pop(); (box.querySelector(`button[data-id="${id}"]`) || [...box.querySelectorAll('button')][id === 'ok' ? 0 : 1]).click(); }, id);
  const toast = () => page.evaluate(() => [...document.querySelectorAll('.jellyfin-enhanced-toast, .je-toast, .toast')].map(t => t.textContent.trim()).filter(Boolean));

  await attempt('card', async () => {
    await go('#/downloads');
    await until(() => page.locator('#je-downloads-container .je-request-card, #je-downloads-container [class*="je-request-card"]').count(), 30000);
    await sleep(2500);
    return page.evaluate(() => {
      const buttons = [...document.querySelectorAll('#je-downloads-container .je-request-remove-btn')];
      const first = buttons[0];
      return { removeButtons: buttons.length, requestId: first?.dataset.requestId ?? null, title: first?.dataset.requestTitle ?? null, label: first?.getAttribute('aria-label') ?? null,
        tooltip: first?.getAttribute('title') ?? null, icon: first?.querySelector('.material-icons')?.textContent ?? null,
        background: first ? getComputedStyle(first).backgroundColor : null, colour: first ? getComputedStyle(first).color : null };
    });
  });
  await attempt('cancelled', async () => {
    await page.locator('#je-downloads-container .je-request-remove-btn').first().click();
    await until(dialog, 10000);
    const shown = await dialog();
    await answer('cancel');
    await sleep(1500);
    return { dialog: shown, sent: sent.slice(), buttonDisabled: await page.locator('#je-downloads-container .je-request-remove-btn').first().isDisabled() };
  });
  await attempt('confirmed', async () => {
    await page.locator('#je-downloads-container .je-request-remove-btn').first().click();
    await until(dialog, 10000);
    await answer('ok');
    await sleep(600);
    const toasts = await toast();
    await sleep(3000);
    return { sent: sent.slice(), toasts, removeButtonsAfterRefresh: await page.locator('#je-downloads-container .je-request-remove-btn').count() };
  });
  await attempt('adminSection', async () => {
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(() => page.locator('#autoRequestRemovalEnabled').count(), 30000);
    await sleep(1500);
    return page.evaluate(() => {
      const toggle = document.querySelector('#autoRequestRemovalEnabled');
      const section = toggle.closest('.jea-section, fieldset, section');
      const text = (section.textContent || '').replace(/\s+/g, ' ');
      return { hasTitle: text.includes('Auto Request Removal'), hasToggleLabel: text.includes('Remove Watched Requests'), checked: toggle.checked,
        notes: [...section.querySelectorAll('.jea-note')].map(note => note.className.replace('jea-note', '').trim() + ': ' + (note.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)),
        after: (section.previousElementSibling?.textContent || '').replace(/\s+/g, ' ').includes('Auto Movie Requests') ? 'Auto Movie Requests' : 'another section' };
    });
  });
  return out;
};
