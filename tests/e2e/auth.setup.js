'use strict';

const fs = require('node:fs');
const { test: setup } = require('@playwright/test');
const {
    ADMIN_AUTH_STATE,
    ADMIN_PASSWORD,
    ADMIN_USER,
    AUTH_DIR,
    USER_AUTH_STATE,
    USER_PASSWORD,
    USER_USER,
} = require('./support/env');
const {
    assertHealthy,
    collectDiagnostics,
    installReadOnlyGuard,
    loginWithoutPassword,
} = require('./support/jellyfin');

setup.describe.configure({ mode: 'serial' });

setup.beforeAll(() => {
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 });
    fs.chmodSync(AUTH_DIR, 0o700);
});

setup('authenticate passwordless administrator', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const guard = await installReadOnlyGuard(page);
    await loginWithoutPassword(page, ADMIN_USER, ADMIN_PASSWORD);
    await page.context().storageState({ path: ADMIN_AUTH_STATE, indexedDB: true });
    fs.chmodSync(ADMIN_AUTH_STATE, 0o600);
    await assertHealthy(diagnostics, guard, testInfo);
});

setup('authenticate passwordless standard user', async ({ page }, testInfo) => {
    const diagnostics = collectDiagnostics(page);
    const guard = await installReadOnlyGuard(page);
    await loginWithoutPassword(page, USER_USER, USER_PASSWORD);
    await page.context().storageState({ path: USER_AUTH_STATE, indexedDB: true });
    fs.chmodSync(USER_AUTH_STATE, 0o600);
    await assertHealthy(diagnostics, guard, testInfo);
});
