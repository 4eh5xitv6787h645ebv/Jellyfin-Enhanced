'use strict';

const { expect, test } = require('@playwright/test');
const { ADMIN_AUTH_STATE, WEB_URL } = require('./support/env');
const {
    assertHealthy,
    collectDiagnostics,
    findMediaItem,
    installReadOnlyGuard,
    navigateToDetails,
    navigationCounts,
    waitForPlugin,
} = require('./support/jellyfin');

test.use({ storageState: ADMIN_AUTH_STATE });

test('admin configuration bootstraps declarative fields and switches tabs', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    await page.evaluate(() => {
        window.location.hash = '#/configurationpage?name=Jellyfin%20Enhanced';
    });
    await expect(page.locator('#JellyfinEnhancedPage')).toBeVisible();
    await expect(page.locator('#JellyfinEnhancedForm')).toBeVisible();
    await expect(page.locator('#JellyfinEnhancedPage script[src*="/Configuration/config-page.js"]')).toHaveCount(1);

    const keys = await page.locator('#JellyfinEnhancedPage [data-config-key]').evaluateAll(elements => {
        return elements.map(element => element.dataset.configKey);
    });
    expect(keys).toHaveLength(200);
    expect(new Set(keys).size).toBe(200);

    const config = await page.evaluate(() => {
        return window.ApiClient.getPluginConfiguration('f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b');
    });
    await expect(page.locator('#JellyfinEnhancedPage #jellyseerrEnabled')).toBeChecked({
        checked: config.JellyseerrEnabled === true,
    });
    await expect(page.locator('#JellyfinEnhancedPage #ToastDuration')).toHaveValue(String(config.ToastDuration));
    await expect(page.locator('#JellyfinEnhancedPage #DefaultLanguage')).toHaveValue(config.DefaultLanguage || '');

    const tabs = page.locator('#JellyfinEnhancedPage .jellyfin-tab-button');
    await expect(tabs).toHaveCount(11);
    await tabs.filter({ hasText: 'Display' }).click();
    await expect(page.locator('#JellyfinEnhancedPage .jellyfin-tab-button[data-tab="display"]')).toHaveClass(/active/);
    await expect(page.locator('#JellyfinEnhancedPage #display')).toHaveClass(/active/);

    await assertHealthy(diagnostics, violations, testInfo);
});

test('details enhancements survive repeated SPA navigation without lifecycle growth', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const series = await findMediaItem(page, 'Series');
    let details = await navigateToDetails(page, series);
    await expect(details.locator('.je-detail-hide-btn')).toBeVisible();
    await expect(details.locator('.je-review-write-btn')).toBeVisible();

    const seerrStatus = await page.evaluate(async () => {
        const JE = window.JellyfinEnhanced;
        return {
            configEnabled: !!JE.pluginConfig.JellyseerrEnabled,
            status: await JE.jellyseerrAPI.checkUserStatus(),
        };
    });
    expect(seerrStatus.configEnabled).toBe(true);
    expect(seerrStatus.status.active).toBe(true);
    expect(seerrStatus.status.userFound).toBe(true);
    await expect(details.locator('.je-series-request-more-btn')).toBeVisible();

    // Warm both routes before taking the baseline; Jellyfin caches view DOM.
    await page.evaluate(() => { window.location.hash = '#/home'; });
    await expect(page.locator('#indexPage:not(.hide)')).toBeVisible();
    details = await navigateToDetails(page, series);
    await expect(details.locator('.je-detail-hide-btn')).toBeVisible();
    const baseline = await navigationCounts(page);

    for (let i = 0; i < 3; i++) {
        await page.evaluate(() => { window.location.hash = '#/home'; });
        await expect(page.locator('#indexPage:not(.hide)')).toBeVisible();
        details = await navigateToDetails(page, series);
        await expect(details.locator('.je-detail-hide-btn')).toBeVisible();
    }
    expect(await navigationCounts(page)).toEqual(baseline);

    await assertHealthy(diagnostics, violations, testInfo, {
        allowedMutation: (item, startup) => !!startup
            && item.method === 'POST'
            && item.url === startup.url
            && item.body === startup.body,
        allowedMutationCount: 1,
        allowedRequestFailure: item => item.method === 'GET'
            && item.error === 'net::ERR_ABORTED'
            && /\/JellyfinEnhanced\/jellyseerr\/(?:movie|tv)\/\d+\/(?:similar|recommendations)$/.test(
                new URL(item.url).pathname,
            ),
    });
});

