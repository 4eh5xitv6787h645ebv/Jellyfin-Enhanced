const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readLayout } = require('../build/layout.cjs');

function fixture(t, definition = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'je-layout-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const write = (name, data) => {
        fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
        fs.writeFileSync(path.join(root, name), typeof data === 'string' ? data : JSON.stringify(data));
    };
    const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    for (const owner of ['host', 'shared']) write(`src/${owner}/feature.json`, { id: owner });
    write('src/shared/localization/resources.json', { id: 'locales' });
    write('src/host/compatibility/asset-aliases.json', {});
    write('src/host/bootstrap/module-order.json', []);
    write('src/host/bootstrap/feature-startup.js', 'function initializeFeatures(JE) {}');
    write('src/features/spoiler-guard/feature.json', { id: 'spoiler-guard', ...definition });
    for (const source of [...Object.keys(definition.modules || {}), ...Object.keys(definition.standalone || {}), ...(definition.assets || [])]) {
        if (!source.startsWith('../')) write(`src/features/spoiler-guard/${source}`, '// test asset');
    }
    return { root, write, read, calls: [] };
}
const oneModule = { modules: { 'client/state.js': [] } };
const stateSource = 'src/features/spoiler-guard/client/state.js';
function startup(setup, options = {}) {
    const owner = options.owner || 'spoiler-guard';
    const directory = ['host', 'shared'].includes(owner) ? `src/${owner}` : `src/features/${owner}`;
    const descriptor = `${directory}/feature.json`;
    const definition = fs.existsSync(path.join(setup.root, descriptor)) ? setup.read(descriptor) : { id: owner };
    const source = options.source || 'client/startup.js';
    const name = options.name || 'startExample';
    definition.startup = source;
    setup.write(descriptor, definition);
    setup.write(path.join(directory, source), options.code || `function ${name}(JE) { JE.initialize(); }`);
    setup.calls.push(name);
    setup.write('src/host/bootstrap/feature-startup.js', `function initializeFeatures(JE) { ${setup.calls.map(call => `${call}(JE);`).join(' ')} }`);
}

