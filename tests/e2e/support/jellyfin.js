'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('@playwright/test');
const { REPO_ROOT, WEB_URL } = require('./env');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SETTINGS_WRITE_PATH = /\/JellyfinEnhanced\/user-settings\/[0-9a-f-]+\/settings\.json$/i;
const DANGEROUS_CORE_PATHS = [
    /\/PlayedItems(?:\/|$)/i,
    /\/FavoriteItems(?:\/|$)/i,
    /\/Items\/[^/]+\/UserData(?:\/|$)/i,
    /\/Sessions\/Playing(?:\/|$)/i,
    /\/Plugins\/[0-9a-f-]+\/Configuration$/i,
];

function pluginPathname(url) {
    const pathname = new URL(url).pathname;
    const marker = '/jellyfinenhanced/';
    const markerIndex = pathname.toLowerCase().indexOf(marker);
    return markerIndex === -1 ? null : pathname.slice(markerIndex).toLowerCase();
}

function isCommonAllowedHttpError(item) {
    const pathname = pluginPathname(item.url);
    if (item.method !== 'GET') return false;
    return (item.status === 403 && pathname === '/jellyfinenhanced/jellyseerr/issue')
        || (item.status === 404 && pathname === '/jellyfinenhanced/brandingimage')
        || (item.status === 404
            && /^\/jellyfinenhanced\/jellyseerr\/(?:tv\/\d+\/ratings|movie\/\d+\/ratingscombined)$/.test(pathname));
}

function mutationReport(mutations, options) {
    const isAdminSync = item => {
        if (item.method !== 'POST' || !SETTINGS_WRITE_PATH.test(pluginPathname(item.url))) return false;
        try {
            return typeof JSON.parse(item.body).IsAdmin === 'boolean';
        } catch {
            return false;
        }
    };
    const startup = mutations.find(item => item.startup && isAdminSync(item));
    const expected = startup ? [startup] : [];
    const unexpected = mutations.filter(item => item !== startup);
    const allowedMutation = options.allowedMutation || (() => false);
    const allowedMutationCount = options.allowedMutationCount || 0;
    const allowed = [];
    const remaining = [];
    for (const item of unexpected) {
        if (allowed.length < allowedMutationCount && allowedMutation(item, startup)) {
            allowed.push(item);
        } else {
            remaining.push(item);
        }
    }
    const summarize = item => ({
        bodySha256: crypto.createHash('sha256').update(item.body).digest('hex'),
        method: item.method,
        pageUrl: item.pageUrl,
        startup: item.startup,
        url: item.url,
    });
    return {
        expected: [...expected, ...allowed].map(summarize),
        unexpected: remaining.map(summarize),
    };
}

async function loginWithoutPassword(page, username, password = '') {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });

    const userCard = page.locator(`#divUsers .cardContent[data-username="${username}"]`).first();
    await expect(userCard, `passwordless user card for ${username}`).toBeVisible();
    await userCard.click();

    // Passwordless users normally authenticate as soon as their card is
    // selected. Keep the form path for portable use with another fixture.
    await page.waitForTimeout(250);
    if (page.url().includes('/login')) {
        const nameInput = page.locator('#txtManualName');
        if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(username);
        const passwordInput = page.locator('#txtManualPassword');
        if (await passwordInput.isVisible().catch(() => false)) await passwordInput.fill(password);
        const submit = page.locator('.button-submit').first();
        if (await submit.isVisible().catch(() => false)) await submit.click();
    }

    await page.waitForFunction(() => {
        return !!window.ApiClient?.accessToken?.() && !!window.ApiClient?.getCurrentUserId?.();
    }, undefined, { timeout: 30_000 });
    await waitForPlugin(page);

    const actualName = await page.evaluate(async () => (await window.ApiClient.getCurrentUser()).Name);
    expect(actualName).toBe(username);
}

async function waitForPlugin(page) {
    await page.waitForFunction(() => window.JellyfinEnhanced?.initialized === true, undefined, {
        timeout: 30_000,
    });
    if (page.__jellyfinEnhancedE2eGuard) {
        page.__jellyfinEnhancedE2eGuard.startupOpen = false;
    }
}

function collectDiagnostics(page) {
    const diagnostics = {
        criticalConsole: [],
        pageErrors: [],
        pluginHttpErrors: [],
        pluginRequestFailures: [],
    };

    page.on('pageerror', error => {
        const item = {
            message: error.message || String(error),
            stack: error.stack || '',
        };
        diagnostics.pageErrors.push(item);
    });
    page.on('requestfailed', request => {
        if (pluginPathname(request.url())) {
            diagnostics.pluginRequestFailures.push({
                method: request.method(),
                url: request.url(),
                error: request.failure()?.errorText || 'unknown',
            });
        }
    });
    page.on('response', response => {
        if (pluginPathname(response.url()) && response.status() >= 400) {
            diagnostics.pluginHttpErrors.push({
                method: response.request().method(),
                status: response.status(),
                url: response.url(),
            });
        }
    });
    page.on('console', message => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (/(?:Jellyfin Enhanced|\[JE\]).*(?:FATAL|CRITICAL(?: INITIALIZATION)? FAILURE|component failures|Failed to load (?:script|config-page)|not defined after script loading)/i.test(text)) {
            diagnostics.criticalConsole.push(text);
        }
    });

    return diagnostics;
}

