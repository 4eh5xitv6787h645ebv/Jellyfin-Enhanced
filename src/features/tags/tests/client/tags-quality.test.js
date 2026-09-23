const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../client');
function loadQuality(settings = {}) {
    let spec;
    const JE = {
        currentSettings: settings,
        core: { tagRenderer: {
            register(name, value) { assert.equal(name, 'quality'); spec = value; },
            reinitialize(name, value) { assert.equal(name, 'quality'); assert.equal(value, spec); },
        } },
    };
    const document = { createElement() {
        return {
            dataset: {}, children: [], classList: { values: [], add(value) { this.values.push(value); } },
            appendChild(child) { this.children.push(child); },
        };
    } };
    const context = vm.createContext({ window: { JellyfinEnhanced: JE }, document });
    for (const file of ['quality-analysis.js', 'quality-policy.js', 'qualitytags.js']) {
        vm.runInContext(readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    JE.initializeQualityTags();
    return { JE, spec };
}
const plain = value => JSON.parse(JSON.stringify(value));
const video = fields => ({ Type: 'Video', ...fields });
const audio = fields => ({ Type: 'Audio', ...fields });

const cases = [
    ['missing metadata', undefined, undefined, null, []],
    ['title resolution takes precedence', [video({ Height: 1080, DisplayTitle: '720p' })], [], null, ['720p']],
    ['misleading 4K title falls back to dimensions', [video({ Height: 1080, Width: 1920, DisplayTitle: '4K' })], [], null, ['1080p']],
    ['cropped 4K width', [video({ Height: 1600, Width: 3840 })], [], null, ['4K']],
    ['low resolution title', [video({ DisplayTitle: '520p' })], [], null, ['LOW-RES']],
    ['Dolby Vision before HDR', [video({ Codec: 'hevc', DisplayTitle: '4K Dolby Vision HDR10', Height: 2160 })], [], null, ['4K', 'HEVC', 'Dolby Vision']],
    ['technical codec before display codec', [video({ Codec: 'av1', DisplayTitle: 'HEVC' })], [], null, ['AV1']],
    ['avc codec tag', [video({ CodecTag: 'avc1' })], [], null, ['H264']],
    ['display codec fallback', [video({ Codec: 'unknown', DisplayTitle: 'VP9 HDR10Plus' })], [], null, ['VP9', 'HDR10+']],
    ['media source stream fallback', [], [{ MediaStreams: [video({ Height: 576, Codec: 'mpeg2' })] }], null, ['576p', 'MPEG2']],
    ['primary item stream wins over source', [video({ Height: 720 })], [{ MediaStreams: [video({ Height: 2160 })] }], null, ['720p']],
    ['audio title priority follows stream order', [audio({ DisplayTitle: 'DTS', Channels: 6 }), audio({ DisplayTitle: 'ATMOS', Channels: 8 })], [], null, ['DTS 7.1']],
    ['explicit channel layout takes precedence over counts', [audio({ Codec: 'eac3', Channels: 8, ChannelLayout: 'stereo' })], [], null, ['Dolby Digital+ 2.0']],
    ['audio technical fallback', [audio({ Codec: 'truehd', Profile: 'Atmos', Channels: 8 })], [], null, ['ATMOS 7.1']],
    ['bare surround channel fallback', [audio({ Channels: 6 })], [], null, ['5.1']],
    ['stereo without codec is omitted', [audio({ Channels: 2 })], [], null, []],
    ['IMAX name and physical source', [], [{ Path: '/movies/title.bluray.disc' }], { Name: 'Movie IMAX Enhanced' }, ['IMAX', 'BluRay']],
    ['NON IMAX vetoes positive filename signal', [], [{ Path: '/movies/IMAX.mkv' }], { Name: 'NON-IMAX' }, []],
    ['3D needs format indicator', [], [{ Path: '/movies/Movie.3D.HSBS.mkv' }], null, ['3D']],
    ['3D title alone is insufficient', [], [{ Path: '/movies/Movie.3D.mkv' }], null, []],
    ['HD DVD stub before DVD substring', [], [{ Path: '/movies/title.hd-dvd.disc' }], null, ['HD DVD']],
    ['generic physical stub', [], [], { Path: '/movies/title.disc' }, ['Physical']],
];
for (const [name, streams, sources, item, expected] of cases) {
    test(`quality detection: ${name}`, () => {
        const { JE } = loadQuality();
        assert.deepEqual(plain(JE.tags.qualityAnalysis.getEnhancedQuality(streams, sources, item)), expected);
    });
}

test('category ordering keeps best resolution, composite audio labels and unknown cached labels', () => {
    const { JE } = loadQuality();
    const input = ['legacy', 'DTS 5.1', '720p', 'HEVC', 'HDR10', '4K', 'BluRay', 'ATMOS 7.1', 'second-legacy'];
    const snapshot = [...input];
    assert.deepEqual(plain(JE.tags.qualityPolicy.selectLabels(input)),
        ['4K', 'BluRay', 'HDR10', 'HEVC', 'ATMOS 7.1', 'DTS 5.1', 'legacy', 'second-legacy']);
    assert.deepEqual(input, snapshot);
});

test('category filtering uses strict booleans and numeric order with deterministic ties', () => {
    const { JE } = loadQuality();
    const policy = JE.tags.qualityPolicy;
    assert.deepEqual(plain(policy.selectLabels(['4K', 'HDR10', 'HEVC', 'DTS'], {
        showResolutionTag: false, showDynamicRangeTag: 'false', videoCodecTagOrder: 0,
        audioInfoTagOrder: 0, dynamicRangeTagOrder: NaN,
    })), ['HEVC', 'DTS', 'HDR10']);
});

test('rendering preserves CSS classes, normalized data attributes, and original label text', () => {
    const { spec } = loadQuality();
    const card = { dataset: {} };
    const element = { style: {}, closest: selector => selector === '.card' ? card : null };
    let overlay;
    const ctx = {
        isTagged: () => false, shouldIgnore: () => false,
        getPersistent: () => ({ qualities: ['4K', 'BluRay', 'HDR10', 'HEVC', 'ATMOS 7.1', '2.0', 'old'] }),
        removeExistingOverlay: () => {}, commitOverlay: (_, value) => { overlay = value; },
    };
    assert.equal(spec.pipeline.renderFromCache(ctx, element, 'movie'), true);
    assert.equal(overlay.className, 'quality-overlay-container');
    assert.deepEqual(overlay.children.map(badge => [badge.textContent, badge.dataset.quality, badge.classList.values[0]]), [
        ['4K', '4K', 'resolution'], ['BluRay', 'BluRay', 'other-quality'],
        ['HDR10', 'HDR10', 'video-codec'], ['HEVC', 'HEVC', 'video-format'],
        ['ATMOS 7.1', 'ATMOS', 'audio-codec'], ['2.0', '2.0', 'other-quality'], ['old', 'old', 'other-quality'],
    ]);
});

test('disabled categories clear the tagged marker so settings can later restore the overlay', () => {
    const { spec } = loadQuality({ showResolutionTag: false });
    const card = { dataset: { jeQualityTagged: 'true' } };
    const element = { closest: selector => selector === '.card' ? card : null };
    let removed = 0;
    spec.pipeline.renderFromCache({
        isTagged: () => false, shouldIgnore: () => false, taggedAttr: 'jeQualityTagged',
        getPersistent: () => ({ qualities: ['4K'] }), removeExistingOverlay: () => removed++,
        commitOverlay: () => assert.fail('empty overlay must not be committed'),
    }, element, 'movie');
    assert.equal(removed, 1);
    assert.equal(card.dataset.jeQualityTagged, undefined);
});

test('server cache refresh invalidates only affected quality entries', () => {
    const { spec } = loadQuality();
    const element = { style: {}, closest: () => null };
    const rendered = [];
    const ctx = {
        isTagged: () => false, shouldIgnore: () => false, removeExistingOverlay: () => {},
        commitOverlay: (_, overlay) => rendered.push(overlay.children.map(badge => badge.textContent)),
    };
    const entry = height => ({ StreamData: { Streams: [video({ Height: height })] } });
    spec.pipeline.renderFromServerCache(ctx, element, entry(2160), 'a');
    spec.pipeline.renderFromServerCache(ctx, element, entry(720), 'a');
    spec.pipeline.onServerCacheRefresh(ctx, ['a']);
    spec.pipeline.renderFromServerCache(ctx, element, entry(720), 'a');
    assert.deepEqual(rendered, [['4K'], ['4K'], ['720p']]);
    assert.equal(spec.cache.key, 'JellyfinEnhanced-qualityTagsCache');
});
