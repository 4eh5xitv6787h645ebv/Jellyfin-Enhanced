// Parity check for upstream 9d1d5e8f (#1068), subtitle search and sync. Plays the lab movie that has one
// external SRT track (seven lines between 1 s and 22 s, uploaded for this check) and reports what the user
// sees: the personal setting and the button it adds beside Subtitles, the dialog with subtitles off, the
// lines with their times, the search, choosing a line (the offset jellyfin-web's own slider then holds),
// the offset and Reset on the next open, the jump button, and the button going away with the setting.
// The media element is paused and placed at 5 s before the opens that list lines, so every number is the
// same from run to run.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const id = await page.evaluate(async () => (await ApiClient.getItems(ApiClient.getCurrentUserId(),
    { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II' })).Items[0]?.Id);
  out.shortcut = await page.evaluate(() => window.JellyfinEnhanced.state?.activeShortcuts?.SubtitleSync ?? null);
  out.settingAtStart = await page.evaluate(() => window.JellyfinEnhanced.currentSettings.subtitleSyncButtonEnabled ?? null);
  await go(`#/details?id=${id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  await until(() => page.evaluate(() => { const v = document.querySelector('video'); return v && v.currentTime > 0.5; }), 45000);

  const video = () => page.evaluate(() => { const v = document.querySelector('video'); return v ? { paused: v.paused, time: Math.round(v.currentTime * 10) / 10 } : null; });
  const osdButton = () => page.evaluate(() => {
    const b = document.getElementById('je-subtitle-sync-btn');
    if (!b) return null;
    return { afterSubtitles: !!b.previousElementSibling?.classList.contains('btnSubtitles'), title: b.title, label: b.getAttribute('aria-label'), icon: b.textContent.trim(),
      iconClass: b.firstElementChild?.className ?? null, className: b.className, count: document.querySelectorAll('#je-subtitle-sync-btn').length };
  });
  const dialog = () => page.evaluate(() => {
    const o = document.getElementById('je-subtitle-sync');
    if (!o) return null;
    const t = s => (o.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim();
    const rows = [...o.querySelectorAll('.je-subsync-row')].filter(r => !r.hidden);
    const status = o.querySelector('.je-subsync-status');
    const active = document.activeElement;
    return { title: t('.je-subsync-title'), track: t('.je-subsync-track'), anchor: t('.je-subsync-anchor'), offset: t('.je-subsync-offset'),
      resetHidden: o.querySelector('.je-subsync-meta .je-subsync-reset')?.hidden ?? null, resetLabel: t('.je-subsync-meta .je-subsync-reset'),
      placeholder: o.querySelector('.je-subsync-input')?.placeholder ?? null, hint: t('.je-subsync-hint'),
      status: status ? [...status.childNodes].map(n => (n.textContent || '').trim()).filter(Boolean) : null, statusKind: status?.dataset.kind ?? null,
      rows: rows.map(r => [r.querySelector('.je-subsync-time')?.textContent, r.querySelector('.je-subsync-text')?.textContent, r.classList.contains('is-current') ? 'current' : ''].filter(Boolean).join(' | ')),
      empty: t('.je-subsync-empty'), foot: t('.je-subsync-foot'), jumpLabel: o.querySelector('.je-subsync-jump')?.getAttribute('aria-label') ?? null,
      closeLabel: o.querySelector('.je-subsync-close')?.getAttribute('aria-label') ?? null,
      focus: active && o.contains(active) ? (active.className + (active.classList.contains('je-subsync-line') ? ': ' + active.querySelector('.je-subsync-text')?.textContent : '')) : 'outside the dialog',
      ownKeys: o.hasAttribute('data-je-own-keys'), role: o.querySelector('[role="dialog"]')?.getAttribute('aria-modal') ?? null };
  });
  const settled = () => page.evaluate(() => {
    const o = document.getElementById('je-subtitle-sync');
    if (!o) return false;
    return o.querySelectorAll('.je-subsync-row').length > 0 || !!o.querySelector('.je-subsync-status button');
  });
  const closed = () => page.evaluate(() => !document.getElementById('je-subtitle-sync'));
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.jellyfin-enhanced-toast')].map(e => e.textContent.trim()).filter(Boolean));
  const slider = () => page.evaluate(() => document.querySelector('.subtitleSyncSlider')?.value ?? null);
  const showOsd = async () => { await page.mouse.move(400, 300); await page.mouse.move(420, 320); await sleep(400); };
  const sheet = () => page.evaluate(() => [...document.querySelectorAll('.actionSheet .actionSheetMenuItem')].map(b => (b.querySelector('.actionSheetItemText')?.textContent || b.textContent || '').trim()));
  const pick = text => page.evaluate(text => {
    const item = [...document.querySelectorAll('.actionSheet .actionSheetMenuItem')].find(b => (b.textContent || '').trim().startsWith(text));
    if (!item) return false;
    item.click();
    return true;
  }, text);
  const chooseSubtitles = async text => {
    await showOsd();
    await page.evaluate(() => document.querySelector('.videoOsdBottom .btnSubtitles')?.click());
    await until(async () => (await sheet()).length, 10000);
    const options = await sheet();
    const picked = await pick(text);
    await sleep(1500);
    return { options, picked };
  };
  const cuesShown = () => page.evaluate(() => {
    const v = document.querySelector('video');
    const tracks = v ? [...v.textTracks].filter(t => t.mode === 'showing' || t.mode === 'hidden').map(t => t.cues ? t.cues.length : 0) : [];
    return { textTrackCues: tracks, customSubtitles: !!document.querySelector('.videoSubtitles'), assCanvas: !!document.querySelector('.libassjs-canvas, .JASSUB') };
  });
  const park = async seconds => {
    await page.evaluate(seconds => { const v = document.querySelector('video'); v.pause(); v.currentTime = seconds; }, seconds);
    await until(() => page.evaluate(seconds => { const v = document.querySelector('video'); return v.paused && !v.seeking && Math.abs(v.currentTime - seconds) < 0.01; }, seconds), 15000);
  };
  const panelToggle = async () => {
    await page.evaluate(() => window.JellyfinEnhanced.showEnhancedPanel());
    await until(() => page.locator('#jellyfin-enhanced-panel #subtitleSyncButtonEnabled').count(), 10000);
    const before = await page.evaluate(() => {
      const box = document.querySelector('#jellyfin-enhanced-panel #subtitleSyncButtonEnabled');
      const label = box.closest('label') || box.parentElement;
      return { checked: box.checked, text: (label.textContent || '').replace(/\s+/g, ' ').trim(),
        shortcutRow: [...document.querySelectorAll('#jellyfin-enhanced-panel .shortcut-key')].filter(k => k.dataset.action === 'SubtitleSync').map(k => [k.textContent.trim(), k.parentElement?.textContent.replace(/\s+/g, ' ').trim()]) };
    });
    await page.evaluate(() => document.querySelector('#jellyfin-enhanced-panel #subtitleSyncButtonEnabled').click());
    await sleep(1200);
    const after = { checked: await page.evaluate(() => document.querySelector('#jellyfin-enhanced-panel #subtitleSyncButtonEnabled').checked),
      setting: await page.evaluate(() => window.JellyfinEnhanced.currentSettings.subtitleSyncButtonEnabled), toasts: await toasts() };
    await page.keyboard.press('Escape');
    await sleep(600);
    if (await page.locator('#jellyfin-enhanced-panel').count()) await page.evaluate(() => document.getElementById('jellyfin-enhanced-panel')?.remove());
    return { before, after };
  };

  await attempt('buttonWithSettingOff', async () => { await showOsd(); return osdButton(); });
  await attempt('panelTurnsItOn', async () => {
    const toggled = await panelToggle();
    await showOsd();
    await until(osdButton, 8000);
    return { ...toggled, button: await osdButton() };
  });
  await attempt('subtitlesOff', async () => {
    const chosen = await chooseSubtitles('Off');
    await page.evaluate(() => document.querySelector('video').play());
    await sleep(500);
    const before = await video();
    await page.keyboard.press('Shift+S');
    await until(() => page.evaluate(() => !!document.getElementById('je-subtitle-sync')), 5000);
    const pausedWhileOpen = (await video()).paused;
    await until(settled, 25000);
    const shown = await dialog();
    await page.keyboard.press('Escape');
    await until(closed, 5000);
    await sleep(500);
    return { options: chosen.options, picked: chosen.picked, playingBefore: !before.paused, pausedWhileOpen, dialog: shown, resumedAfterEscape: !(await video()).paused };
  });
  await attempt('chooseSubtitlesFromTheDialog', async () => {
    await showOsd();
    await page.evaluate(() => document.getElementById('je-subtitle-sync-btn').click());
    await until(settled, 25000);
    const status = (await dialog()).status;
    await page.evaluate(() => document.querySelector('#je-subtitle-sync .je-subsync-status button').click());
    await until(async () => (await sheet()).length, 10000);
    const options = await sheet();
    const dialogClosed = await closed();
    const picked = await pick('English');
    await sleep(2500);
    return { status, dialogClosed, options, picked, cues: await cuesShown() };
  });
  await attempt('lines', async () => {
    await park(5);
    await page.keyboard.press('Shift+S');
    await until(settled, 25000);
    return { dialog: await dialog(), slider: await slider() };
  });
  await attempt('search', async () => {
    const input = page.locator('#je-subtitle-sync .je-subsync-input');
    await input.fill('CAFE creme');
    await sleep(500);
    const accents = await dialog();
    await input.fill('gary hue');
    await sleep(500);
    const twoWords = await dialog();
    await input.fill('zebra');
    await sleep(500);
    const none = await dialog();
    await input.fill('');
    await sleep(500);
    await input.focus();
    await page.keyboard.press('ArrowDown');
    const down = (await dialog()).focus;
    await page.keyboard.press('ArrowDown');
    const downAgain = (await dialog()).focus;
    await page.keyboard.press('s');
    await page.keyboard.press(']');
    await sleep(300);
    return { accents: { rows: accents.rows, foot: accents.foot }, twoWords: { rows: twoWords.rows, foot: twoWords.foot }, none: { rows: none.rows, empty: none.empty, foot: none.foot },
      arrowDown: down, arrowDownAgain: downAgain, keysStayInTheDialog: { open: !(await closed()), slider: await slider(), toasts: await toasts() } };
  });
  await attempt('chooseLine', async () => {
    await page.evaluate(() => [...document.querySelectorAll('#je-subtitle-sync .je-subsync-row')].find(r => r.textContent.includes('tickets')).querySelector('.je-subsync-line').click());
    await until(closed, 5000);
    await sleep(400);
    return { toasts: await toasts(), slider: await slider(), video: await video() };
  });
  await attempt('reopened', async () => {
    await sleep(3500);
    await page.keyboard.press('Shift+S');
    await until(settled, 25000);
    const shown = await dialog();
    await page.evaluate(() => document.querySelector('#je-subtitle-sync .je-subsync-meta .je-subsync-reset').click());
    await sleep(600);
    const afterReset = await dialog();
    return { offset: shown.offset, resetHidden: shown.resetHidden, rows: shown.rows, status: shown.status,
      afterReset: afterReset && { offset: afterReset.offset, resetHidden: afterReset.resetHidden, rows: afterReset.rows }, slider: await slider() };
  });
  await attempt('jump', async () => {
    await page.evaluate(() => [...document.querySelectorAll('#je-subtitle-sync .je-subsync-row')].find(r => r.textContent.includes('Café')).querySelector('.je-subsync-jump').click());
    await until(closed, 5000);
    await sleep(600);
    return { video: await video(), slider: await slider() };
  });
  await attempt('panelTurnsItOff', async () => {
    const toggled = await panelToggle();
    await showOsd();
    return { after: toggled.after, button: await osdButton(), styleStillHidesWithSubtitles: await page.evaluate(() => [...document.querySelectorAll('style')].some(s => /\.btnSubtitles\.hide \+ #je-subtitle-sync-btn/.test(s.textContent))) };
  });
  await page.evaluate(() => document.querySelector('video')?.pause());
  return out;
};
