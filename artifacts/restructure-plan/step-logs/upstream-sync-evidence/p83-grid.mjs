// Upstream 6b8c9218 on both builds: a person page's Seerr discovery section, with a theme rule like ElegantFin's that
// lays the details section out as a four-column grid. The section should span the details section's whole width.
export default async ({ page, go, until, sleep }) => {
    await go('#/details?id=b31e70f9618b4345b21e33626a3aa4d6');
    await until(() => page.evaluate(() => [...document.querySelectorAll('.itemDetailPage:not(.hide) .jellyseerr-discovery-section')].some(s => s.getClientRects().length)), 20000);
    await sleep(1500);
    return page.evaluate(() => {
        const view = document.querySelector('.itemDetailPage:not(.hide)');
        const detail = view.querySelector('.detailPagePrimaryContent .detailSection');
        const theme = document.createElement('style');
        theme.textContent = '.detailSection { display: grid !important; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }';
        document.head.append(theme);
        const section = view.querySelector('.jellyseerr-discovery-section');
        const width = el => Math.round(el.getBoundingClientRect().width);
        const style = getComputedStyle(section);
        return { section: section.className.split(' ').find(c => /^jellyseerr-.*-discovery-section$/.test(c)), inDetailSection: section.parentElement === detail,
            cards: section.querySelectorAll('.card').length, detailWidth: width(detail), sectionWidth: width(section), gridColumn: style.gridColumnStart + ' / ' + style.gridColumnEnd };
    });
};
