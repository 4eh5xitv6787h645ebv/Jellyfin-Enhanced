// Scenario runner. Each run gets a fresh browser context (cold HTTP cache,
// auth-only localStorage), the probe injected before any app code, and a CDP
// CPU throttle. Results (per-run metrics + aggregates + DOM signatures +
// console errors) are written to results/<label>.json.
//
// Usage:
//   node runner/run.mjs [--label X] [--runs N] [--no-je] [--scenario substr] [--headed]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import { PROBE_SOURCE, JE_MARKERS } from '../lib/probe.mjs';
import { ensureAuthState } from '../lib/auth.mjs';
import { pickItems } from '../lib/items.mjs';
import { aggregate } from '../lib/stats.mjs';
import { getPluginConfig } from '../lib/config.mjs';
import { scenarios, discoverRoutes } from '../scenarios/index.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.join(HERE, '..', 'results');

function parseArgs(argv) {
    const args = { label: 'run', runs: null, noJe: false, filter: null, headed: false };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--label') args.label = argv[++i];
        else if (a === '--runs') args.runs = parseInt(argv[++i], 10);
        else if (a === '--no-je') args.noJe = true;
        else if (a === '--scenario') args.filter = argv[++i];
        else if (a === '--headed') args.headed = true;
        else throw new Error(`Unknown arg: ${a}`);
    }
    return args;
}

async function runScenarioOnce(browser, scenario, ctx) {
    const context = await browser.newContext({
        viewport: ctx.bench.viewport,
        storageState: ctx.authState
    });
    await context.addInitScript({ content: PROBE_SOURCE });
    if (ctx.noJe) {
        await context.route('**/JellyfinEnhanced/**', route => route.abort());
    }
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on('pageerror', err => consoleErrors.push(('PAGEERROR: ' + err.message).slice(0, 300)));

    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: ctx.bench.cpuThrottle });

    try {
        const metrics = await scenario.run(page, ctx);
        const signature = await page.evaluate(sels =>
            Object.fromEntries(sels.map(s => [s, document.querySelectorAll(s).length])),
            JE_MARKERS.concat(['.mainDetailButtons .detailButton:not(.hide)']));
        return { metrics, signature, consoleErrors };
    } finally {
        await context.close();
    }
}

async function main() {
    const args = parseArgs(process.argv);
    const bench = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', 'bench.json'), 'utf8'));
    const runs = args.runs ?? bench.runs;

    const pluginCfg = await getPluginConfig(bench).catch(() => null);
    if (pluginCfg && pluginCfg.DevMode === true && !args.label.startsWith('dev')) {
        console.warn('\nWARNING: DevMode=true on the server — measured numbers will not reflect production caching!\n');
    }

    const browser = await chromium.launch({ headless: !args.headed });
    const authState = await ensureAuthState(browser, bench);
    const items = await pickItems(bench);

    // Route discovery happens once, with JE enabled and no throttle.
    const discCtx = await browser.newContext({ viewport: bench.viewport, storageState: authState });
    const discPage = await discCtx.newPage();
    const routes = await discoverRoutes(discPage, bench, items);
    await discCtx.close();

    const ctx = { bench, items, routes, noJe: args.noJe, authState };
    const selected = scenarios.filter(s => !args.filter || s.name.includes(args.filter));

    const out = {
        label: args.label,
        date: new Date().toISOString(),
        noJe: args.noJe,
        runs,
        cpuThrottle: bench.cpuThrottle,
        devMode: pluginCfg ? pluginCfg.DevMode : null,
        items: { movie: items.movieName, series: items.seriesName },
        scenarios: {}
    };

    for (const scenario of selected) {
        process.stdout.write(`\n=== ${scenario.name} (${runs} runs) `);
        const runResults = [];
        const allErrors = [];
        let signature = null;
        for (let i = 0; i < runs; i++) {
            process.stdout.write('.');
            try {
                const r = await runScenarioOnce(browser, scenario, ctx);
                runResults.push(r.metrics);
                signature = r.signature; // last run's DOM signature
                allErrors.push(...r.consoleErrors);
                if (r.metrics && r.metrics._diag) {
                    out.scenarios[scenario.name + ':diag'] = r.metrics._diag;
                    delete r.metrics._diag;
                }
            } catch (e) {
                process.stdout.write('x');
                allErrors.push('RUNNER: ' + e.message.slice(0, 300));
            }
        }
        out.scenarios[scenario.name] = {
            aggregated: aggregate(runResults),
            runsCompleted: runResults.length,
            signature,
            consoleErrors: [...new Set(allErrors)].slice(0, 25)
        };
        const agg = out.scenarios[scenario.name].aggregated;
        const brief = ['tbtMs', 'longTaskCount', 'longestTaskMs', 'cls']
            .filter(k => agg[k] && agg[k].median !== null)
            .map(k => `${k}=${agg[k].median.toFixed(1)}`)
            .join(' ');
        process.stdout.write(` ${brief}\n`);
        for (const key of Object.keys(agg)) {
            if (key.startsWith('parity:') && agg[key].median !== null) {
                console.log(`    ${key} = ${agg[key].median.toFixed(0)}ms (mad ${agg[key].mad?.toFixed(0)})`);
            }
        }
    }

    await browser.close();
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const file = path.join(RESULTS_DIR, `${args.label}.json`);
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    console.log(`\nWrote ${file}`);
}

main().catch(e => { console.error(e); process.exit(1); });
