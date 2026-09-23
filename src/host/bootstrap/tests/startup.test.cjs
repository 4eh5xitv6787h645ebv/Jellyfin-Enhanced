const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../..');
// Frozen pre-extraction initializer: a characterization fixture, not a build input.
const baselineSource = fs.readFileSync(path.join(__dirname, 'startup-baseline.js.txt'), 'utf8');
const context = vm.createContext({});
vm.runInContext(baselineSource, context);
const baseline = context.initializeFeatures;
const startupSources = [];
for (const feature of fs.readdirSync(path.join(root, 'src/features')).sort()) {
    const source = path.join(root, 'src/features', feature, 'client/startup.js');
    if (!fs.existsSync(source)) continue;
    const code = fs.readFileSync(source, 'utf8');
    vm.runInContext(code, context, { filename: source });
    startupSources.push({ source, code });
}
vm.runInContext(fs.readFileSync(path.join(root, 'src/host/bootstrap/feature-startup.js'), 'utf8'), context);
const runFeatures = context.initializeFeatures;

const methods = [...baselineSource.matchAll(/JE\.([\w.]+)\(\)/g)].map(match => match[1]);
const pluginFlags = [...new Set([...baselineSource.matchAll(/JE\.pluginConfig\?\.(\w+)/g)].map(match => match[1]))];
const userFlags = [...new Set([...baselineSource.matchAll(/JE\.currentSettings\?\.(\w+)/g)].map(match => match[1]))];

function makeState({ enabled = true, overrides = {}, missing = [], failAt, onCall } = {}) {
    const calls = [];
    const JE = {
        pluginConfig: Object.fromEntries(pluginFlags.map(flag => [flag, enabled])),
        currentSettings: Object.fromEntries(userFlags.map(flag => [flag, enabled]))
    };
    for (const method of methods) {
        const parts = method.split('.');
        const name = parts.pop();
        let owner = JE;
        for (const part of parts) owner = owner[part] || (owner[part] = {});
        if (missing.includes(method)) continue;
        owner[name] = function () {
            assert.equal(this, owner, `${method} must retain its receiver`);
            calls.push(method);
            if (onCall) onCall(method, JE);
            if (method === failAt) throw new Error(`Failure in ${method}`);
        };
    }
    Object.assign(JE.pluginConfig, overrides.pluginConfig);
    Object.assign(JE.currentSettings, overrides.currentSettings);
    return { JE, calls };
}

function outcome(initialize, options) {
    const state = makeState(options);
    let error;
    try { initialize(state.JE); } catch (failure) { error = failure.message; }
    return { calls: state.calls, error };
}

test('feature startup declarations do not access runtime state before initialization', () => {
    const forbidden = new Proxy({}, {
        get() { throw new Error('declaration accessed runtime state'); },
        set() { throw new Error('declaration mutated runtime state'); }
    });
    for (const { source, code } of startupSources) {
        assert.doesNotThrow(() => vm.runInNewContext(code, { JE: forbidden }, { filename: source }));
    }
});

test('startup preserves baseline order with enabled, disabled, absent and individual flags', () => {
    const scenarios = [{ enabled: true }, { enabled: false }, { enabled: null }];
    for (const flag of pluginFlags) {
        scenarios.push({ enabled: true, overrides: { pluginConfig: { [flag]: false } } });
        scenarios.push({ enabled: false, overrides: { pluginConfig: { [flag]: true } } });
        scenarios.push({ enabled: true, overrides: { pluginConfig: { [flag]: undefined } } });
    }
    for (const flag of userFlags) {
        scenarios.push({ enabled: true, overrides: { currentSettings: { [flag]: false } } });
        scenarios.push({ enabled: false, overrides: { currentSettings: { [flag]: true } } });
    }
    for (const options of scenarios) {
        assert.deepEqual(outcome(runFeatures, options), outcome(baseline, options), JSON.stringify(options));
    }
    function withoutSettings(initialize) {
        const { JE, calls } = makeState();
        delete JE.pluginConfig;
        delete JE.currentSettings;
        initialize(JE);
        return calls;
    }
    assert.deepEqual(withoutSettings(runFeatures), withoutSettings(baseline));
});

test('missing optional feature methods preserve the remaining startup sequence', () => {
    for (const method of methods) {
        const options = { missing: [method] };
        assert.deepEqual(outcome(runFeatures, options), outcome(baseline, options), method);
    }
    assert.doesNotThrow(() => runFeatures({}));
});

test('a synchronous feature failure stops later startup steps at the same boundary', () => {
    for (const method of methods) {
        const options = { failAt: method };
        assert.deepEqual(outcome(runFeatures, options), outcome(baseline, options), method);
    }
});

test('settings remain live between interleaved feature steps', () => {
    const options = {
        onCall(method, JE) {
            if (method === 'initializeEnhancedScript') JE.pluginConfig.ElsewhereEnabled = false;
            if (method === 'initializeQualityTags') JE.currentSettings.languageTagsEnabled = false;
            if (method === 'initializeHiddenContent') JE.pluginConfig.SpoilerBlurEnabled = false;
        }
    };
    assert.deepEqual(outcome(runFeatures, options), outcome(baseline, options));
});

test('configuration getter errors remain synchronous and stop startup immediately', () => {
    function run(initialize) {
        const { JE, calls } = makeState();
        Object.defineProperty(JE.pluginConfig, 'ElsewhereEnabled', {
            get() { throw new Error('configuration unavailable'); }
        });
        assert.throws(() => initialize(JE), /configuration unavailable/);
        return calls;
    }
    assert.deepEqual(run(runFeatures), run(baseline));
});