async function installReadOnlyGuard(page) {
    const guard = { mutations: [], startupOpen: true };
    page.__jellyfinEnhancedE2eGuard = guard;
    await page.route('**/*', async route => {
        const request = route.request();
        const method = request.method().toUpperCase();
        const pathname = new URL(request.url()).pathname;
        const pluginPath = pluginPathname(request.url());
        const readOnlyPluginQuery = method === 'POST'
            && pluginPath === '/jellyfinenhanced/arr/calendar/user-data';
        const pluginMutation = pluginPath && !SAFE_METHODS.has(method) && !readOnlyPluginQuery;
        const coreMutation = !SAFE_METHODS.has(method)
            && DANGEROUS_CORE_PATHS.some(pattern => pattern.test(pathname));

        if (pluginMutation || coreMutation) {
            guard.mutations.push({
                body: request.postData() || '',
                method,
                pageUrl: page.url(),
                startup: guard.startupOpen,
                url: request.url(),
            });
            if (pluginMutation) {
                await route.fulfill({
                    body: '{}',
                    contentType: 'application/json',
                    status: 200,
                });
            } else {
                await route.abort('blockedbyclient');
            }
            return;
        }
        await route.fallback();
    });
    return guard;
}

async function assertHealthy(diagnostics, guard, testInfo, options = {}) {
    const allowedHttpError = options.allowedHttpError || (() => false);
    const allowedPageError = options.allowedPageError || (() => false);
    const allowedRequestFailure = options.allowedRequestFailure || (() => false);
    const mutations = mutationReport(guard.mutations, options);
    const allowedPageErrors = diagnostics.pageErrors.filter(allowedPageError);
    const report = {
        ...diagnostics,
        allowedPageErrors,
        expectedBlockedMutations: mutations.expected,
        pageErrors: diagnostics.pageErrors.filter(item => !allowedPageError(item)),
        pluginHttpErrors: diagnostics.pluginHttpErrors.filter(item => {
            return !isCommonAllowedHttpError(item) && !allowedHttpError(item);
        }),
        pluginRequestFailures: diagnostics.pluginRequestFailures.filter(item => !allowedRequestFailure(item)),
        readOnlyViolations: mutations.unexpected,
    };
    await testInfo.attach('jellyfin-enhanced-diagnostics', {
        body: Buffer.from(JSON.stringify(report, null, 2)),
        contentType: 'application/json',
    });

    expect(report.pageErrors, 'uncaught browser exceptions').toEqual([]);
    if (Number.isInteger(options.expectedAllowedPageErrors)) {
        expect(report.allowedPageErrors, 'known Jellyfin core page exceptions').toHaveLength(
            options.expectedAllowedPageErrors,
        );
    }
    expect(report.pluginRequestFailures, 'failed plugin network requests').toEqual([]);
    expect(report.pluginHttpErrors, 'unexpected plugin HTTP errors').toEqual([]);
    expect(report.criticalConsole, 'critical plugin console errors').toEqual([]);
    expect(report.readOnlyViolations, 'blocked state-changing requests').toEqual([]);
}

function componentScriptsFromPlugin() {
    const pluginPath = path.join(
        REPO_ROOT,
        'Jellyfin.Plugin.JellyfinEnhanced',
        'js',
        'plugin.js',
    );
    const source = fs.readFileSync(pluginPath, 'utf8');
    const match = source.match(/const\s+allComponentScripts\s*=\s*\[([\s\S]*?)\];/);
    if (!match) throw new Error('allComponentScripts was not found in js/plugin.js');
    return [...match[1].matchAll(/['"]([^'"]+\.js)['"]/g)].map(item => item[1]);
}

async function currentUser(page) {
    return page.evaluate(async () => {
        const user = await window.ApiClient.getCurrentUser();
        return {
            id: user.Id,
            isAdministrator: !!user.Policy?.IsAdministrator,
            name: user.Name,
        };
    });
}

async function findMediaItem(page, type) {
    return page.evaluate(async requestedType => {
        const preferredNames = {
            Movie: 'Iron Man',
            Series: 'Bluey',
        };
        const userId = window.ApiClient.getCurrentUserId();
        const result = await window.ApiClient.getItems(userId, {
            Fields: 'ProviderIds,UserData',
            IncludeItemTypes: requestedType,
            Limit: 200,
            Recursive: true,
            SortBy: 'SortName',
        });
        const items = result.Items || [];
        const preferred = items.find(item => item.Name === preferredNames[requestedType])
            || items.find(item => item.ProviderIds?.Tmdb && item.ImageTags?.Primary)
            || items.find(item => item.ProviderIds?.Tmdb)
            || items[0];
        if (!preferred) throw new Error(`No ${requestedType} item is available to the E2E user`);
        return { id: preferred.Id, name: preferred.Name, type: preferred.Type };
    }, type);
}

async function navigateToDetails(page, item) {
    await page.evaluate(id => {
        window.location.hash = `#/details?id=${encodeURIComponent(id)}`;
    }, item.id);
    const pageRoot = page.locator('#itemDetailPage:not(.hide)').last();
    await expect(pageRoot).toBeVisible();
    await expect(pageRoot.locator('.itemName')).toContainText(item.name);
    return pageRoot;
}

async function navigationCounts(page) {
    return page.evaluate(() => ({
        bodySubscribers: window.JellyfinEnhanced.core.dom.getBodySubscriberCount(),
        navigationCallbacks: window.JellyfinEnhanced.core.navigation.getNavCallbackCount(),
        observers: window.JellyfinEnhanced.core.dom.getObserverCount(),
        viewHandlers: window.JellyfinEnhanced.core.navigation.getViewHandlerCount(),
    }));
}

module.exports = {
    assertHealthy,
    collectDiagnostics,
    componentScriptsFromPlugin,
    currentUser,
    findMediaItem,
    installReadOnlyGuard,
    loginWithoutPassword,
    navigateToDetails,
    navigationCounts,
    waitForPlugin,
};
