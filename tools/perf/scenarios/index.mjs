// Benchmark scenarios. Each defines how to drive the page and which epoch's
// metrics matter. Detail scenarios use a FIXED observation window after the
// navigation so "how late did JE land" is comparable across runs and labels.
//
// Route formats differ subtly across jellyfin-web versions, so candidate
// routes are probed once and the working one is cached in .state/routes.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTES_CACHE = path.join(HERE, '..', '.state', 'routes.json');

const DETAIL_WINDOW_MS = 8000;
const HOME_WINDOW_MS = 5000;

// ---------- route discovery ----------

const ROUTE_CANDIDATES = {
    home: ['#/home.html', '#/home'],
    detail: ['#/details?id={id}&serverId={sid}', '#/item?id={id}&serverId={sid}'],
    library: ['#/movies.html?topParentId={lib}&parentId={lib}', '#/list.html?parentId={lib}', '#/movies?topParentId={lib}'],
    search: ['#/search.html', '#/search']
};

const ROUTE_READY_SELECTOR = {
    home: '.homePage:not(.hide) .section0, .homePage:not(.hide) .verticalSection',
    detail: '.detailPagePrimaryContainer, .itemDetailPage:not(.hide), #itemDetailPage',
    library: '.libraryPage:not(.hide) .card, #moviesPage .card',
    search: '.searchFields input, #searchPage input[type="search"], .searchfields-txtSearch'
};

function fillRoute(tpl, items) {
    return tpl
        .replace('{id}', items.movieId)
        .replace('{sid}', items.serverId)
        .replace('{lib}', items.movieLibraryId);
}

export async function discoverRoutes(page, bench, items) {
    if (fs.existsSync(ROUTES_CACHE)) return JSON.parse(fs.readFileSync(ROUTES_CACHE, 'utf8'));
    const routes = {};
    for (const [kind, candidates] of Object.entries(ROUTE_CANDIDATES)) {
        for (const tpl of candidates) {
            const hash = fillRoute(tpl, items);
            try {
                await page.goto(`${bench.baseUrl}/web/index.html${hash}`, { waitUntil: 'domcontentloaded' });
                await page.waitForSelector(ROUTE_READY_SELECTOR[kind], { timeout: 9000 });
                routes[kind] = tpl;
                break;
            } catch { /* try next candidate */ }
        }
        if (!routes[kind]) throw new Error(`No working route found for '${kind}' (tried: ${candidates.join(', ')})`);
    }
    fs.mkdirSync(path.dirname(ROUTES_CACHE), { recursive: true });
    fs.writeFileSync(ROUTES_CACHE, JSON.stringify(routes, null, 2));
    return routes;
}

// ---------- shared helpers ----------

function detailHash(ctx, itemId) {
    return ctx.routes.detail.replace('{id}', itemId).replace('{sid}', ctx.items.serverId);
}

async function gotoFull(page, ctx, hashTpl) {
    await page.goto(`${ctx.bench.baseUrl}/web/index.html${hashTpl}`, { waitUntil: 'domcontentloaded' });
}

async function hashNav(page, hash) {
    await page.evaluate(h => { location.hash = h; }, hash);
}

async function waitForJeReady(page, timeoutMs = 25000) {
    // currentSettings is assigned in JE's stage-4 loadSettings(): the moment
    // features can start initializing.
    await page.waitForFunction(() => {
        const je = window.JellyfinEnhanced;
        return !!(je && je.currentSettings && Object.keys(je.currentSettings).length);
    }, null, { timeout: timeoutMs, polling: 50 });
    return page.evaluate(() => performance.now());
}

async function loadHomeBooted(page, ctx) {
    await gotoFull(page, ctx, ctx.routes.home);
    await page.waitForSelector(ROUTE_READY_SELECTOR.home, { timeout: 20000 });
    if (!ctx.noJe) {
        try { await waitForJeReady(page); } catch { /* JE never became ready; metrics will show it */ }
    } else {
        await page.waitForTimeout(1500);
    }
}

function lastEpoch(snap) {
    return snap.epochs[snap.epochs.length - 1];
}

// Picks the measured epoch + flattens into metrics. parityFor lists markers
// whose parity (vs native buttons) should be reported for this scenario.
function extractEpoch(e, { parityFor = [], requestField = null } = {}) {
    const out = {
        longTaskCount: e.longTaskCount,
        longestTaskMs: e.longestTaskMs,
        tbtMs: e.tbtMs,
        cls: e.cls,
        interactionP98Ms: e.interactionP98Ms,
        nativeButtonsAtMs: e.nativeButtonsAtMs
    };
    if (requestField) out[requestField] = e.jeRequestCount;
    for (const sel of parityFor) {
        const key = 'parity:' + sel;
        out[key] = e.parityMs && sel in e.parityMs ? e.parityMs[sel] : null;
        out['at:' + sel] = e.markersAtMs && sel in e.markersAtMs ? e.markersAtMs[sel] : null;
    }
    if (e.fps) {
        out.fps = e.fps.fps;
        out.droppedPct = e.fps.droppedPct;
        out.worstFrameMs = e.fps.worstFrameMs;
    }
    // Non-numeric diagnostics (ignored by aggregation; last run's copy is kept)
    out._diag = {
        clsSources: e.clsSources || [],
        jeMeasures: e.jeMeasures || [],
        longTasks: e.longTasks || []
    };
    return out;
}

