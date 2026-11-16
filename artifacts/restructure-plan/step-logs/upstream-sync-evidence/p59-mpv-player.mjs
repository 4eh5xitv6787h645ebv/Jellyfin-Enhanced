// Parity check for upstream 3f8e4724 (#1069), player shortcuts on a player without a <video>.
//
// Jellyfin Desktop's mpv player cannot run in the lab's browser, so the page is given what such a player
// leaves it: jellyfin-web's real OSD and playback manager, and no <video> the page can find. Before the
// page loads, document.querySelector and querySelectorAll are wrapped so they never return a <video>;
// jellyfin-web finds its element through the player's own container and keeps a reference to it, so its
// OSD position text, position slider and settings menu go on working, while JE never sees an element (it
// attaches nothing to one). The lab movie is played and paused, so every time below is the same from run
// to run; the script then presses the player shortcuts and reports the toasts and what the player did.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  await page.addInitScript(() => {
    const one = Document.prototype.querySelector;
    const all = Document.prototype.querySelectorAll;
    Document.prototype.querySelector = function (selector) {
      const found = one.call(this, selector);
      return found && found.tagName === 'VIDEO' ? null : found;
    };
    Document.prototype.querySelectorAll = function (selector) {
      const found = all.call(this, selector);
      const kept = Array.from(found).filter(el => el.tagName !== 'VIDEO');
      return kept.length === found.length ? found : kept;
    };
    window.__labVideo = () => one.call(document, 'video');
  });
  await page.reload();
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.ApiClient && ApiClient.accessToken && ApiClient.accessToken() && window.JellyfinEnhanced && window.JellyfinEnhanced.currentSettings)), 30000);
  const id = await page.evaluate(async () => (await ApiClient.getItems(ApiClient.getCurrentUserId(),
    { IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1, SearchTerm: '101 Dalmatians II' })).Items[0]?.Id);
  await go(`#/details?id=${id}`);
  const play = page.locator('.btnPlay, button[data-action="resume"], button[data-action="play"]').filter({ visible: true }).first();
  await until(() => play.count(), 30000);
  await play.click();
  await until(() => page.evaluate(() => { const v = window.__labVideo(); return v && v.currentTime > 1; }), 45000);

  // Every toast JE shows, as it appears.
  await page.evaluate(() => {
    window.__toasts = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === 1 && node.classList.contains('jellyfin-enhanced-toast')) setTimeout(() => window.__toasts.push(node.textContent.trim()), 0);
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  const toasts = async () => { await sleep(900); return page.evaluate(() => window.__toasts.splice(0)); };
  const player = () => page.evaluate(() => {
    const v = window.__labVideo();
    const page = [...document.querySelectorAll('#videoOsdPage')].find(p => !p.classList.contains('hide'));
    return { time: Math.round(v.currentTime * 10) / 10, paused: v.paused, rate: v.playbackRate, fit: v.style.objectFit || 'none',
      osdTime: page?.querySelector('.osdPositionText')?.textContent ?? null };
  });
  const press = async key => { await page.keyboard.press(key); return toasts(); };

  await attempt('surface', async () => {
    await page.evaluate(() => window.__labVideo().pause());
    await sleep(2500); // jellyfin-web's OSD shows the pause
    return { videoThePageFinds: await page.evaluate(() => document.querySelectorAll('video').length + (document.querySelector('.videoPlayerContainer video') ? 1 : 0)),
      videoJellyfinWebPlays: await page.evaluate(() => !!window.__labVideo()),
      osd: await page.evaluate(() => {
        const page = [...document.querySelectorAll('#videoOsdPage')].find(p => !p.classList.contains('hide'));
        return { position: page?.querySelector('.osdPositionText')?.textContent ?? null, duration: (page?.querySelector('.osdDurationText')?.textContent ?? '').replace(/\d/g, 'n'),
          slider: !!page?.querySelector('.osdPositionSlider') && !page.querySelector('.osdPositionSlider').disabled, ratingButtonHasId: !!page?.querySelector('.btnUserRating[data-id]'),
          pauseIcon: page?.querySelector('.btnPause .material-icons')?.className.replace('material-icons', '').trim() ?? null, settingsButton: !!page?.querySelector('.btnVideoOsdSettings') };
      }), player: await player() };
  });
  // Where playback was paused, as the OSD shows it (whole seconds, 0:00 or 0:01 depending on the run): the
  // position every jump back returns to. Reported as "the start" so two runs read the same.
  const originText = typeof out.surface === 'object' ? out.surface.osd.position : null;
  const origin = originText === null ? null : Number(originText.split(':')[1]);
  if (typeof out.surface === 'object') {
    out.surface.osd.position = /^\d+:\d\d$/.test(originText || '') ? 'the start' : originText;
    out.surface.player = { paused: out.surface.player.paused, rate: out.surface.player.rate, fit: out.surface.player.fit, withinTwoSecondsOfTheStart: out.surface.player.time < 2.5 };
  }
  const sameAsOrigin = time => (origin === null ? null : Math.abs(time - origin) < 1.5);
  const stripTime = text => (originText === null ? text : text.replace(originText, 'the start'));

  await attempt('jumpBackBeforeAnySeek', async () => ({ toasts: await press('z'), stillAtTheStart: sameAsOrigin((await player()).time) }));
  await attempt('timelineSeekThenJumpBack', async () => {
    // A click on the timeline: jellyfin-web's slider fires change on release and the playback manager seeks.
    await page.evaluate(() => {
      const slider = [...document.querySelectorAll('#videoOsdPage')].find(p => !p.classList.contains('hide')).querySelector('.osdPositionSlider');
      slider.value = '50';
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(2000);
    const afterSeek = await player();
    const shown = await press('z');
    await sleep(1500);
    const afterJump = await player();
    const again = await press('z');
    return { afterSeek: { time: afterSeek.time, osdTime: afterSeek.osdTime }, toasts: shown.map(stripTime), backAtTheStart: sameAsOrigin(afterJump.time), pressedAgain: again };
  });
  await attempt('keySeekThenJumpBack', async () => {
    await page.keyboard.press('ArrowRight'); // jellyfin-web's own fast-forward
    await sleep(2000);
    const afterSeek = await player();
    const shown = await press('z');
    await sleep(1500);
    const afterJump = await player();
    return { movedForward: origin !== null && afterSeek.time > origin + 5, toasts: shown.map(stripTime), backAtTheStart: sameAsOrigin(afterJump.time) };
  });
  await attempt('jumpToPercent', async () => {
    const shown = await press('5');
    await sleep(1500);
    const now = await player();
    return { toasts: shown, time: now.time, osdTime: now.osdTime };
  });
  await attempt('speed', async () => {
    const up = await press('+');
    await sleep(800);
    const afterUp = (await player()).rate;
    const upAgain = await press('+');
    await sleep(800);
    const afterUpAgain = (await player()).rate;
    const down = await press('-');
    await sleep(800);
    const afterDown = (await player()).rate;
    const reset = await press('r');
    await sleep(800);
    return { increase: [up, afterUp], increaseAgain: [upAgain, afterUpAgain], decrease: [down, afterDown], reset: [reset, (await player()).rate],
      sheetsLeft: await page.evaluate(() => document.querySelectorAll('.dialogContainer').length), hidingStylesLeft: await page.evaluate(() => [...document.querySelectorAll('style')].filter(s => /\.dialogContainer,\s*\.dialogBackdrop,\s*\.actionSheet\s*\{\s*opacity:\s*0/.test(s.textContent)).length) };
  });
  await attempt('aspect', async () => {
    const first = await press('a');
    await sleep(800);
    const afterFirst = (await player()).fit;
    const second = await press('a');
    await sleep(800);
    const afterSecond = (await player()).fit;
    const third = await press('a');
    await sleep(800);
    return { first: [first, afterFirst], second: [second, afterSecond], third: [third, (await player()).fit], sheetsLeft: await page.evaluate(() => document.querySelectorAll('.dialogContainer').length) };
  });
  await attempt('frameStep', async () => ({ toasts: await press('.'), player: await player() }));
  await attempt('skipIntro', async () => ({ toasts: await press('o') }));
  await attempt('subtitleSync', async () => {
    await page.evaluate(() => { window.JellyfinEnhanced.currentSettings.subtitleSyncButtonEnabled = true; window.JellyfinEnhanced.addSubtitleSyncButton?.(); });
    const shown = await press('Shift+S');
    const state = await page.evaluate(() => ({ dialog: !!document.getElementById('je-subtitle-sync'), button: document.querySelectorAll('#je-subtitle-sync-btn').length }));
    await page.evaluate(() => { window.JellyfinEnhanced.currentSettings.subtitleSyncButtonEnabled = false; window.JellyfinEnhanced.addSubtitleSyncButton?.(); });
    return { toasts: shown, ...state };
  });
  await attempt('bookmark', async () => {
    const osdButton = await page.evaluate(() => document.querySelectorAll('#jeBookmarkBtn').length);
    const opened = await press('b');
    await until(() => page.locator('#bookmark-time').count(), 8000);
    const time = await page.evaluate(() => document.getElementById('bookmark-time').value);
    await page.evaluate(() => document.querySelector('.je-bookmark-btn-submit').click());
    const added = await toasts();
    await sleep(1500);
    const markers = await page.evaluate(() => [...document.querySelectorAll('.videoOsdBottom .je-bookmark-marker')].map(m => m.style.left));
    const moved = await press('1'); // away from the bookmark, to 10 %
    await sleep(1200);
    const away = (await player()).time;
    await page.evaluate(() => document.querySelector('.videoOsdBottom .je-bookmark-marker').click());
    const jumped = await toasts();
    await sleep(1200);
    const back = (await player()).time;
    // Put the lab back: delete the bookmark through the modal's own list.
    await page.keyboard.press('b');
    await until(() => page.locator('.je-bookmark-btn-delete').count(), 8000);
    await page.evaluate(() => document.querySelector('.je-bookmark-btn-delete').click());
    const deleted = await toasts();
    await sleep(1500);
    const markersLeft = await page.evaluate(() => document.querySelectorAll('.videoOsdBottom .je-bookmark-marker').length);
    await page.keyboard.press('Escape');
    return { osdButton, opened, time, added, markers, moved, away, jumped, back, deleted, markersLeft };
  });
  await page.evaluate(() => window.__labVideo()?.pause());
  return out;
};
