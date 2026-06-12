// Compares two result files metric-by-metric and prints verdicts.
// Usage: node runner/compare.mjs results/baseline.json results/candidate.json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judge, fmt } from '../lib/stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const budget = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'config', 'budget.json'), 'utf8'));

const [refFile, candFile] = process.argv.slice(2);
if (!refFile || !candFile) {
    console.error('Usage: node runner/compare.mjs <reference.json> <candidate.json>');
    process.exit(2);
}
const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8'));

let regressions = 0, improvements = 0;

for (const name of Object.keys(cand.scenarios)) {
    const c = cand.scenarios[name]?.aggregated;
    const r = ref.scenarios[name]?.aggregated;
    if (!c || !r) continue;
    console.log(`\n=== ${name}`);
    for (const key of Object.keys(c)) {
        const cm = c[key], rm = r[key];
        if (!rm || cm.median === null || rm.median === null) continue;
        let verdict;
        if (key === 'fps') {
            // higher is better: invert by judging negatives
            verdict = judge({ median: -cm.median, mad: cm.mad }, { median: -rm.median, mad: rm.mad }, budget.acceptance);
        } else {
            verdict = judge(cm, rm, budget.acceptance);
        }
        if (verdict === 'flat') continue;
        if (verdict === 'improved') improvements++;
        if (verdict === 'regressed') regressions++;
        console.log(`  ${verdict === 'improved' ? '✓' : '✗'} ${key}: ${fmt(rm.median)} -> ${fmt(cm.median)} (mad ${fmt(rm.mad)}/${fmt(cm.mad)}) [${verdict}]`);
    }
    // signature drift
    const cs = cand.scenarios[name]?.signature ?? {};
    const rs = ref.scenarios[name]?.signature ?? {};
    for (const sel of new Set([...Object.keys(cs), ...Object.keys(rs)])) {
        if ((cs[sel] ?? 0) !== (rs[sel] ?? 0)) {
            console.log(`  ⚠ signature drift ${sel}: ${rs[sel] ?? 0} -> ${cs[sel] ?? 0}`);
        }
    }
    const errs = cand.scenarios[name]?.consoleErrors ?? [];
    if (errs.length) console.log(`  ⚠ console errors (${errs.length}): ${errs[0]}`);
}

console.log(`\nSummary: ${improvements} improved, ${regressions} regressed`);
process.exit(regressions > 0 ? 1 : 0);
