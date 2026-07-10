'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { expect, test } = require('@playwright/test');
const { ADMIN_AUTH_STATE, REPO_ROOT, WEB_URL } = require('./support/env');
const {
    assertHealthy,
    collectDiagnostics,
    componentScriptsFromPlugin,
    currentUser,
    installReadOnlyGuard,
    waitForPlugin,
} = require('./support/jellyfin');

test.use({ storageState: ADMIN_AUTH_STATE });

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function runtimeState(page, expectedScripts) {
    return page.evaluate(expected => {
        const sources = [...document.scripts]
            .map(script => script.src)
            .filter(Boolean)
            .map(source => new URL(source).pathname);
        const prefix = '/JellyfinEnhanced/js/';
        const expectedSet = new Set(expected);
        return {
            bundleFailures: window.JellyfinEnhanced.__bundleFailures || [],
            bundleTags: sources.filter(source => source === '/JellyfinEnhanced/dist/je.bundle.js').length,
            componentOrder: sources
                .filter(source => source.startsWith(prefix))
                .map(source => source.slice(prefix.length))
                .filter(source => expectedSet.has(source)),
            coreKeys: Object.keys(window.JellyfinEnhanced.core).sort(),
            dev: document.querySelector('script[plugin="Jellyfin Enhanced"]')?.getAttribute('dev'),
            initialized: window.JellyfinEnhanced.initialized,
            version: window.JellyfinEnhanced.pluginVersion,
        };
    }, expectedScripts);
}

test('production bundle initializes and matches the installed checkout', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    const expectedScripts = componentScriptsFromPlugin();
    const bundleResponses = [];
    page.on('response', response => {
        if (new URL(response.url()).pathname === '/JellyfinEnhanced/dist/je.bundle.js') {
            bundleResponses.push(response.status());
        }
    });

    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const user = await currentUser(page);
    const state = await runtimeState(page, expectedScripts);
    expect(user.isAdministrator).toBe(true);
    expect(state.initialized).toBe(true);
    expect(state.version).not.toBe('unknown');
    expect(state.dev).toBe('false');
    expect(state.bundleFailures).toEqual([]);
    expect(state.bundleTags).toBe(1);
    expect(state.componentOrder).toEqual([]);
    expect(state.coreKeys).toEqual(['api', 'dom', 'lifecycle', 'navigation', 'tagRenderer', 'ui']);
    expect(bundleResponses).toEqual([200]);

    const localBundle = fs.readFileSync(path.join(
        REPO_ROOT,
        'Jellyfin.Plugin.JellyfinEnhanced',
        'dist',
        'je.bundle.js',
    ));
    const bundleUrl = await page.evaluate(() => {
        return window.ApiClient.getUrl('/JellyfinEnhanced/dist/je.bundle.js');
    });
    const servedBundle = await page.request.get(bundleUrl);
    expect(servedBundle.status()).toBe(200);
    expect(servedBundle.headers()['cache-control']).toContain('immutable');
    expect(sha256(await servedBundle.body())).toBe(sha256(localBundle));

    await assertHealthy(diagnostics, violations, testInfo);
});

test('Dev Mode loads every component once and in manifest order', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    const expectedScripts = componentScriptsFromPlugin();
    const requestedComponents = [];
    let bundleRequests = 0;

    await page.route('**/JellyfinEnhanced/script?*', async route => {
        const response = await route.fetch();
        const body = await response.text();
        await route.fulfill({
            response,
            body: `document.currentScript.setAttribute('dev', 'true');\n${body}`,
        });
    });
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/JellyfinEnhanced/dist/je.bundle.js') bundleRequests++;
        const prefix = '/JellyfinEnhanced/js/';
        if (pathname.startsWith(prefix)) {
            const relative = pathname.slice(prefix.length);
            if (expectedScripts.includes(relative)) requestedComponents.push(relative);
        }
    });

    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const state = await runtimeState(page, expectedScripts);
    expect(state.dev).toBe('true');
    expect(state.bundleTags).toBe(0);
    expect(state.bundleFailures).toEqual([]);
    expect(bundleRequests).toBe(0);
    expect(requestedComponents).toEqual(expectedScripts);
    expect(state.componentOrder).toEqual(expectedScripts);

    await assertHealthy(diagnostics, violations, testInfo);
});

test('missing production bundle falls back to the full ordered component list', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const violations = await installReadOnlyGuard(page);
    const expectedScripts = componentScriptsFromPlugin();
    const requestedComponents = [];
    let bundleRequests = 0;

    await page.route('**/JellyfinEnhanced/dist/je.bundle.js?*', async route => {
        bundleRequests++;
        await route.fulfill({ status: 404, contentType: 'text/plain', body: 'E2E missing bundle' });
    });
    page.on('request', request => {
        const pathname = new URL(request.url()).pathname;
        const prefix = '/JellyfinEnhanced/js/';
        if (pathname.startsWith(prefix)) {
            const relative = pathname.slice(prefix.length);
            if (expectedScripts.includes(relative)) requestedComponents.push(relative);
        }
    });

    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
    await waitForPlugin(page);

    const state = await runtimeState(page, expectedScripts);
    expect(state.initialized).toBe(true);
    expect(bundleRequests).toBe(1);
    expect(requestedComponents).toEqual(expectedScripts);
    expect(state.componentOrder).toEqual(expectedScripts);

    await assertHealthy(diagnostics, violations, testInfo, {
        allowedHttpError: item => new URL(item.url).pathname.endsWith('/JellyfinEnhanced/dist/je.bundle.js')
            && item.status === 404,
        allowedRequestFailure: item => item.method === 'GET'
            && new URL(item.url).pathname.endsWith('/JellyfinEnhanced/dist/je.bundle.js')
            && item.error === 'net::ERR_ABORTED',
    });
});