test('one compatibility alias preserves public identity independently of feature source names', t => {
    const setup = fixture(t, oneModule);
    setup.write('src/host/compatibility/asset-aliases.json', { [stateSource]: 'js/legacy/state.js' });
    const layout = readLayout(setup.root);
    assert.equal(layout.assets[0].source, stateSource);
    assert.equal(layout.assets[0].resource, 'Jellyfin.Plugin.JellyfinEnhanced.js.legacy.state.js');
    assert.equal(layout.manifest.components[0].path, 'legacy/state.js');
});
test('new modules derive feature paths without compatibility or historical-order edits', t => {
    const setup = fixture(t, oneModule);
    const layout = readLayout(setup.root);
    assert.equal(layout.manifest.components[0].path, 'features/spoiler-guard/state.js');
    assert.equal(layout.assets[0].resource, 'Jellyfin.Plugin.JellyfinEnhanced.js.features.spoiler-guard.state.js');
});
test('new prerequisites are inserted before consumers without reordering historical modules', t => {
    const setup = fixture(t, { modules: {
        'client/consumer.js': ['spoiler-guard/producer'], 'client/other.js': [], 'client/producer.js': []
    } });
    setup.write('src/host/bootstrap/module-order.json', ['spoiler-guard/consumer', 'spoiler-guard/other']);
    assert.deepEqual(readLayout(setup.root).manifest.components.map(entry => path.basename(entry.path)), ['producer.js', 'consumer.js', 'other.js']);
});
test('cycles, missing and duplicate named dependencies cannot produce a bundle', t => {
    for (const dependencies of [['spoiler-guard/state'], ['spoiler-guard/missing']]) {
        const setup = fixture(t, { modules: { 'client/state.js': dependencies } });
        assert.throws(() => readLayout(setup.root), /Missing or cyclic/);
    }
    const duplicate = fixture(t, { modules: { 'client/state.js': ['shared/session', 'shared/session'] } });
    assert.throws(() => readLayout(duplicate.root), /Invalid\/duplicate named dependencies/);
});
test('duplicate delivery aliases and physical asset ownership are rejected', t => {
    const setup = fixture(t, { modules: { 'client/state.js': [], 'client/other.js': [] } });
    setup.write('src/host/compatibility/asset-aliases.json', {
        [stateSource]: 'js/legacy/state.js', 'src/features/spoiler-guard/client/other.js': 'js/legacy/state.js'
    });
    assert.throws(() => readLayout(setup.root), /Duplicate resource/);
    const physical = fixture(t, { assets: ['client/data.json', 'client/data.json'] });
    assert.throws(() => readLayout(physical.root), /Duplicate resource|multiple owners/);
});
test('stale compatibility aliases and stale or duplicate historical module names fail visibly', t => {
    const setup = fixture(t, oneModule);
    setup.write('src/host/compatibility/asset-aliases.json', { 'src/features/removed/client/file.js': 'js/old/file.js' });
    assert.throws(() => readLayout(setup.root), /Unused legacy asset alias/);
    setup.write('src/host/compatibility/asset-aliases.json', {});
    setup.write('src/host/bootstrap/module-order.json', ['spoiler-guard/missing']);
    assert.throws(() => readLayout(setup.root), /Missing or cyclic/);
    setup.write('src/host/bootstrap/module-order.json', ['spoiler-guard/state', 'spoiler-guard/state']);
    assert.throws(() => readLayout(setup.root), /Invalid\/duplicate historical module order/);
});
test('source paths must stay inside the repository and resolve to files', t => {
    const setup = fixture(t, { assets: ['../../../../../outside.json'] });
    assert.throws(() => readLayout(setup.root), /escapes repository/);
});
test('features cannot claim another feature source', t => {
    const setup = fixture(t, { assets: ['../bookmarks/client/data.json'] });
    setup.write('src/features/bookmarks/client/data.json', '{}');
    setup.write('src/features/bookmarks/feature.json', { id: 'bookmarks' });
    assert.throws(() => readLayout(setup.root), /another owner/);
});
test('feature JavaScript needs an explicit loader and test sources are excluded', t => {
    assert.throws(() => readLayout(fixture(t, { assets: ['client/state.js'] }).root), /needs a loader/);
    assert.throws(() => readLayout(fixture(t, { modules: { 'tests/fixture.js': [] } }).root), /cannot be embedded/);
    assert.throws(() => readLayout(fixture(t, { standalone: { 'client/early.js': '' } }).root), /loading reason/);
});
test('symlinks cannot bypass repository and feature ownership boundaries', t => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'je-layout-external-'));
    t.after(() => fs.rmSync(external, { recursive: true, force: true }));
    fs.writeFileSync(path.join(external, 'outside.js'), '// external');
    const first = fixture(t, oneModule);
    fs.unlinkSync(path.join(first.root, stateSource));
    fs.symlinkSync(path.join(external, 'outside.js'), path.join(first.root, stateSource));
    assert.throws(() => readLayout(first.root), /escapes repository through a symlink/);
    const second = fixture(t, oneModule);
    second.write('src/host/other.js', '// another owner');
    fs.unlinkSync(path.join(second.root, stateSource));
    fs.symlinkSync(path.join(second.root, 'src/host/other.js'), path.join(second.root, stateSource));
    assert.throws(() => readLayout(second.root), /another owner through a symlink/);
});
test('public script paths reject URL syntax, backslashes and ambiguous segments', t => {
    for (const publicPath of ['a\\b.js', '../a.js', './a.js', '/a.js', 'a//b.js', 'a/./b.js', 'a?x=b.js', 'a#b.js', 'a/%2e%2e/b.js', 'https://host/a.js']) {
        const setup = fixture(t, oneModule);
        setup.write('src/host/compatibility/asset-aliases.json', { [stateSource]: publicPath });
        assert.throws(() => readLayout(setup.root), /Invalid public .* path/, publicPath);
    }
    const setup = fixture(t, oneModule);
    setup.write('src/host/compatibility/asset-aliases.json', { [stateSource]: 'js/feature-name/v2/file.min.js' });
    assert.equal(readLayout(setup.root).manifest.components[0].path, 'feature-name/v2/file.min.js');
});
test('private startup declarations are validated without executing feature initialization', t => {
    const setup = fixture(t, oneModule);
    startup(setup);
    const layout = readLayout(setup.root);
    assert.deepEqual(layout.startupCalls, ['startExample']);
    assert.equal(layout.assets.length, 1);
});
test('startup inputs cannot be test fixtures or public script resources', t => {
    const tests = fixture(t);
    startup(tests, { source: 'tests/startup.js' });
    assert.throws(() => readLayout(tests.root), /Test source cannot be a startup input/);
    const embedded = fixture(t, { modules: { 'client/startup.js': [] } });
    startup(embedded);
    assert.throws(() => readLayout(embedded.root), /Private startup source cannot be embedded/);
});
test('startup sources and initializer names each have one owner', t => {
    const duplicateSource = fixture(t);
    startup(duplicateSource);
    startup(duplicateSource, { owner: 'shared', source: '../features/spoiler-guard/client/startup.js' });
    assert.throws(() => readLayout(duplicateSource.root), /Duplicate startup source/);
    const duplicateName = fixture(t);
    startup(duplicateName);
    startup(duplicateName, { owner: 'bookmarks' });
    assert.throws(() => readLayout(duplicateName.root), /Duplicate startup initializer/);
});
test('startup declarations and host composition cannot read or mutate runtime state', t => {
    for (const access of ['JE.config;', 'JE.enabled = true;', 'Object.defineProperty(JE, "enabled", {value: true});', 'delete JE.enabled;', 'Object.setPrototypeOf(JE, {});', 'Object.getPrototypeOf(JE);']) {
        const setup = fixture(t);
        startup(setup, { code: `${access} function startExample(JE) {}` });
        assert.throws(() => readLayout(setup.root), /must not access JE/);
        startup(setup);
        setup.write('src/host/bootstrap/feature-startup.js', `function initializeFeatures(JE) { ${access} startExample(JE); }`);
        assert.throws(() => readLayout(setup.root), /must not access JE/);
    }
});
test('host composition must schedule every named initializer exactly once and pass JE', t => {
    for (const [body, expected] of [
        ['', /Unscheduled startup initializer/],
        ['startExample(JE); startExample(JE);', /Duplicate startup call/],
        ['startMissing(JE);', /not defined/],
        ['startExample({});', /must receive JE/]
    ]) {
        const setup = fixture(t);
        startup(setup);
        setup.write('src/host/bootstrap/feature-startup.js', `function initializeFeatures(JE) { ${body} }`);
        assert.throws(() => readLayout(setup.root), expected);
    }
});
test('new root locale files must be registered before assets can be generated', t => {
    const setup = fixture(t);
    setup.write('locales/en.json', '{}');
    assert.throws(() => readLayout(setup.root), /Unregistered locale source: locales\/en.json/);
    setup.write('src/shared/localization/resources.json', { id: 'locales', assets: ['../../../locales/en.json'] });
    assert.equal(readLayout(setup.root).assets[0].resource, 'Jellyfin.Plugin.JellyfinEnhanced.js.locales.en.json');
    setup.write('locales/fr.json', '{}');
    assert.throws(() => readLayout(setup.root), /Unregistered locale source: locales\/fr.json/);
});
