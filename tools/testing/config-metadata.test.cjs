'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
let generator;
test.before(async () => { generator = await import('../build/generate-config-flag-groups.mjs'); });

const schema = body => `public partial class PluginConfiguration : BasePluginConfiguration {\n${body}\n}`;

test('metadata defaults match all primitive defaults in the immutable compiled schema fixture', () => {
    const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/compatibility/configuration/storage/schema-defaults.json'), 'utf8'));
    const expected = Object.fromEntries(Object.entries(fixture.PluginConfiguration.defaults)
        .filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value)));
    assert.equal(Object.keys(expected).length, 299, 'The fixture protects the original 299 documentation defaults');
    assert.deepEqual(generator.extractDefaults(generator.configurationSource()), expected);
});

test('inline defaults combine across partials without a constructor or helper evaluator', () => {
    const source = schema(`
    public int Count { get; set; } = 9;
    public bool Untouched { get; set; }
    public string Label { get; set; } = "inline";`) + `
public partial class PluginConfiguration {
    public long Timestamp { get; set; } = 0;
    public bool Enabled { get; set; } = true;
    public string Empty { get; set; } = string.Empty;
    public bool? Override { get; set; }
    public List<Shortcut> Shortcuts { get; set; } = new List<Shortcut> { new Shortcut() };
}`;
    assert.deepEqual(generator.extractDefaults(source), { Count: 9, Untouched: false, Label: 'inline', Timestamp: 0, Enabled: true, Empty: '' });
});

test('comments and quoted braces do not create fake properties or truncate initializers', () => {
    const source = schema(`
    // public bool Fake { get; set; } = true;
    /* public int AlsoFake { get; set; } = 4; } */
    public string Text { get; set; } = "}; // literal text";
    public int Negative { get; set; } = -3;`);
    assert.deepEqual(generator.extractDefaults(source), { Text: '}; // literal text', Negative: -3 });
});

test('constructor defaults fail explicitly rather than silently producing stale documentation', () => {
    assert.throws(() => generator.extractDefaults(schema(`
    public bool Enabled { get; set; }
    public PluginConfiguration() { Enabled = true; }`)), /inline property initializers/);
    assert.throws(() => generator.extractDefaults('public class SomethingElse {}'), /Could not find/);
});

test('committed documentation metadata matches current form and schema byte for byte', () => {
    const metadata = generator.generateMetadata(fs.readFileSync(generator.configPage, 'utf8'), generator.configurationSource());
    assert.equal(generator.serializeMetadata(metadata), fs.readFileSync(generator.outputFile, 'utf8'));
});

test('groups and labels follow visible tabs and legends while ignoring icons, scripts and overview widgets', () => {
    const markup = `<button class="jellyfin-tab-button" data-tab="appearance"><i class="material-icons">palette</i>Appearance</button>
<div class="jellyfin-tab-content" id="appearance">
<fieldset><legend><img src="logo.png"><i>paint</i>Display &amp; options</legend>
<label for="enabled">Enable&nbsp;display</label><input id="enabled" />
<label for="enabled">Do not replace first label</label>
<label><input id="showReleaseDate"/><i>calendar</i>Release &#x64;ate</label>
<script>const fake = '<input id="fake"><label for="fake">Fake</label>';</script>
<style>.fake::before { content: '<input id="otherFake">'; }</style>
</fieldset><fieldset id="overview-status"><legend>Status</legend><input id="status" /></fieldset></div>`;
    const data = generator.generateMetadata(markup, schema('public bool Enabled { get; set; }'));
    assert.equal(data.groups.Enabled, 'Display & options');
    assert.equal(data.labels.Enabled, 'Enable display');
    assert.equal(data.labels.ShowReleaseDates, 'Release date');
    assert.equal(data.tabs.Enabled, 'Appearance');
    assert.deepEqual(data.tabIcons.Appearance, { type: 'material', value: 'palette' });
    assert.equal(data.groups.Status, undefined);
    assert.equal(data.groups.Fake, undefined);
    assert.equal(data.labels.Fake, undefined);
    assert.equal(data.defaults.Enabled, false);
});

test('quoted angle brackets, nested fieldsets and self-hosted tab icons preserve extraction behavior', () => {
    const markup = `<button class='jellyfin-tab-button' data-tab='seerr'><img data-je-cdn='selfhst/svg/seerr.svg'/>Seerr</button>
<div class='jellyfin-tab-content' id='seerr'><fieldset><legend title='greater > lesser'>Requests</legend>
<fieldset><input id='enabled' data-note='a > b'/></fieldset><label for='enabled'>Requests &#38; results</label></fieldset></div>`;
    const data = generator.generateMetadata(markup, schema('public bool Enabled { get; set; } = true;'));
    assert.equal(data.groups.Enabled, 'Requests');
    assert.equal(data.labels.Enabled, 'Requests & results');
    assert.equal(data.tabs.Enabled, 'Seerr');
    assert.deepEqual(data.tabIcons.Seerr, { type: 'img', src: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/seerr.svg' });
});

test('serialization retains ASCII escapes and rejects unsupported captured HTML entities', () => {
    assert.equal(generator.serializeMetadata({ text: '“test” 🪼' }), '{\n  "text": "\\u201ctest\\u201d \\ud83e\\udebc"\n}\n');
    assert.throws(() => generator.readPageMetadata('<label for="enabled">Unknown &madeup;</label>'), /Unsupported character reference/);
});
