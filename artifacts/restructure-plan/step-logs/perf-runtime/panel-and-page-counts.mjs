// The settled counts behind the three descriptive numbers `je12 smoke` prints (settings tabs, tagged cards, JE
// elements on a details page). The smoke run prints each count the moment it first becomes non-zero, so a faster or
// slower page changes the number it prints; this script waits until each count has stopped changing.
//
//   je12 browse '#/home' --script artifacts/restructure-plan/step-logs/perf-runtime/panel-and-page-counts.mjs
export default async ({ page, go, until, sleep, base }) => {
    const count = selector => page.evaluate(s => document.querySelectorAll(s).length, selector);
    /** Sample every 250 ms until five samples in a row agree (at most 20 s); returns [first non-zero, settled]. */
    const settle = async (read) => {
        let first = 0, last = -1, same = 0;
        for (let i = 0; i < 80 && same < 5; i++) {
            const now = await read();
            if (!first && now) first = now;
            same = now === last ? same + 1 : 0;
            last = now;
            await sleep(250);
        }
        return [first, last];
    };

    await go('#/home');
    await until(() => page.evaluate(() => typeof window.JellyfinEnhanced?.showEnhancedPanel === 'function'), 30000);
    await until(() => page.evaluate(async () => { try { await window.JellyfinEnhanced.showEnhancedPanel(); return true; } catch { return false; } }), 15000, 1000);
    const tabSelector = '#jellyfin-enhanced-panel [data-tab], .je-panel-tab, #jellyfin-enhanced-panel button[role="tab"]';
    const tabs = await settle(() => count(tabSelector));
    const tabNames = await page.evaluate(s => [...document.querySelectorAll(s)].map(e => `${e.tagName.toLowerCase()}:${e.getAttribute('data-tab') ?? e.textContent?.trim().slice(0, 24)}`), tabSelector);

    const library = await page.evaluate(async () => {
        const client = window.ApiClient;
        const views = await client.getUserViews({}, client.getCurrentUserId());
        return views.Items.find(v => v.CollectionType === 'movies')?.Id;
    });
    await go(`#/movies?topParentId=${library}&collectionType=movies`);
    await until(() => count('.card[data-id]'), 30000);
    const cards = await settle(() => count('.card[data-id]'));
    const tagged = await settle(() => count('.card[data-id] .je-tag-host'));

    const movie = await page.evaluate(async (parent) => {
        const client = window.ApiClient;
        const result = await client.getItems(client.getCurrentUserId(), { ParentId: parent, IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'SortName', Limit: 1 });
        return result.Items[0];
    }, library);
    await go(`#/details?id=${movie.Id}`);
    await until(() => count('.detailPagePrimaryContainer, .itemDetailPage:not(.hide)'), 30000);
    const jeElements = await settle(() => page.evaluate(() => document.querySelectorAll('style[id^="je"], [class*="je-"]').length));

    return JSON.stringify({ tabsFirstThenSettled: tabs, tabNames, cardsFirstThenSettled: cards, taggedFirstThenSettled: tagged, movie: movie.Name, jeElementsFirstThenSettled: jeElements });
};
