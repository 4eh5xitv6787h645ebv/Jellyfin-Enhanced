// Port of upstream da3d9ee9: the Leaving soon page's requests as an administrator sees them. With
// p97-reclaimerr-config.sh on, the plugin points at a Reclaimerr address that does not exist in the lab, so the server's own
// list says the requests could not be read: printed are its keys, its answer about the requests, and the notice the page
// draws from it. Then the page's list call is answered in the page with a canned list (a 14-day grace period, the list's
// source, a waiting request and approved ones whose schedule is live, kept or completed) and the review route is recorded
// instead of sent: each card's lines, and the body an approval with Reclaimerr's grace period sends. Mounted the way its tab
// mounts it (as p96-approve.mjs).
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.pluginConfig), 20000);
  return page.evaluate(async () => {
    const lines = [];
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const server = await ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('JellyfinEnhanced/leaving-soon/list'), dataType: 'json' });
    lines.push(`server list keys: ${Object.keys(server).join(',')}`);
    lines.push(`server requestsUnavailable=${JSON.stringify(server.requestsUnavailable)} requestsError=${JSON.stringify(server.requestsError)} canSchedule=${JSON.stringify(server.canSchedule)} source=${server.source ? '(a 16-character digest)' : JSON.stringify(server.source)}`);
    const lsPage = async () => {
      if (!window.JellyfinEnhanced.leavingSoonPage && window.JellyfinEnhanced.loader?.ensure) await window.JellyfinEnhanced.loader.ensure('leavingsoon-page');
      for (let i = 0; i < 100 && !window.JellyfinEnhanced?.leavingSoonPage?.renderForCustomTab; i++) await wait(100);
      return window.JellyfinEnhanced.leavingSoonPage;
    };
    const host = document.createElement('div');
    host.style.width = '1200px';
    document.body.appendChild(host);
    (await lsPage()).renderForCustomTab(host);
    for (let i = 0; i < 50 && !host.querySelector('.je-ls-notice, .je-ls-empty'); i++) await wait(100);
    lines.push(`notice drawn from the server's list: ${JSON.stringify(host.querySelector('.je-ls-notice')?.textContent ?? null)}`);

    const sent = [];
    const requests = [
      { id: 7, title: '12th Fail', year: 2023, mediaType: 'movie', requestedBy: 'sam_user', jellyfinUser: 'Sam', status: 'pending', scope: 'movie' },
      { id: 8, title: 'Cars', year: 2006, mediaType: 'movie', requestedBy: 'sam_user', status: 'approved', scope: 'movie', scheduledAt: '2026-12-10T08:00:00', scheduleState: 'scheduled' },
      { id: 9, title: 'Coco', year: 2017, mediaType: 'movie', requestedBy: 'sam_user', status: 'approved', scope: 'movie', scheduledAt: '2026-12-11T08:00:00', scheduleState: 'canceled' },
      { id: 10, title: 'Heat', year: 1995, mediaType: 'movie', requestedBy: 'sam_user', status: 'approved', scope: 'movie', scheduledAt: '2026-12-12T08:00:00', scheduleState: 'completed' },
    ];
    const list = { provider: 'reclaimerr', admin: true, canRequest: false, actions: true, items: [], mine: [], requests, requestsUnavailable: false, requestsError: null, graceDays: 14, source: '0123456789abcdef' };
    const real = ApiClient.ajax.bind(ApiClient);
    ApiClient.ajax = (opts) => {
      const url = String(opts.url || '');
      if (url.includes('JellyfinEnhanced/leaving-soon/list')) return Promise.resolve(JSON.parse(JSON.stringify(list)));
      if (url.includes('JellyfinEnhanced/reclaimerr/requests/')) { sent.push(`${opts.type} ${url.replace(/^.*JellyfinEnhanced\//, '')} ${opts.data}`); return Promise.resolve({ ok: true }); }
      return real(opts);
    };
    host.textContent = '';
    (await lsPage()).renderForCustomTab(host);
    for (let i = 0; i < 50 && host.querySelectorAll('.je-ls-reqcard').length < 4; i++) await wait(100);
    for (const c of host.querySelectorAll('.je-ls-reqcard')) {
      lines.push(`card: ${[...c.querySelectorAll('.je-ls-name, .je-ls-chip, .je-ls-sub')].filter((e) => !/ago|^\d/.test(e.textContent) || e.className.includes('name')).map((e) => `${e.className.replace(/je-ls-/g, '')}=${e.textContent}`).join(' | ')}`);
    }
    const card = [...host.querySelectorAll('.je-ls-reqcard')].find((c) => c.querySelector('.je-ls-name')?.textContent === '12th Fail');
    card.querySelector('.je-ls-icon-btn.approve').click();
    const select = card.querySelector('.je-ls-reqactions select');
    lines.push(`approve step: warn=${JSON.stringify(card.querySelector('.je-ls-warn')?.textContent ?? null)} confirm=${JSON.stringify(card.querySelector('.je-ls-btn.danger').textContent)} select=${select ? [...select.options].map((o) => `${o.value}:${o.textContent}`).join(' / ') : 'none'}`);
    card.querySelector('.je-ls-btn.danger').click();
    for (let i = 0; i < 30 && sent.length === 0; i++) await wait(100);
    lines.push(`sent: ${sent.join(' ; ') || 'nothing'}`);
    (await lsPage()).stopPolling();
    host.remove();
    ApiClient.ajax = real;
    return lines.join('\n');
  });
};
