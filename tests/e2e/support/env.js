'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function normalizeBaseUrl(value) {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`JE_E2E_BASE_URL must use http or https, got ${url.protocol}`);
    }
    if (!url.pathname.endsWith('/')) url.pathname += '/';
    url.search = '';
    url.hash = '';
    return url.toString();
}

function resolveChromiumExecutable() {
    const configured = process.env.JE_E2E_CHROMIUM_PATH;
    if (configured) {
        if (!fs.existsSync(configured)) {
            throw new Error(`JE_E2E_CHROMIUM_PATH does not exist: ${configured}`);
        }
        return configured;
    }

    // CI should install Playwright's pinned browser. Local Linux runs may use
    // the system browser to avoid a second multi-hundred-megabyte download.
    if (process.env.CI) return undefined;
    return ['/usr/bin/chromium', '/usr/bin/chromium-browser']
        .find(candidate => fs.existsSync(candidate));
}

const BASE_URL = normalizeBaseUrl(process.env.JE_E2E_BASE_URL || 'http://127.0.0.1:8097/');
const WEB_URL = new URL('web/index.html', BASE_URL).toString();
const AUTH_DIR = path.join(REPO_ROOT, 'playwright', '.auth');
const ADMIN_AUTH_STATE = path.join(AUTH_DIR, 'admin.json');
const USER_AUTH_STATE = path.join(AUTH_DIR, 'user.json');

module.exports = {
    ADMIN_AUTH_STATE,
    ADMIN_PASSWORD: process.env.JE_E2E_ADMIN_PASSWORD || '',
    ADMIN_USER: process.env.JE_E2E_ADMIN_USER || 'TestAdmin',
    AUTH_DIR,
    BASE_URL,
    REPO_ROOT,
    USER_AUTH_STATE,
    USER_PASSWORD: process.env.JE_E2E_USER_PASSWORD || '',
    USER_USER: process.env.JE_E2E_USER || 'Test',
    WEB_URL,
    normalizeBaseUrl,
    resolveChromiumExecutable,
};
