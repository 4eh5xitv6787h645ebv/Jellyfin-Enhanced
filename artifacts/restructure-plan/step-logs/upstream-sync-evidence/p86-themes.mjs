// Upstream b84c45dd (#1085) on both builds: the Recommendations page (its page of its own) with a filter set from its
// address, under two community themes' rules added after JE's stylesheets, as jellyfin-web adds the server's custom
// CSS: Zesty's unscoped `button.emby-tab-button:nth-child(3) { display: none; }` and JellyFlix's chosen-tab bar in
// ::after. Read: which of All / Movies / Series show, and the Filters pill's marks and ::after. Feeds: p85-*.json.
export default async ({ page, go, until, sleep }) => {
    await go('#/recommendations#jeScore=7..');
    await until(() => page.evaluate(() => !!document.querySelector('#je-recommendations-page:not(.hide) .je-reco-tools .jellyseerr-filters-btn')), 20000);
    await sleep(2000);
    await page.evaluate(() => {
        const theme = document.createElement('style');
        theme.textContent = 'button.emby-tab-button:nth-child(3) { display: none; }\n'
            + '.emby-tab-button.emby-tab-button-active::after { transform: scale(1); }\n'
            + '.emby-tab-button::after { content: ""; width: calc(100% - 2em); position: absolute; height: 4px; background: #e50914; border-radius: 10px; transform: scaleX(0); transition: 0s; left: 1em; bottom: 0.75em; }';
        document.body.appendChild(theme);
    });
    await sleep(500);
    return page.evaluate(() => {
        const tools = document.querySelector('#je-recommendations-page:not(.hide) .je-reco-tools');
        const tabs = [...tools.querySelectorAll('.jellyseerr-filter-btn')].map(tab => `${tab.dataset.mode}:${getComputedStyle(tab).display}`);
        const pill = tools.querySelector('.jellyseerr-filters-btn');
        const after = getComputedStyle(pill, '::after');
        return {
            tabs: tabs.join(' '),
            pill: { on: pill.hasAttribute('data-on'), chosen: pill.classList.contains('emby-tab-button-active'), name: pill.querySelector('.jellyseerr-filters-name')?.textContent },
            pillAfter: { background: after.backgroundColor, image: after.backgroundImage, transform: after.transform },
            pillColours: { background: getComputedStyle(pill).backgroundColor, color: getComputedStyle(pill).color }
        };
    });
};
