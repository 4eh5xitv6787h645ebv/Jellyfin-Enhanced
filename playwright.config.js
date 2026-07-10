'use strict';

const { defineConfig, devices } = require('@playwright/test');
const {
    ADMIN_AUTH_STATE,
    BASE_URL,
    resolveChromiumExecutable,
} = require('./tests/e2e/support/env');

const executablePath = resolveChromiumExecutable();
const traceMode = process.env.JE_E2E_TRACE === '1' ? 'retain-on-failure' : 'off';
const retainMedia = process.env.JE_E2E_ARTIFACTS === '1';

module.exports = defineConfig({
    testDir: './tests/e2e',
    testIgnore: '**/support/**',
    outputDir: 'test-results/playwright',
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    forbidOnly: !!process.env.CI,
    timeout: 60_000,
    expect: {
        timeout: 15_000,
    },
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],
    use: {
        baseURL: BASE_URL,
        locale: 'en-US',
        serviceWorkers: 'block',
        timezoneId: 'Australia/Perth',
        trace: traceMode,
        screenshot: retainMedia ? 'only-on-failure' : 'off',
        video: retainMedia ? 'retain-on-failure' : 'off',
        launchOptions: executablePath ? { executablePath } : {},
    },
    projects: [
        {
            name: 'setup',
            testMatch: '**/*.setup.js',
            use: {
                trace: 'off',
                screenshot: 'off',
                video: 'off',
            },
        },
        {
            name: 'chromium',
            testIgnore: '**/*.setup.js',
            dependencies: ['setup'],
            use: {
                ...devices['Desktop Chrome'],
                storageState: ADMIN_AUTH_STATE,
                launchOptions: executablePath ? { executablePath } : {},
            },
        },
    ],
});
