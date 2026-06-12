// In-page performance probe, injected via context.addInitScript BEFORE any app
// code runs. Collects long tasks, layout shifts, event-timing interactions,
// /JellyfinEnhanced resource fetches, rAF frame deltas, and the native-parity
// timeline (native detail buttons visible vs. JE marker elements inserted).
//
// All entries are stored globally with their performance.now() timestamps;
// epochs are just [t0, tEnd) windows so observer-callback latency can never
// attribute an entry to the wrong epoch.

// JE marker selectors whose first DOM insertion is timestamped per epoch.
export const JE_MARKERS = [
    '.jellyseerr-report-issue-icon',
    '.jellyseerr-report-unavailable-icon',
    '.jellyseerr-details-section',
    '.tmdb-reviews-section',
    '.streaming-lookup-container',
    '.arr-link',
    '.letterboxd-link',
    '.quality-overlay-container',
    '.je-genre-tag',
    '.je-language-tag',
    '.jellyseerr-section'
];

function probeMain(MARKERS) {
    'use strict';
    if (window.__JEPROBE) return;

    const now = () => performance.now();
    const G = {
        longTasks: [],     // {t, dur}
        shifts: [],        // {t, v}
        interactions: [],  // {t, dur}
        jeResources: [],   // {t, end, url}
        epochs: []         // {label, t0, tEnd, markers:{sel:t}, nativeButtonsAt, fps}
    };
    let cur = null;

    function newEpoch(label) {
        const t = now();
        if (cur) cur.tEnd = t;
        cur = { label, t0: t, tEnd: null, markers: {}, nativeButtonsAt: null, pageShownAt: null, fps: null };
        G.epochs.push(cur);
    }
    newEpoch('boot');

    try {
        new PerformanceObserver(l => {
            for (const e of l.getEntries()) G.longTasks.push({ t: e.startTime, dur: e.duration });
        }).observe({ type: 'longtask', buffered: true });
    } catch (e) { /* unsupported */ }

    try {
        new PerformanceObserver(l => {
            for (const e of l.getEntries()) {
                if (!e.hadRecentInput) G.shifts.push({ t: e.startTime, v: e.value });
            }
        }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) { /* unsupported */ }

    try {
        new PerformanceObserver(l => {
            for (const e of l.getEntries()) G.interactions.push({ t: e.startTime, dur: e.duration });
        }).observe({ type: 'event', durationThreshold: 16, buffered: true });
    } catch (e) { /* unsupported */ }

    try {
        new PerformanceObserver(l => {
            for (const e of l.getEntries()) {
                if (e.name.indexOf('/JellyfinEnhanced') !== -1) {
                    G.jeResources.push({ t: e.startTime, end: e.responseEnd, url: e.name.split('?')[0] });
                }
            }
        }).observe({ type: 'resource', buffered: true });
    } catch (e) { /* unsupported */ }

    // ---- Parity meter -------------------------------------------------------
    // Anchors:
    //   pageShownAt      - the moment a detail page becomes visible (fresh nav
    //                      inserts+shows it; warm nav un-hides a restored page)
    //   nativeButtonsAt  - first moment a visible .detailButton exists in the
    //                      visible page (>= pageShownAt; restored pages already
    //                      have them, so it equals pageShownAt)
    //   markers[sel]     - first moment the marker exists in the visible page.
    //                      Markers already present when the page is shown (warm
    //                      restored views) stamp at pageShownAt.
    function markSeen(sel, t) {
        if (cur && !(sel in cur.markers)) cur.markers[sel] = t;
    }

    function isShown(el) {
        return el.classList && !el.classList.contains('hide');
    }

    // Full scan of a page subtree at the moment it becomes visible.
    function pageBecameVisible(pageEl, t) {
        if (!cur) return;
        if (cur.pageShownAt === null && pageEl.querySelector('.mainDetailButtons')) {
            cur.pageShownAt = t;
        }
        if (cur.nativeButtonsAt === null && pageEl.querySelector('.mainDetailButtons .detailButton:not(.hide)')) {
            cur.nativeButtonsAt = t;
        }
        for (let i = 0; i < MARKERS.length; i++) {
            const sel = MARKERS[i];
            if (sel in cur.markers) continue;
            try { if (pageEl.querySelector(sel)) markSeen(sel, t); } catch (e) { /* ignore */ }
        }
    }

    function scanAdded(node, t) {
        if (!node || node.nodeType !== 1) return;
        for (let i = 0; i < MARKERS.length; i++) {
            const sel = MARKERS[i];
            if (!cur || (sel in cur.markers)) continue;
            try {
                if ((node.matches && node.matches(sel)) || (node.querySelector && node.querySelector(sel))) {
                    markSeen(sel, t);
                }
            } catch (e) { /* bad selector for this node */ }
        }
        if (cur && cur.nativeButtonsAt === null) {
            try {
                const hit = (node.matches && node.matches('.mainDetailButtons .detailButton:not(.hide)'))
                    || (node.querySelector && node.querySelector('.mainDetailButtons .detailButton:not(.hide)'));
                if (hit) cur.nativeButtonsAt = t;
            } catch (e) { /* ignore */ }
        }
        // A page inserted already visible (first navigation to a fresh view).
        if (cur && node.classList && (node.classList.contains('mainAnimatedPage') || node.classList.contains('page'))
            && isShown(node)) {
            pageBecameVisible(node, t);
        }
    }

    const parityObserver = new MutationObserver(muts => {
        const t = now();
        for (const m of muts) {
            if (m.type === 'attributes') {
                const el = m.target;
                if (!el.classList) continue;
                // A cached page restored into view (class 'hide' removed).
                if ((el.classList.contains('mainAnimatedPage') || el.classList.contains('page')) && isShown(el)) {
                    pageBecameVisible(el, t);
                }
                if (cur && cur.nativeButtonsAt === null
                    && el.classList.contains('detailButton') && !el.classList.contains('hide')
                    && el.closest && el.closest('.mainDetailButtons')) {
                    cur.nativeButtonsAt = t;
                }
                // A marker element could also become "real" by un-hiding.
                if (cur) {
                    for (let i = 0; i < MARKERS.length; i++) {
                        const sel = MARKERS[i];
                        if (sel in cur.markers) continue;
                        try {
                            if (el.matches && el.matches(sel) && !el.classList.contains('hide')) {
                                markSeen(sel, t);
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            } else if (m.type === 'childList') {
                for (let i = 0; i < m.addedNodes.length; i++) scanAdded(m.addedNodes[i], t);
            }
        }
    });
    // At document_start documentElement does not exist yet; observing the
    // Document node covers the whole tree from the moment it appears.
    try {
        parityObserver.observe(document, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    } catch (e) { /* parity metrics unavailable */ }

    // ---- FPS sampler --------------------------------------------------------
    let fpsRun = null;
    function startFps() {
        stopFps();
        fpsRun = { deltas: [], last: now(), raf: 0 };
        const loop = () => {
            if (!fpsRun) return;
            const t = now();
            fpsRun.deltas.push(t - fpsRun.last);
            fpsRun.last = t;
            fpsRun.raf = requestAnimationFrame(loop);
        };
        fpsRun.raf = requestAnimationFrame(loop);
    }
    function stopFps() {
        if (!fpsRun) return null;
        cancelAnimationFrame(fpsRun.raf);
        const deltas = fpsRun.deltas.slice(1); // first delta spans the pre-start gap
        fpsRun = null;
        if (!deltas.length) return null;
        const total = deltas.reduce((a, b) => a + b, 0);
        const dropped = deltas.filter(d => d > 25).length; // >1.5x of a 60Hz frame
        const out = {
            frames: deltas.length,
            fps: 1000 / (total / deltas.length),
            droppedPct: 100 * dropped / deltas.length,
            worstFrameMs: Math.max.apply(null, deltas)
        };
        if (cur) cur.fps = out;
        return out;
    }

    // ---- Snapshot -----------------------------------------------------------
    function inWindow(t, e) {
        const end = e.tEnd === null ? Infinity : e.tEnd;
        return t >= e.t0 && t < end;
    }

    function p98(arr) {
        if (!arr.length) return 0;
        const s = arr.slice().sort((a, b) => a - b);
        return s[Math.min(s.length - 1, Math.floor(0.98 * s.length))];
    }

    function summarize(e) {
        const lt = G.longTasks.filter(x => inWindow(x.t, e));
        const inter = G.interactions.filter(x => inWindow(x.t, e)).map(x => x.dur);
        const res = G.jeResources.filter(x => inWindow(x.t, e));
        const markers = {};
        for (const sel in e.markers) markers[sel] = e.markers[sel] - e.t0;
        const nativeAt = e.nativeButtonsAt === null ? null : e.nativeButtonsAt - e.t0;
        const pageShownAt = e.pageShownAt === null ? null : e.pageShownAt - e.t0;
        const parity = {};
        if (nativeAt !== null) {
            for (const sel in e.markers) parity[sel] = markers[sel] - nativeAt;
        }
        return {
            label: e.label,
            durationMs: (e.tEnd === null ? now() : e.tEnd) - e.t0,
            longTaskCount: lt.length,
            longestTaskMs: lt.length ? Math.max.apply(null, lt.map(x => x.dur)) : 0,
            tbtMs: lt.reduce((a, x) => a + Math.max(0, x.dur - 50), 0),
            cls: G.shifts.filter(x => inWindow(x.t, e)).reduce((a, x) => a + x.v, 0),
            interactionCount: inter.length,
            interactionP98Ms: p98(inter),
            jeRequestCount: res.length,
            jeLastResourceEndMs: res.length ? Math.max.apply(null, res.map(x => x.end)) - e.t0 : null,
            nativeButtonsAtMs: nativeAt,
            pageShownAtMs: pageShownAt,
            markersAtMs: markers,
            parityMs: parity,
            fps: e.fps
        };
    }

    window.__JEPROBE = {
        newEpoch,
        startFps,
        stopFps,
        snapshot: () => ({ epochs: G.epochs.map(summarize) }),
        epochState: () => ({
            label: cur.label,
            nativeSeen: cur.nativeButtonsAt !== null,
            markersSeen: Object.keys(cur.markers)
        })
    };
}

export const PROBE_SOURCE = `(${probeMain.toString()})(${JSON.stringify(JE_MARKERS)});`;