const DETAIL_PARITY = [
    '.jellyseerr-report-issue-icon',
    '.tmdb-reviews-section',
    '.jellyseerr-details-section',
    '.streaming-lookup-container',
    '.arr-link',
    '.letterboxd-link'
];

async function detailScenario(page, ctx, { itemKey, warm, warmupKey = null }) {
    const itemId = ctx.items[itemKey];
    await loadHomeBooted(page, ctx);
    if (warm) {
        // Warm JE/HTTP caches on another (or the same) detail page first.
        await hashNav(page, detailHash(ctx, ctx.items[warmupKey ?? itemKey]));
        await page.waitForTimeout(DETAIL_WINDOW_MS * 0.75);
        await hashNav(page, ctx.routes.home);
        await page.waitForTimeout(2000);
    }
    await page.evaluate(() => window.__JEPROBE.newEpoch('detail'));
    await hashNav(page, detailHash(ctx, itemId));
    await page.waitForTimeout(DETAIL_WINDOW_MS);
}

// ---------- scenarios ----------

export const scenarios = [
    {
        name: '00-boot',
        async run(page, ctx) {
            await gotoFull(page, ctx, ctx.routes.home);
            await page.waitForSelector(ROUTE_READY_SELECTOR.home, { timeout: 20000 });
            let jeReadyMs = null;
            if (!ctx.noJe) {
                try { jeReadyMs = await waitForJeReady(page); } catch { /* stays null */ }
            }
            await page.waitForTimeout(2000);
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            const boot = snap.epochs[0];
            return {
                ...extractEpoch(boot, { requestField: 'jeBootRequests' }),
                jeReadyMs,
                jeLastResourceEndMs: boot.jeLastResourceEndMs
            };
        }
    },
    {
        name: '10-home',
        async run(page, ctx) {
            await loadHomeBooted(page, ctx);
            await page.waitForTimeout(HOME_WINDOW_MS);
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(snap.epochs[0]);
        }
    },
    {
        name: '20-library-scroll',
        async run(page, ctx) {
            await loadHomeBooted(page, ctx);
            const hash = ctx.routes.library
                .replace(/\{lib\}/g, ctx.items.movieLibraryId);
            await page.evaluate(() => window.__JEPROBE.newEpoch('library'));
            await hashNav(page, hash);
            await page.waitForSelector(ROUTE_READY_SELECTOR.library, { timeout: 15000 });
            await page.waitForTimeout(2500); // let initial tag/card work land
            await page.evaluate(() => window.__JEPROBE.startFps());
            for (let i = 0; i < 14; i++) {
                await page.mouse.wheel(0, 800);
                await page.waitForTimeout(130);
            }
            await page.evaluate(() => window.__JEPROBE.stopFps());
            await page.waitForTimeout(500);
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap));
        }
    },
    {
        name: '30-movie-detail-cold',
        async run(page, ctx) {
            await detailScenario(page, ctx, { itemKey: 'movieId', warm: false });
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: DETAIL_PARITY, requestField: 'jeDetailRequests' });
        }
    },
    {
        name: '31-movie-detail-warm',
        async run(page, ctx) {
            await detailScenario(page, ctx, { itemKey: 'movieId', warm: true });
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: DETAIL_PARITY, requestField: 'jeDetailRequests' });
        }
    },
    {
        // The most common real navigation: JE/HTTP caches are warm but the
        // target page's DOM is fresh (a different item than the one visited).
        name: '32-movie-detail-fresh-dom-warm-caches',
        async run(page, ctx) {
            await detailScenario(page, ctx, { itemKey: 'movie2Id', warm: true, warmupKey: 'movieId' });
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: DETAIL_PARITY, requestField: 'jeDetailRequests' });
        }
    },
    {
        name: '40-series-detail-cold',
        async run(page, ctx) {
            await detailScenario(page, ctx, { itemKey: 'seriesId', warm: false });
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: DETAIL_PARITY, requestField: 'jeDetailRequests' });
        }
    },
    {
        name: '41-series-detail-warm',
        async run(page, ctx) {
            await detailScenario(page, ctx, { itemKey: 'seriesId', warm: true });
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: DETAIL_PARITY, requestField: 'jeDetailRequests' });
        }
    },
    {
        name: '50-search-type',
        async run(page, ctx) {
            await loadHomeBooted(page, ctx);
            await page.evaluate(() => window.__JEPROBE.newEpoch('search'));
            await hashNav(page, ctx.routes.search);
            const input = page.locator(ROUTE_READY_SELECTOR.search).first();
            await input.waitFor({ timeout: 15000 });
            await input.click();
            await page.keyboard.type(ctx.bench.searchQuery, { delay: 110 });
            await page.waitForTimeout(7000);
            const snap = await page.evaluate(() => window.__JEPROBE.snapshot());
            return extractEpoch(lastEpoch(snap), { parityFor: ['.jellyseerr-section'] });
        }
    }
];