test('Requests, Calendar, Bookmarks, and native Hidden Content tabs render seeded data', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    await expect(page.locator('#customTabButton_2')).toHaveText(/Requests/);
    await page.locator('#customTabButton_2').click();
    await expect(page.locator('#customTab_2')).toHaveClass(/is-active/);
    await expect(page.locator('#customTab_2 .je-downloads-section').first()).toBeVisible();
    await expect(page.locator('#customTab_2 .je-download-card, #customTab_2 .je-request-card').first()).toBeVisible();

    await expect(page.locator('#customTabButton_3')).toHaveText(/Calendar/);
    await page.locator('#customTabButton_3').click();
    await expect(page.locator('#customTab_3')).toHaveClass(/is-active/);
    await expect(page.locator('#customTab_3 .je-calendar-header')).toBeVisible();
    await expect(page.locator('#customTab_3 [data-event-id]').first()).toBeVisible();

    await expect(page.locator('#customTabButton_4')).toHaveText(/Bookmarks/);
    await page.locator('#customTabButton_4').click();
    await expect(page.locator('#customTab_4')).toHaveClass(/is-active/);
    await expect(page.locator('#customTab_4 .je-bookmarks-wrapper')).toBeVisible();
    await expect(page.locator('#customTab_4 .je-bookmark-row').first()).toBeVisible();

    await page.locator('#je-native-tab-btn-hidden-content').click();
    await expect(page.locator('#je-native-tab-panel-hidden-content')).toHaveClass(/is-active/);
    await expect(page.locator('#je-hidden-content-container-tab .je-hidden-content-header')).toBeVisible();
    await expect(page.locator('#je-hidden-content-container-tab .je-hidden-item-card, #je-hidden-content-container-tab .je-hidden-group-card').first()).toBeVisible();

    await page.evaluate(() => window.JellyfinEnhanced.downloadsPage.stopPolling?.());
    await assertHealthy(diagnostics, violations, testInfo, {
        allowedPageError: item => item.message === "Cannot find module './'"
            && /\/web\/main\.jellyfin\.bundle\.js/i.test(item.stack),
        expectedAllowedPageErrors: 3,
    });
});

test('search renders Seerr results and opens the read-only more-info modal', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const movie = await findMediaItem(page, 'Movie');
    await page.evaluate(query => {
        window.location.hash = `#/search?query=${encodeURIComponent(query)}`;
    }, movie.name);
    await expect(page.locator('#searchPage:not(.hide)')).toBeVisible();
    await expect(page.locator('#searchTextInput')).toHaveValue(movie.name);
    await expect(page.locator('#searchPage:not(.hide) .card').first()).toBeVisible();

    const seerrStatus = await page.evaluate(async () => window.JellyfinEnhanced.jellyseerrAPI.checkUserStatus());
    expect(seerrStatus.active).toBe(true);
    expect(seerrStatus.userFound).toBe(true);
    await expect(page.locator('#searchPage:not(.hide) .jellyseerr-section').first()).toBeVisible();
    await expect(page.locator('#searchPage:not(.hide) .jellyseerr-card').first()).toBeVisible();

    const useModal = await page.evaluate(() => !!window.JellyfinEnhanced.pluginConfig.JellyseerrUseMoreInfoModal);
    if (useModal) {
        await page.locator('#searchPage:not(.hide) .jellyseerr-more-info-link').first().click();
        await expect(page.locator('.je-more-info-modal.active')).toBeVisible();
        await page.locator('.je-more-info-modal.active .modal-close').click();
        await expect(page.locator('.je-more-info-modal.active')).toHaveCount(0);
    }

    await assertHealthy(diagnostics, violations, testInfo);
});

test('Enhanced Panel opens its persisted tab and closes without saving', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    await page.evaluate(() => window.JellyfinEnhanced.showEnhancedPanel());
    await expect(page.locator('#jellyfin-enhanced-panel')).toBeVisible();
    const persistedTab = await page.evaluate(() => {
        return window.JellyfinEnhanced.currentSettings.lastOpenedTab || 'shortcuts';
    });
    const settingsTab = page.locator('#jellyfin-enhanced-panel .tab-button[data-tab="settings"]');
    await expect(settingsTab).toBeVisible();
    await settingsTab.click({ trial: true });
    await expect(page.locator('#jellyfin-enhanced-panel #settings-content')).toBeAttached();
    await expect(page.locator(`#jellyfin-enhanced-panel .tab-button[data-tab="${persistedTab}"]`)).toHaveClass(/active/);
    await expect(page.locator(`#jellyfin-enhanced-panel #${persistedTab}-content`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#jellyfin-enhanced-panel')).toHaveCount(0);

    await assertHealthy(diagnostics, violations, testInfo);
});
