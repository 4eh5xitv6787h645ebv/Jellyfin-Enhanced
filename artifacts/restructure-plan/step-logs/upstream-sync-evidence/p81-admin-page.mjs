// Upstream b0a8a963 (analytics icon on reported settings; open tab and card kept in the config page address), run on
// both builds: the badges the page draws, what the address says after tab, card and badge clicks, and what a fresh load
// of an address opens, with and without a tab saved in the session.
export default async ({ page, go, until, sleep }) => {
    const cfg = '#/configurationpage?name=Jellyfin%20Enhanced';
    const out = {};
    const ready = () => until(() => page.evaluate(() => [...document.querySelectorAll('.jea-nav .jellyfin-tab-button.active')].some(b => b.getClientRects().length)), 20000);
    // jellyfin-web can keep an older, hidden copy of the page: every query is scoped to the one shown.
    const shown = 'globalThis.__jeShown = () => [...document.querySelectorAll("#JellyfinEnhancedPage")].find(p => !p.classList.contains("hide") && p.getClientRects().length) || null';
    const state = () => page.evaluate(src => {
        (0, eval)(src);
        const root = globalThis.__jeShown();
        if (!root) return { hash: location.hash, page: 'not shown' };
        return {
            hash: decodeURIComponent(location.hash).replace(/\+/g, ' '),
            tab: root.querySelector('.jellyfin-tab-button.active')?.dataset.tab ?? null,
            card: [...root.querySelectorAll('.jellyfin-tab-content.active.jea-focused > fieldset.jea-focus > legend')]
                .map(l => [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()).join(',') || null,
            mtSection: root.classList.contains('je-mt-active') || root.querySelector('#media-tags.active') ? (root.querySelector('.je-tag-admin')?.dataset.tab ?? null) : null,
        };
    }, shown);
    const vis = sel => page.locator(sel + ' >> visible=true');
    const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + String(e.message || e).split('\n')[0]; } };
    // A real page load (a reload, a bookmark, a link from elsewhere): leave the document first, since a goto that
    // changes only the hash stays in the same document. sessionStorage survives in the same tab.
    const save = t => page.evaluate(t => { if (t) sessionStorage.setItem('jellyfinEnhancedActiveTab', t); else sessionStorage.removeItem('jellyfinEnhancedActiveTab'); }, t ?? null);
    const fresh = async (hash, savedTab) => {
        await save(savedTab);
        await page.goto('about:blank');
        await go(hash);
        if (!hash.includes('configurationpage')) { await sleep(3000); return null; }
        await ready();
        await sleep(2500);
        return state();
    };

    // A. Plain load, nothing saved: the badges.
    await go('#/home');
    await page.evaluate(() => sessionStorage.removeItem('jellyfinEnhancedActiveTab'));
    await go(cfg);
    await ready();
    await until(() => page.evaluate(() => document.querySelectorAll('.jea-analytics').length > 0), 15000).catch(() => null);
    await step('A_badges', () => page.evaluate(src => {
        (0, eval)(src);
        const root = globalThis.__jeShown();
        const badges = [...root.querySelectorAll('.jea-analytics')];
        const ids = badges.map(b => {
            const label = b.closest('label');
            const control = label && (label.control || label.querySelector('input,select,textarea'));
            return control ? control.id : '?';
        }).sort();
        return {
            count: badges.length,
            href: badges[0]?.getAttribute('href') ?? null,
            text: badges[0]?.textContent ?? null,
            title: badges[0]?.getAttribute('title') ?? null,
            inLabel: badges.every(b => !!b.closest('label')),
            ids: ids.join(' '),
        };
    }, shown));
    await step('A_state', state);

    // B. A tab click.
    await step('B_tabClick', async () => {
        await vis('.jea-nav .jellyfin-tab-button[data-tab="seerr"]').click();
        await sleep(800);
        return state();
    });

    // C. A card in the sidebar.
    await step('C_cardClick', async () => {
        const leaf = vis('.jea-nav .jellyfin-tab-button[data-tab="seerr"] + .jea-nav-tree > .jea-nav-leaf:not(.jea-nav-sub)').nth(1);
        const text = (await leaf.textContent())?.trim();
        await leaf.click();
        await sleep(1000);
        return { leaf: text, ...(await state()) };
    });

    // D. A badge on the Display tab: it opens the Usage Statistics card; the toggle it sits beside must not change.
    await step('D_badgeClick', async () => {
        await vis('.jea-nav .jellyfin-tab-button[data-tab="display"]').click();
        await sleep(800);
        const before = await state();
        const badge = vis('#display .jea-analytics').first();
        const control = await badge.evaluate(b => { const l = b.closest('label'); const c = l && (l.control || l.querySelector('input')); return c ? { id: c.id, checked: c.checked } : null; });
        await badge.click();
        await sleep(1500);
        const checkedAfter = control ? await page.evaluate(id => [...document.querySelectorAll('#' + id)].find(e => e.getClientRects().length || true)?.checked, control.id) : null;
        return { before: before.hash, control, checkedAfter, ...(await state()) };
    });

    // E. Fresh load of a tab-and-card address, nothing saved.
    await step('E_tabCard', () => fresh(cfg + '&tab=admin&card=usage-statistics', null));
    // F. Same, with another tab saved in the session.
    await step('F_tabCard_savedDisplay', () => fresh(cfg + '&tab=admin&card=usage-statistics', 'display'));
    // G. A Media Tags section link, nothing saved.
    await step('G_mediaTags', () => fresh(cfg + '&jeSection=media-tags&tab=layout', null));
    // H. The same link with another tab saved in the session.
    await step('H_mediaTags_savedDisplay', () => fresh(cfg + '&jeSection=media-tags&tab=layout', 'display'));
    // I. A setting-card link (jeSection=<setting id>), nothing saved, then with another tab saved.
    await step('I_setting', () => fresh(cfg + '&jeSection=TMDB_API_KEY', null));
    await step('I_setting_savedDisplay', () => fresh(cfg + '&jeSection=TMDB_API_KEY', 'display'));
    // K. The same links followed inside the web client (from the home page), with another tab saved.
    const inApp = async (hash, savedTab) => {
        await fresh('#/home', savedTab);
        await page.evaluate(h => { location.hash = h; }, hash.slice(1));
        await ready();
        await sleep(2500);
        return state();
    };
    await step('K_inApp_mediaTags_savedDisplay', () => inApp(cfg + '&jeSection=media-tags&tab=layout', 'display'));
    await step('K_inApp_tabCard_savedDisplay', () => inApp(cfg + '&tab=admin&card=usage-statistics', 'display'));
    // J. From the Display tab: the Media Tags tab clicked, then one of its sections, then a reload.
    await step('J_mtTab', async () => {
        await fresh(cfg, 'display');
        await vis('.jea-nav .jellyfin-tab-button[data-tab="media-tags"]').click();
        await sleep(2500);
        return state();
    });
    await step('J_mtSection', async () => {
        await vis('[data-je-mt-tree] .jea-nav-leaf[data-je-mt-section="badges"]').click();
        await sleep(1500);
        return state();
    });
    await step('J_afterReload', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ready();
        await sleep(2500);
        return state();
    });
    return out;
};
