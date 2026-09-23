import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInContext } from 'node:vm';
import { createDashboardHarness, clone } from './dashboard-baseline-harness.mjs';

const root = new URL('../../../src/', import.meta.url);
const paths = JSON.parse(await readFile(new URL('host/dashboard/scripts.json', root), 'utf8'))
    .filter(path => /^features\/[^/]+\/settings\/settings\.js$/.test(path));
const sources = await Promise.all(paths.map(path => readFile(new URL(path, root), 'utf8')));
const baseline = JSON.parse(await readFile(new URL('./fixtures/dashboard-dependencies-baseline.json', import.meta.url), 'utf8'));

function harness() {
    const h = createDashboardHarness({}, { scripts: [] });
    const modules = {}, status = {};
    const lifecycle = { disposed: false, listen() {}, setTimeout() {}, clearTimeout() {}, dispose() {} };
    const deps = new Proxy({
        lifecycle, getPluginStatus: () => status,
        hasTmdbKey: () => modules['streaming-availability'].hasTmdbKey(),
    }, { get(target, key) { return target[key] || (() => {}); } });
    sources.forEach((source, i) => {
        runInContext(source, h.context);
        const name = /^function (create\w+)\(/m.exec(source)[1];
        modules[paths[i].split('/')[1]] = h.context[name](deps);
    });
    const production = Object.fromEntries(Object.keys(baseline.rules).map(key => [key,
        Object.values(modules).flatMap(module => module.getDependencies?.()[key] || []),
    ]));
    runInContext(baseline.availability, h.context);
    const previous = Object.fromEntries(Object.entries(baseline.rules).map(([key, source]) => [key, runInContext(source, h.context)]));
    return { ...h, production, previous, status };
}

// Grouping by feature changes iteration order. Dependency tags combine by key;
// parent rules inspect checked state without changing it, so their constraints
// remain additive. Compare descriptor sets; separately compare every predicate.
test('all baseline dependency descriptors survive feature ownership, including Metadata Icons Arr gating', () => {
    const h = harness();
    const canonical = rules => clone(rules.map(rule => JSON.stringify(rule)).sort());
    for (const key of Object.keys(baseline.rules)) {
        assert.deepEqual(canonical(h.production[key]), canonical(h.previous[key]), key);
    }
    assert.equal(h.production.sections.length, 2);
    assert.equal(h.production.individual.length, 20);
    assert.equal(h.production.parents.length, 35);
    assert.equal(h.production.customTabsHints.length, 6);
});

test('actual feature dependency predicates match baseline across plugin, credential, metadata and Arr enablement states', () => {
    const h = harness();
    const originalQuery = h.context.document.querySelectorAll;
    let cards = [];
    h.context.document.querySelectorAll = selector => selector.includes('.arr-instance-card') ? cards : originalQuery(selector);
    const keys = ['hasPluginPages', 'hasCustomTabs', 'isJellyfin12', 'hasIntroSkipper'];
    const outcomes = new Map();
    for (let scenario = 0; scenario < 96; scenario++) {
        keys.forEach((key, bit) => {
            h.status[key] = scenario % 3 === 0 ? undefined : !!(scenario & (1 << bit));
            h.context[key] = h.status[key];
        });
        h.element('TMDB_API_KEY').value = scenario & 1 ? 'key' : '';
        h.element('jellyseerr_TMDB_API_KEY').value = scenario & 2 ? 'mirror-key' : '';
        h.element('metadataIconsEnabled').checked = !!(scenario & 4);
        h.element('jellyseerrEnabled').checked = !!(scenario & 8);
        h.element('JellyseerrApiKey').value = scenario & 16 ? 'secret' : '';
        h.element('jellyseerrUrls').value = scenario & 32 ? 'https://seerr.invalid' : 'missing-scheme.invalid';
        cards = scenario % 3 === 0 ? [] : [{ querySelector(selector) {
            if (selector === '.arr-instance-enabled') return { checked: !!(scenario & 16) };
            if (selector === '.arr-instance-url') return { value: 'https://arr.invalid' };
            if (selector === '.arr-instance-apikey') return { value: scenario & 32 ? 'secret' : '' };
            throw new Error('Unexpected selector ' + selector);
        } }];
        for (const key of ['sections', 'individual']) {
            for (const previous of h.previous[key]) {
                const id = previous.id || previous.tabSelector;
                const current = h.production[key].find(rule => (rule.id || rule.tabSelector) === id);
                assert.ok(current, 'Missing dependency ' + id);
                const result = current.checkFn();
                assert.equal(result, previous.checkFn(), `${id}, scenario ${scenario}`);
                if (!outcomes.has(id)) outcomes.set(id, new Set());
                outcomes.get(id).add(result);
            }
        }
    }
    for (const [id, results] of outcomes) assert.deepEqual([...results].sort(), [false, true], 'both outcomes exercised: ' + id);
});
