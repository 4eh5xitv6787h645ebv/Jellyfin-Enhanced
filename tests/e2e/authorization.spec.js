'use strict';

const { expect, test } = require('@playwright/test');
const { ADMIN_USER, USER_AUTH_STATE, WEB_URL } = require('./support/env');
const {
    assertHealthy,
    collectDiagnostics,
    currentUser,
    installReadOnlyGuard,
    waitForPlugin,
} = require('./support/jellyfin');

test.use({ storageState: USER_AUTH_STATE });

test('standard user receives public configuration but no private or admin data', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const user = await currentUser(page);
    expect(user.isAdministrator).toBe(false);
    await expect(page.locator('.lnkManageServer')).toHaveCount(0);

    const otherUserId = await page.evaluate(async adminName => {
        const response = await fetch(window.ApiClient.getUrl('/Users/Public'));
        const users = await response.json();
        const admin = users.find(user => user.Name === adminName);
        if (!admin) throw new Error(`Public administrator user not found: ${adminName}`);
        return admin.Id;
    }, ADMIN_USER);
    const access = await page.evaluate(async adminUserId => {
        const JE = window.JellyfinEnhanced;
        const headers = JE.core.api.authHeaders();
        const get = async path => {
            const response = await fetch(window.ApiClient.getUrl(path), { headers });
            const text = await response.text();
            let value = null;
            try { value = text ? JSON.parse(text) : null; } catch { value = text; }
            return { status: response.status, value };
        };
        return {
            adminHiddenUsers: await get('/JellyfinEnhanced/admin/hidden-content-users'),
            maintenance: await get('/JellyfinEnhanced/MaintenanceMode/Status'),
            otherUserSettings: await get(`/JellyfinEnhanced/user-settings/${adminUserId}/settings.json`),
            privateConfig: await get('/JellyfinEnhanced/private-config'),
            publicConfig: await get('/JellyfinEnhanced/public-config'),
        };
    }, otherUserId);

    expect(access.privateConfig.status).toBe(200);
    expect(access.privateConfig.value).toEqual({});
    expect(access.publicConfig.status).toBe(200);
    expect(Object.keys(access.publicConfig.value).length).toBeGreaterThan(100);
    expect(access.adminHiddenUsers.status).toBe(403);
    expect(access.maintenance.status).toBe(403);
    expect(access.otherUserSettings.status).toBe(403);

    const clientConfig = await page.evaluate(() => {
        const config = window.JellyfinEnhanced.pluginConfig;
        const secretPaths = [];
        const visit = (value, path = []) => {
            if (!value || typeof value !== 'object') return;
            Object.entries(value).forEach(([key, nested]) => {
                const nextPath = [...path, key];
                if (/^(?:ApiKey|JellyseerrApiKey|RadarrApiKey|SonarrApiKey|TMDB_API_KEY)$/i.test(key)
                    && nested !== null && nested !== undefined && nested !== '') {
                    secretPaths.push(nextPath.join('.'));
                }
                visit(nested, nextPath);
            });
        };
        visit(config);
        return {
            hasArrApiKey: Object.hasOwn(config, 'RadarrApiKey'),
            hasSeerrApiKey: Object.hasOwn(config, 'JellyseerrApiKey'),
            hasSonarrApiKey: Object.hasOwn(config, 'SonarrApiKey'),
            hasTmdbApiKey: Object.hasOwn(config, 'TMDB_API_KEY'),
            secretPaths,
        };
    });
    expect(clientConfig).toEqual({
        hasArrApiKey: false,
        hasSeerrApiKey: false,
        hasSonarrApiKey: false,
        hasTmdbApiKey: false,
        secretPaths: [],
    });

    await assertHealthy(diagnostics, violations, testInfo, {
        allowedHttpError: item => {
            const pathname = new URL(item.url).pathname;
            return item.status === 403 && (
                pathname.endsWith('/JellyfinEnhanced/admin/hidden-content-users')
                || pathname.endsWith('/JellyfinEnhanced/MaintenanceMode/Status')
                || pathname.endsWith(`/JellyfinEnhanced/user-settings/${otherUserId}/settings.json`)
            );
        },
    });
});

test('standard user can load all read-only embedded feature views', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const views = await page.evaluate(async () => {
        const headers = window.JellyfinEnhanced.core.api.authHeaders();
        const names = ['calendarPage', 'downloadsPage', 'bookmarksPage', 'hiddenContentPage'];
        return Promise.all(names.map(async name => {
            const response = await fetch(window.ApiClient.getUrl(`/JellyfinEnhanced/${name}`), { headers });
            return {
                body: await response.text(),
                contentType: response.headers.get('content-type'),
                name,
                status: response.status,
            };
        }));
    });

    const expectedMarkers = {
        bookmarksPage: 'sections bookmarks',
        calendarPage: 'je-calendar-container',
        downloadsPage: 'je-downloads-container',
        hiddenContentPage: 'je-hidden-content-container',
    };
    for (const view of views) {
        expect(view.status, view.name).toBe(200);
        expect(view.contentType, view.name).toContain('text/html');
        expect(view.body, view.name).toContain(expectedMarkers[view.name]);
    }

    await page.evaluate(() => window.JellyfinEnhanced.showEnhancedPanel());
    await expect(page.locator('#jellyfin-enhanced-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#jellyfin-enhanced-panel')).toHaveCount(0);

    await assertHealthy(diagnostics, violations, testInfo);
});
