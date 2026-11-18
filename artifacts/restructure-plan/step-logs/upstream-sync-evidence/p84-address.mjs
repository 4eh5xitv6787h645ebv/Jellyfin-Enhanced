// Upstream 5201d47b (the configuration page's address after b0a8a963): how the address spells the page name once the
// page has rewritten it, whether the dashboard still marks the page in its menu, and whether showing the Media Tags tab
// again (its button, the end of a search) keeps the section in the address, so that a copied link opens that section.
export default async ({ page, go, until, sleep }) => {
    const cfg = '#/configurationpage?name=Jellyfin%20Enhanced';
    const out = {};
    const ready = () => until(() => page.evaluate(() => [...document.querySelectorAll('.jea-nav .jellyfin-tab-button.active')].some(b => b.getClientRects().length)), 20000);
    // jellyfin-web can keep an older, hidden copy of the page: every query is scoped to the one shown.
    const shown = 'globalThis.__jeShown = () => [...document.querySelectorAll("#JellyfinEnhancedPage")].find(p => !p.classList.contains("hide") && p.getClientRects().length) || null';
    const state = () => page.evaluate(src => {
        (0, eval)(src);
        const root = globalThis.__jeShown();
        // The dashboard menu's entries for this page, and whether the menu marks one as the page shown.
        const menu = [...document.querySelectorAll('a[href*="configurationpage?name=Jellyfin"]')]
            .filter(a => !root || !root.contains(a))
            .filter(a => a.getClientRects().length)
            .map(a => (a.classList.contains('Mui-selected') || a.getAttribute('aria-current') ? 'selected' : 'not selected'));
        if (!root) return { hash: location.hash, page: 'not shown', menu: menu.join(',') || null };
        return {
            hash: location.hash,
            tab: root.querySelector('.jellyfin-tab-button.active')?.dataset.tab ?? null,
            mtSection: root.querySelector('#media-tags.active') ? (root.querySelector('.je-tag-admin')?.dataset.tab ?? null) : null,
            searching: root.querySelector('#JellyfinEnhancedForm.je-search-mode') ? true : undefined,
            menu: menu.join(',') || null,
        };
    }, shown);
    const vis = sel => page.locator(sel + ' >> visible=true');
    const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + String(e.message || e).split('\n')[0]; } };
    // A real page load (a reload, a bookmark, a link from elsewhere): leave the document first. `keep` false starts a
    // new browser session (another administrator opening a shared link).
    const fresh = async (hash, keep) => {
        if (!keep) await page.evaluate(() => sessionStorage.clear());
        await page.goto('about:blank');
        await go(hash);
        await ready();
        await sleep(2500);
        return state();
    };

    // A. The page, then a tab click: the address the page writes, and the dashboard menu.
    await go('#/home');
    await page.evaluate(() => sessionStorage.clear());
    await step('A_opened', async () => { await go(cfg); await ready(); await sleep(1500); return state(); });
    await step('A_tabClick', async () => {
        await vis('.jea-nav .jellyfin-tab-button[data-tab="seerr"]').click();
        await sleep(1000);
        return state();
    });
    // B. A reload of the address the page wrote.
    await step('B_reload', async () => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await ready();
        await sleep(2500);
        return state();
    });
    // C. Media Tags › Colours, then the Media Tags tab's own button again.
    await step('C_colours', async () => {
        await vis('.jea-nav .jellyfin-tab-button[data-tab="media-tags"]').click();
        await until(() => page.evaluate(() => !!document.querySelector('#media-tags.active .je-ta-tabs')), 15000);
        await vis('[data-je-mt-tree] .jea-nav-leaf[data-je-mt-section="colours"]').click();
        await sleep(1500);
        return state();
    });
    await step('C_mtButtonAgain', async () => {
        await vis('.jea-nav .jellyfin-tab-button[data-tab="media-tags"]').click();
        await sleep(2000);
        return state();
    });
    // D. The address as left, opened in a new session (a copied link).
    await step('D_copiedLink', async () => fresh(await page.evaluate(() => location.hash), false));
    // E. Media Tags › Colours again, then a search and its end (Escape).
    await step('E_afterSearch', async () => {
        await fresh(cfg + '&jeSection=media-tags&tab=colours', false);
        const input = vis('#settingsSearchInput');
        await input.fill('rating');
        await sleep(800);
        await input.press('Escape');
        await sleep(2000);
        return state();
    });
    await step('E_copiedLink', async () => fresh(await page.evaluate(() => location.hash), false));
    // F. A Media Tags section link with Media Tags the tab the session kept (upstream's case).
    await step('F_link_savedMediaTags', async () => {
        await page.evaluate(() => { sessionStorage.clear(); sessionStorage.setItem('jellyfinEnhancedActiveTab', 'media-tags'); sessionStorage.setItem('JE_mediaTagsAdminTab', 'layout'); });
        return fresh(cfg + '&jeSection=media-tags&tab=colours', true);
    });
    return out;
};
