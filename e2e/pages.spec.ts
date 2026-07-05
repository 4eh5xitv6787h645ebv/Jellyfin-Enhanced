// Unified Pages framework E2E: the JE.pages facade, the layout-aware nav entry
// (header tray on the modern desktop layout, sidebar link on legacy/mobile),
// the standalone page shell show/hide, and per-user reordering. Runs from both
// the admin and non-admin perspectives and asserts zero real console errors.
import { test, expect, loginAs, showRoute, waitForHash } from './fixtures/auth';
import type { Page } from 'playwright/test';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The enabled page ids in resolved order (via the public facade). */
async function pageList(page: Page): Promise<string[]> {
    return page.evaluate(() => (window as any).JellyfinEnhanced?.pages?.list?.() ?? []);
}

/** A nav entry (header button OR sidebar link) exists for the page id. */
async function navEntryPresent(page: Page, id: string): Promise<boolean> {
    return page.evaluate((pageId) => {
        const sel = `.je-page-nav-btn[data-je-page-id="${pageId}"], .je-page-nav-item[data-je-page-id="${pageId}"]`;
        const el = document.querySelector(sel);
        return !!el && (el as HTMLElement).isConnected && !el.closest('.hide');
    }, id);
}

test.describe('pages', () => {
    test('facade, nav entry and page shell work (admin)', async ({ page, consoleErrors }) => {
        await loginAs(page, 'admin', consoleErrors);

        // The facade must exist and expose the enabled pages.
        const facadeOk = await page.evaluate(() => typeof (window as any).JellyfinEnhanced?.pages?.show === 'function');
        expect(facadeOk).toBe(true);

        const ids = await pageList(page);
        test.skip(ids.length === 0, 'no navigation pages enabled on this instance');
        const first = ids[0];

        // The nav entry for the first page renders (retry — the tray/sidebar may
        // paint after JE boots).
        await expect
            .poll(() => navEntryPresent(page, first), { timeout: 30_000 })
            .toBe(true);

        // Showing the page mounts the standalone container and reveals it.
        await page.evaluate((id) => (window as any).JellyfinEnhanced.pages.show(id), first);
        await page.waitForFunction((id) => {
            const el = document.getElementById(`je-page-${id}`);
            return !!el && !el.classList.contains('hide');
        }, first, { timeout: 30_000 });

        // Its body was mounted (content-primary built by the feature's mount).
        const mounted = await page.evaluate((id) => {
            const el = document.getElementById(`je-page-${id}`);
            return !!el?.querySelector('[data-role="content"] .content-primary, [data-role="content"] .sections');
        }, first);
        expect(mounted).toBe(true);

        // Navigating away hides our page (route-driven, no polling).
        await showRoute(page, '/home');
        await waitForHash(page, '/home');
        await page.waitForFunction((id) => {
            const el = document.getElementById(`je-page-${id}`);
            return !el || el.classList.contains('hide');
        }, first, { timeout: 30_000 });

        expect(consoleErrors.real()).toEqual([]);
    });

    test('page re-activates on a second visit (admin)', async ({ page, consoleErrors }) => {
        await loginAs(page, 'admin', consoleErrors);

        // The Requests page exposes _state.pageVisible, which onShow/onHide flip —
        // the clearest probe that the page truly re-activates (not just re-appears)
        // on revisit. Skip if it isn't enabled on this instance.
        const hasRequests = await page.evaluate(
            () => ((window as any).JellyfinEnhanced?.pages?.list?.() ?? []).includes('requests')
        );
        test.skip(!hasRequests, 'Requests page not enabled on this instance');

        const showRequests = () => page.evaluate(() => (window as any).JellyfinEnhanced.pages.show('requests'));
        const stateVisible = () =>
            page.evaluate(() => (window as any).JellyfinEnhanced.downloadsPage?._state?.pageVisible === true);

        // First visit: activates.
        await showRequests();
        await page.waitForFunction(() => (window as any).JellyfinEnhanced.downloadsPage?._state?.pageVisible === true, undefined, { timeout: 30_000 });

        // Leave: deactivates.
        await showRoute(page, '/home');
        await waitForHash(page, '/home');
        await page.waitForFunction(() => (window as any).JellyfinEnhanced.downloadsPage?._state?.pageVisible === false, undefined, { timeout: 30_000 });

        // Return: must re-activate (regression guard — mount is one-shot, onShow is per-show).
        await showRequests();
        await page.waitForFunction(() => (window as any).JellyfinEnhanced.downloadsPage?._state?.pageVisible === true, undefined, { timeout: 30_000 });
        expect(await stateVisible()).toBe(true);

        expect(consoleErrors.real()).toEqual([]);
    });

    test('per-user reorder updates the nav order (admin)', async ({ page, consoleErrors }) => {
        await loginAs(page, 'admin', consoleErrors);

        const ids = await pageList(page);
        test.skip(ids.length < 2, 'need at least two enabled pages to test ordering');

        const reversed = [...ids].reverse();
        const after = await page.evaluate((order) => {
            const JE = (window as any).JellyfinEnhanced;
            JE.currentSettings = JE.currentSettings || {};
            JE.currentSettings.pagesOrder = order;
            JE.pages.refresh();
            return JE.pages.list();
        }, reversed);
        expect(after).toEqual(reversed);

        // Reset the override back to the default for a clean state.
        await page.evaluate(() => {
            const JE = (window as any).JellyfinEnhanced;
            JE.currentSettings.pagesOrder = [];
            JE.pages.refresh();
        });

        expect(consoleErrors.real()).toEqual([]);
    });

    test('facade and nav entry work (non-admin user)', async ({ page, consoleErrors }) => {
        await loginAs(page, 'user', consoleErrors);

        const facadeOk = await page.evaluate(() => typeof (window as any).JellyfinEnhanced?.pages?.show === 'function');
        expect(facadeOk).toBe(true);

        const ids = await pageList(page);
        test.skip(ids.length === 0, 'no navigation pages enabled for this user');
        const first = ids[0];

        await expect
            .poll(() => navEntryPresent(page, first), { timeout: 30_000 })
            .toBe(true);

        await page.evaluate((id) => (window as any).JellyfinEnhanced.pages.show(id), first);
        await page.waitForFunction((id) => {
            const el = document.getElementById(`je-page-${id}`);
            return !!el && !el.classList.contains('hide');
        }, first, { timeout: 30_000 });

        expect(consoleErrors.real()).toEqual([]);
    });
});
