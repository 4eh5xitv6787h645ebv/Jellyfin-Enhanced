// Upstream d617312f (#1084) on both builds: a person page's Seerr discovery section ("More with …", the mock's credits
// p85-credits.json) with its filters in the page's address, the Filters menu's new groups, all / any, the Without lists,
// and saved filters (saved through the menu, kept on the server, applied from the menu). The section's titles are read
// by their names, the line of what is set by its pieces.
export default async ({ page, go, until, sleep }) => {
    const person = '#/details?id=b31e70f9618b4345b21e33626a3aa4d6';
    const out = {};
    const shown = 'globalThis.__jeSection = () => [...document.querySelectorAll(".itemDetailPage:not(.hide) .jellyseerr-person-discovery-section")].find(s => s.getClientRects().length) || null';
    const state = () => page.evaluate(src => {
        (0, eval)(src);
        const s = globalThis.__jeSection();
        if (!s) return { hash: location.hash, section: 'none' };
        const names = [...s.querySelectorAll('.card')].filter(c => getComputedStyle(c).display !== 'none')
            .map(c => (c.querySelector('.cardText-first, .cardText') ?? c).textContent.trim()).join(' | ');
        return {
            hash: location.hash.replace(/^#\/details\?id=[0-9a-f]+(&serverId=[0-9a-f]+)?/, '#/details?id=P'),
            type: s.querySelector('.jellyseerr-filter-btn.emby-tab-button-active')?.dataset.mode ?? null,
            sort: s.querySelector('.jellyseerr-sort-btn')?.getAttribute('aria-label') ?? null,
            filters: s.querySelector('.jellyseerr-filters-name')?.textContent ?? null,
            said: [...s.querySelectorAll('.jellyseerr-filters-token')].map(t => t.textContent.trim()).join(' | '),
            none: !!s.querySelector('.jellyseerr-filters-none'),
            titles: names
        };
    }, shown);
    const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + String(e.message || e).split('\n')[0]; } };
    const ready = () => until(() => page.evaluate(src => { (0, eval)(src); return !!globalThis.__jeSection()?.querySelector('.card'); }, shown), 20000);
    const fresh = async hash => { await page.goto('about:blank'); await go(hash); await ready(); await sleep(1500); return state(); };
    const menuGroups = () => page.evaluate(() => [...document.querySelectorAll('.jellyseerr-sort-menu .jellyseerr-menu-group')].map(g =>
        `${g.querySelector('.actionSheetItemText')?.textContent ?? ''}=${g.querySelector('.jellyseerr-menu-group-value')?.textContent ?? ''}`).join(' | '));
    const openFilters = async () => {
        await page.evaluate(src => { (0, eval)(src); globalThis.__jeSection().querySelector('.jellyseerr-filters-btn').click(); }, shown);
        await until(() => page.evaluate(() => !!document.querySelector('.jellyseerr-sort-menu')), 5000);
        await sleep(600);
    };
    const closeMenu = async () => { await page.keyboard.press('Escape'); await sleep(400); };

    // A. A link with the section's filters: the type, a score, the order.
    await step('A_link', () => fresh(`${person}#jeType=movies&jeScore=7..&jeSort=vote_count.desc`));
    // B. Series on the tabs: the address follows, with no history entry.
    await step('B_series', async () => {
        const length = await page.evaluate(() => history.length);
        await page.evaluate(src => { (0, eval)(src); globalThis.__jeSection().querySelector('.jellyseerr-filter-btn[data-mode="tv"]').click(); }, shown);
        await sleep(1200);
        return { ...(await state()), historyGrew: (await page.evaluate(() => history.length)) - length };
    });
    // C. A reload keeps what the address says.
    await step('C_reload', async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); await sleep(1500); return state(); });
    // D. The Without lists and all / any, from links.
    await step('D_without', () => fresh(`${person}#jeWithoutGenres=35/35:Comedy&jeWithoutLanguage=ja`));
    await step('D_allGenres', () => fresh(`${person}#jeGenres=16/16:Animation,35/35:Comedy`));
    await step('D_anyGenres', () => fresh(`${person}#jeGenres=16/16:Animation,35/35:Comedy&jeAny=genres`));
    // E. The Filters menu's groups, with Without genres and all / any set.
    await step('E_menu', async () => { await openFilters(); const groups = await menuGroups(); await closeMenu(); return groups; });
    // F. Saved filters: save what is set under a name, then clear the filters, then apply it from the menu.
    await step('F_save', async () => {
        await page.evaluate(async () => {
            const user = ApiClient.getCurrentUserId();
            const url = ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${user}/discovery-filter-profiles`);
            const list = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            for (const p of list.profiles ?? []) await ApiClient.ajax({ type: 'DELETE', url: `${url}/${p.id}` });
        });
        await openFilters();
        await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-sort-menu .jellyseerr-menu-group')].find(g => g.dataset.toggle === 'profiles').click());
        await until(() => page.evaluate(() => !!document.querySelector('.jellyseerr-menu-profile-form input:not([disabled])')), 8000);
        await page.fill('.jellyseerr-menu-profile-form input', 'Animated or funny');
        await page.click('.jellyseerr-menu-profile-save');
        await until(() => page.evaluate(() => /Saved as/.test(document.querySelector('.jellyseerr-sort-menu .jellyseerr-menu-note:not([hidden])')?.textContent ?? '')), 8000);
        const said = await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-sort-menu .jellyseerr-menu-note')].map(n => n.textContent).filter(Boolean).join(' | '));
        const rows = await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-menu-profile')].map(r => r.textContent.trim()).join(' | '));
        const groups = await menuGroups();
        await closeMenu();
        const stored = await page.evaluate(async () => {
            const url = ApiClient.getUrl(`/JellyfinEnhanced/user-settings/${ApiClient.getCurrentUserId()}/discovery-filter-profiles`);
            const list = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
            return (list.profiles ?? []).map(p => `${p.name}: ${p.filters}`).join(' | ');
        });
        return { said, rows, groups, stored };
    });
    await step('F_apply', async () => {
        await fresh(person);
        await openFilters();
        await page.evaluate(() => [...document.querySelectorAll('.jellyseerr-sort-menu .jellyseerr-menu-group')].find(g => g.dataset.toggle === 'profiles').click());
        await until(() => page.evaluate(() => !!document.querySelector('.jellyseerr-menu-profile')), 8000);
        await page.evaluate(() => document.querySelector('.jellyseerr-menu-profile').click());
        await sleep(1500);
        return { menuOpen: await page.evaluate(() => !!document.querySelector('.jellyseerr-sort-menu')), ...(await state()) };
    });
    // G. Filters that leave nothing: the section says so, and the menu says it in its foot.
    await step('G_none', async () => {
        await fresh(`${person}#jeScore=9.5..`);
        await openFilters();
        const foot = await page.evaluate(() => document.querySelector('.jellyseerr-sort-menu .jellyseerr-menu-outcome:not([hidden])')?.textContent ?? null);
        await closeMenu();
        return { ...(await state()), foot };
    });
    return out;
};
