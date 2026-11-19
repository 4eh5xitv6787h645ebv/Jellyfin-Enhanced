// Port 96 (upstream 1de354c0): the Leaving soon page's approve step, as an administrator sees it. The lab has no
// Reclaimerr (p96-reclaimerr-config.sh points the plugin at an address that does not exist), so after reading the
// server's own list once (its keys), the page's two calls are answered in the page: leaving-soon/list with a canned list,
// and the review routes recorded instead of sent. Mounted the way its tab mounts it (as p93-cards.mjs). Then, with a
// Reclaimerr that can schedule (canSchedule, a 14-day grace period) and one that cannot: each request card's chip and
// lines, the approve step's controls, its warning per choice, and the body the page sends. Upstream's build loads the page
// as a group of its own when a page needs it (abcaa16d's loader, not ported here): the script asks JE.loader for that group
// first, as opening the Leaving soon tab does; this tree's build has no loader and the page is already there.
export default async ({ page, until }) => {
  await until(() => page.evaluate(() => !!window.JellyfinEnhanced?.pluginConfig), 20000);
  return page.evaluate(async () => {
    const lines = [];
    const server = await ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('JellyfinEnhanced/leaving-soon/list'), dataType: 'json' });
    lines.push(`server list keys: ${Object.keys(server).join(',')}`);
    lines.push(`server canSchedule=${JSON.stringify(server.canSchedule)} graceDays=${JSON.stringify(server.graceDays)}`);
    const sent = [];
    let list = null;
    const real = ApiClient.ajax.bind(ApiClient);
    ApiClient.ajax = (opts) => {
      const url = String(opts.url || '');
      if (url.includes('JellyfinEnhanced/leaving-soon/list') && list) return Promise.resolve(JSON.parse(JSON.stringify(list)));
      if (url.includes('JellyfinEnhanced/reclaimerr/requests/')) { sent.push(`${opts.type} ${url.replace(/^.*JellyfinEnhanced\//, '')} ${opts.data}`); return Promise.resolve({ ok: true }); }
      return real(opts);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const pending = { id: 7, title: '12th Fail', year: 2023, mediaType: 'movie', requestedBy: 'sam', status: 'pending', scope: 'movie' };
    const requests = [
      pending,
      { id: 8, title: 'Cars', year: 2006, mediaType: 'movie', requestedBy: 'sam', status: 'approved', scope: 'movie', scheduledAt: '2026-12-10T08:00:00', scheduleState: 'scheduled' },
      { id: 9, title: 'Coco', year: 2017, mediaType: 'movie', requestedBy: 'sam', status: 'approved', scope: 'movie', scheduledAt: '2026-12-11T08:00:00', scheduleState: 'blocked' },
    ];
    const host = document.createElement('div');
    host.style.width = '1200px';
    document.body.appendChild(host);
    const card = (id) => [...host.querySelectorAll('.je-ls-reqcard')].find((c) => c.querySelector('.je-ls-name')?.textContent === requests.find((r) => r.id === id).title);
    const lsPage = async () => {
      if (!window.JellyfinEnhanced.leavingSoonPage && window.JellyfinEnhanced.loader?.ensure) await window.JellyfinEnhanced.loader.ensure('leavingsoon-page');
      for (let i = 0; i < 100 && !window.JellyfinEnhanced?.leavingSoonPage?.renderForCustomTab; i++) await wait(100);
      return window.JellyfinEnhanced.leavingSoonPage;
    };
    async function mount(data) {
      list = data;
      (await lsPage()).renderForCustomTab(host);
      for (let i = 0; i < 50 && !host.querySelector('.je-ls-reqcard'); i++) await wait(100);
    }
    const warn = (c) => JSON.stringify(c.querySelector('.je-ls-warn')?.textContent ?? null);
    for (const [label, extra] of [['can schedule, 14-day grace period', { canSchedule: true, graceDays: 14 }], ['cannot schedule', { canSchedule: false }]]) {
      await mount({ provider: 'reclaimerr', admin: true, canRequest: true, actions: true, items: [], mine: [], requests, requestsUnavailable: false, ...extra });
      lines.push(`== ${label}`);
      for (const c of host.querySelectorAll('.je-ls-reqcard')) {
        lines.push(`card: ${[...c.querySelectorAll('.je-ls-name, .je-ls-chip, .je-ls-sub, .je-ls-err')].map((e) => `${e.className.replace(/je-ls-/g, '')}=${e.textContent}`).join(' | ')}`);
      }
      let c = card(7);
      c.querySelector('.je-ls-icon-btn.approve').click();
      const select = c.querySelector('.je-ls-reqactions select');
      const day = c.querySelector('.je-ls-reqactions input[type="datetime-local"]');
      const yes = () => c.querySelector('.je-ls-btn.danger');
      lines.push(`approve step: warn=${warn(c)} confirm=${JSON.stringify(yes().textContent)} select=${select ? [...select.options].map((o) => `${o.value}:${o.textContent}`).join(' / ') : 'none'} date input=${day ? (day.hidden ? 'hidden' : 'shown') : 'none'}`);
      if (select) {
        lines.push(`  select colorScheme=${select.style.colorScheme || '(none)'} option colours set=${[...select.options].every((o) => o.style.backgroundColor && o.style.color)}`);
        for (const value of ['now', 'date']) {
          select.value = value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          lines.push(`  choose ${value}: warn=${warn(c)} date input=${day.hidden ? 'hidden' : 'shown'} confirm disabled=${yes().disabled}`);
        }
        day.value = '2020-01-01T10:00';
        day.dispatchEvent(new Event('input', { bubbles: true }));
        lines.push(`  a past day: warn=${warn(c)} confirm disabled=${yes().disabled}`);
        day.value = '2027-01-15T10:00';
        day.dispatchEvent(new Event('input', { bubbles: true }));
        lines.push(`  2027-01-15T10:00: warn=${warn(c)} confirm disabled=${yes().disabled}`);
      }
      c.querySelector('.je-ls-reqactions input[type="text"]').value = 'next week';
      yes().click();
      for (let i = 0; i < 30 && sent.length === 0; i++) await wait(100);
      lines.push(`sent: ${sent.splice(0).join(' ; ') || 'nothing'}`);
      await wait(300);
    }
    (await lsPage()).stopPolling();
    host.remove();
    ApiClient.ajax = real;
    lines.push(`browser time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
    return lines.join('\n');
  });
};
