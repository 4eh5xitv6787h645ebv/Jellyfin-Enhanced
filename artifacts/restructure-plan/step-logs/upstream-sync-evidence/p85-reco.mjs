// Upstream d617312f (#1084) on both builds: the Recommendations page (its page of its own, the sidebar's) with its
// filters in its address (`#/recommendations#jeType=movies&jeScore=7..`): the rows of the kind shown, Trending kept by
// what its titles say, the page's toolbar, then Series chosen on its tabs. The mock's feeds are p85-*.json (the mock
// answers a feed whatever its filters: what Seerr is asked for is in the mock's log, kept beside this).
export default async ({ page, go, until, sleep }) => {
    const out = {};
    const state = () => page.evaluate(() => {
        const root = document.querySelector('#je-recommendations-page:not(.hide)');
        if (!root) return { hash: location.hash, page: 'not shown' };
        return {
            hash: location.hash,
            rows: [...root.querySelectorAll('.je-recommendations-section h2, .je-recommendations-section .sectionTitle')].map(h => h.textContent.trim()).filter(Boolean).join(' | '),
            cards: [...root.querySelectorAll('.card')].map(c => (c.querySelector('.cardText-first, .cardText') ?? c).textContent.trim()).filter(Boolean).join(' | '),
            type: root.querySelector('.je-reco-tools .jellyseerr-filter-btn.emby-tab-button-active')?.dataset.mode ?? null,
            filters: root.querySelector('.je-reco-tools .jellyseerr-filters-name')?.textContent ?? null,
            said: [...root.querySelectorAll('.jellyseerr-filters-token')].map(t => t.textContent.trim()).join(' | '),
            none: !!root.querySelector('.je-reco-filters-none')
        };
    });
    const loaded = () => until(() => page.evaluate(() => {
        const root = document.querySelector('#je-recommendations-page:not(.hide)');
        return !!root && !root.querySelector('.je-skeleton-rows, [aria-label="Loading recommendations…"]') && root.querySelectorAll('.je-recommendations-section').length > 0;
    }), 20000);
    const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + String(e.message || e).split('\n')[0]; } };
    await step('A_link', async () => { await go('#/recommendations#jeType=movies&jeScore=7..'); await loaded(); await sleep(1500); return state(); });
    await step('B_series', async () => {
        const length = await page.evaluate(() => history.length);
        await page.evaluate(() => document.querySelector('#je-recommendations-page:not(.hide) .je-reco-tools .jellyseerr-filter-btn[data-mode="tv"]').click());
        await sleep(2500);
        return { ...(await state()), historyGrew: (await page.evaluate(() => history.length)) - length };
    });
    return out;
};
