// After the page rewrote its address (a tab click), leaving it and pressing Back returns to it, on the same tab.
export default async ({ page, go, until, sleep }) => {
    const shownTab = () => page.evaluate(() => [...document.querySelectorAll('.jellyfin-tab-button.active')].find(b => b.getClientRects().length)?.dataset.tab ?? null);
    await go('#/configurationpage?name=Jellyfin%20Enhanced');
    await until(shownTab, 20000);
    await page.locator('.jea-nav .jellyfin-tab-button[data-tab="seerr"] >> visible=true').click();
    await sleep(800);
    const rewritten = await page.evaluate(() => location.hash);
    await page.evaluate(() => { location.hash = '#/home'; });
    await sleep(3000);
    const away = await page.evaluate(() => location.hash);
    await page.goBack();
    await sleep(3000);
    return { rewritten, away, back: await page.evaluate(() => location.hash), tab: await shownTab() };
};
