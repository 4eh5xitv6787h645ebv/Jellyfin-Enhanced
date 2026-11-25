// je12 browse '#/home' --script <this file>   (as the lab administrator, and again with --user viewer)
// Parity check for upstream a66d70c5 (#1106) on a lab with the real Seerr, Sonarr and Radarr (je12 up --real all):
//  1. the Requests page (#/downloads): each pending request card's action buttons;
//  2. administrators: "Approve with options" on the pending movie request: the dialog as it opens (server, quality
//     profile, root folder, tags, request as), then HD-720p and the tag "kids" chosen, Approve, and what the page sent;
//  3. the movie request dialog (Abominable, 431580) and the series request dialog (tmdb 57243) opened through JE's Seerr
//     UI: the auto-approve note, the Tags field and its choices, the Request As list.
export default async ({ page, go, until, sleep }) => {
  const out = {};
  const attempt = async (name, work) => { try { out[name] = await work(); } catch (e) { out[name] = 'failed: ' + String(e.message || e).split('\n')[0].slice(0, 200); } };
  const sent = [];
  page.on('response', async res => {
    const r = res.request();
    const u = new URL(r.url());
    if (/\/JellyfinEnhanced\/(arr\/requests|jellyseerr\/request)/.test(u.pathname) && r.method() !== 'GET') {
      let answer = '';
      try { answer = (await res.text()).slice(0, 200); } catch { answer = '(no body)'; }
      sent.push(`${r.method()} ${u.pathname.replace(/^.*JellyfinEnhanced/, '')}${r.postData() ? ' ' + r.postData() : ''} -> ${res.status()} ${answer}`);
    }
  });
  const toasts = () => page.evaluate(() => [...document.querySelectorAll('.jellyfin-enhanced-toast')].map(t => t.textContent.trim()).filter(Boolean));
  await go('#/home');
  await until(() => page.evaluate(() => !!(window.JellyfinEnhanced?.pluginConfig && window.JellyfinEnhanced?.helpers)), 30000);
  out.admin = await page.evaluate(() => !!window.JellyfinEnhanced.helpers.isAdmin?.());

  const cards = () => page.evaluate(() => [...document.querySelectorAll('#je-downloads-container .je-request-card')]
    .filter(card => card.querySelector('.je-request-approve-btn, .je-request-options-btn'))
    .map(card => {
      const title = card.querySelector('.je-request-title')?.textContent.trim();
      const buttons = [...card.querySelectorAll('.je-request-actions button')].map(b => `${b.className.replace(/^je-request-|-btn$/g, '')}(${b.querySelector('.material-icons')?.textContent || ''}${b.getAttribute('aria-label') ? ', "' + b.getAttribute('aria-label') + '"' : ''})`);
      return `${title}: ${buttons.join(' ')}`;
    }));
  await attempt('requests page, pending cards', async () => {
    await go('#/downloads');
    await until(() => page.locator('#je-downloads-container .je-request-card').count(), 30000);
    await sleep(2500);
    return cards();
  });

  const dialogState = (prefix) => page.evaluate((p) => {
    const modal = [...document.querySelectorAll('.jellyseerr-season-modal')].filter(m => m.getAttribute('aria-hidden') !== 'true').pop();
    if (!modal) return null;
    const sel = id => modal.querySelector(`#${p}-${id}`);
    const chosen = s => (s ? (s.selectedOptions[0]?.textContent || '(none)') : 'no field');
    const tagsGroup = modal.querySelector(`#${p}-tags-group`);
    const user = sel('user');
    return {
      title: modal.querySelector('.jellyseerr-season-title')?.textContent, subtitle: modal.querySelector('.jellyseerr-season-subtitle')?.textContent,
      button: modal.querySelector('.jellyseerr-modal-button-primary')?.textContent,
      autoApproveNote: modal.querySelector('.jellyseerr-auto-approve')?.textContent.trim() || null,
      labels: [...modal.querySelectorAll('.jellyseerr-advanced-options label')].map(l => l.textContent.trim()),
      server: chosen(sel('server')), quality: chosen(sel('quality')), folder: chosen(sel('folder')),
      tags: !tagsGroup ? 'no field' : tagsGroup.hidden ? 'hidden' : { chosen: [...modal.querySelectorAll(`#${p}-tags .jellyseerr-tag-chip`)].map(c => c.firstChild?.textContent), placeholder: modal.querySelector(`#${p}-tags input`)?.placeholder },
      requestAs: !user ? 'no field' : { options: [...user.options].map(o => o.textContent), chosen: chosen(user), picker: modal.querySelector('.jellyseerr-user-toggle')?.textContent.trim() ?? null, pictures: modal.querySelectorAll('.jellyseerr-user-toggle .jellyseerr-user-avatar').length }
    };
  }, prefix);
  const ready = (prefix) => until(() => page.evaluate(p => (document.querySelector(`.jellyseerr-season-modal.show #${p}-quality`)?.options.length || 0) > 1, prefix), 20000);
  const tagChoices = async (prefix) => {
    const input = page.locator(`.jellyseerr-season-modal.show #${prefix}-tags input`);
    if (!(await input.count()) || !(await input.isVisible())) return null;
    await input.click();
    await sleep(200);
    const listed = await page.evaluate(p => [...document.querySelectorAll(`.jellyseerr-season-modal.show #${p}-tags .jellyseerr-tag-option`)].map(o => o.textContent), prefix);
    await input.press('Escape');
    return listed;
  };
  const closeDialog = async () => {
    await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-season-modal.show .jellyseerr-modal-button-secondary')].pop()?.click());
    await sleep(600);
  };

  if (out.admin) {
    await attempt('approve with options', async () => {
      const any = page.locator('#je-downloads-container .je-request-options-btn');
      if (!(await any.count())) return 'no "Approve with options" button on any card';
      // The lab's pending movie request (Resident Evil, request 3), else the first card that has the button.
      const movieCard = await page.evaluate(() => [...document.querySelectorAll('#je-downloads-container .je-request-options-btn')].findIndex(b => /Resident Evil/.test(b.closest('.je-request-card')?.textContent || '')));
      const target = movieCard >= 0 ? any.nth(movieCard) : any.first();
      const requestId = await target.getAttribute('data-request-id');
      await target.click();
      await ready('req');
      await sleep(500);
      const opened = await dialogState('req');
      const tags = await tagChoices('req');
      await page.locator('.jellyseerr-season-modal.show #req-quality').selectOption({ label: 'HD-720p' });
      const tagInput = page.locator('.jellyseerr-season-modal.show #req-tags input');
      if (await tagInput.count()) { await tagInput.click(); await tagInput.fill('ki'); await tagInput.press('Enter'); await page.keyboard.press('Tab'); }
      const before = await dialogState('req');
      const sentBefore = sent.length;
      await page.locator('.jellyseerr-season-modal.show .jellyseerr-modal-button-primary').click();
      await until(async () => sent.length > sentBefore, 15000);
      await sleep(1500);
      return { requestId, opened, tagChoices: tags, chosenBeforeApprove: { quality: before?.quality, tags: before?.tags }, sent: sent.slice(sentBefore), toasts: await toasts(), dialogOpenAfter: !!(await page.locator('.jellyseerr-season-modal.show').count()), cardsAfter: await cards() };
    });
  }

  await attempt('movie request dialog', async () => {
    await page.evaluate(async () => {
      const JE = window.JellyfinEnhanced;
      if (!JE.jellyseerrUI?.showMovieRequestModal && JE.loader?.ensure) await JE.loader.ensure('seerr');
      await JE.jellyseerrAPI.checkUserStatus();
      JE.jellyseerrUI.showMovieRequestModal(431580, 'Abominable', null, false);
    });
    await ready('movie');
    await sleep(700);
    const state = await dialogState('movie');
    state.tagChoices = await tagChoices('movie');
    await closeDialog();
    return state;
  });
  await attempt('series request dialog', async () => {
    await page.evaluate(async () => {
      const JE = window.JellyfinEnhanced;
      JE.jellyseerrUI.showSeasonSelectionModal(57243, 'tv', 'Doctor Who', null, false);
    });
    await until(() => page.evaluate(() => !!document.querySelector('.jellyseerr-season-modal.show')), 20000);
    if (await page.evaluate(() => !!document.querySelector('.jellyseerr-season-modal.show #tv-quality'))) await ready('tv');
    await sleep(700);
    const state = await dialogState('tv');
    await closeDialog();
    return state;
  });
  out.requestsSent = sent;
  return out;
};
