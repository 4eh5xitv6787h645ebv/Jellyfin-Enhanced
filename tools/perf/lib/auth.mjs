// Logs into jellyfin-dev once through the real login form and caches the
// Playwright storageState. JE's own localStorage keys are stripped from the
// cached state so "cold" scenarios start with auth but no JE caches.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, '..', '.state', 'auth.json');

const KEEP_KEY_PATTERNS = [/^jellyfin_credentials$/, /^_deviceId2$/, /^enableAutoLogin$/, /servercredentials/i];

function filterState(state) {
    for (const origin of state.origins ?? []) {
        origin.localStorage = (origin.localStorage ?? []).filter(({ name }) =>
            KEEP_KEY_PATTERNS.some(re => re.test(name)));
    }
    return state;
}

async function uiLogin(browser, bench) {
    const context = await browser.newContext({ viewport: bench.viewport });
    const page = await context.newPage();
    await page.goto(bench.baseUrl + '/web/', { waitUntil: 'domcontentloaded' });

    // Either a "select user" page with user buttons, or the manual form.
    const manualName = page.locator('#txtManualName');
    const userCard = page.locator(`.cardContent[title="${bench.username}"], button:has-text("${bench.username}")`).first();
    try {
        await userCard.waitFor({ timeout: 6000 });
        await userCard.click();
    } catch {
        // fall through to manual form
    }
    try {
        await manualName.waitFor({ timeout: 6000 });
        await manualName.fill(bench.username);
        await page.locator('#txtManualPassword').fill(bench.password ?? '');
        await page.locator('button[type="submit"]').first().click();
    } catch {
        // No manual form appeared — user-card click may have logged us in directly.
    }

    await page.waitForSelector('.homePage:not(.hide), #homePage, .section0', { timeout: 20000 });
    const state = filterState(await context.storageState());
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    await context.close();
    return state;
}

async function stateIsValid(browser, bench, state) {
    const context = await browser.newContext({ viewport: bench.viewport, storageState: state });
    const page = await context.newPage();
    try {
        await page.goto(bench.baseUrl + '/web/#/home.html', { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.homePage:not(.hide), #homePage, .section0', { timeout: 12000 });
        return true;
    } catch {
        return false;
    } finally {
        await context.close();
    }
}

export async function ensureAuthState(browser, bench) {
    if (fs.existsSync(STATE_FILE)) {
        const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        if (await stateIsValid(browser, bench, state)) return state;
    }
    return uiLogin(browser, bench);
}
