const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const JE = { pluginConfig: {}, jellyseerrAPI: { addCollections: async items => items } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../client/search/collections.js'), 'utf8'), {
        window: { JellyfinEnhanced: JE }, console: { debug() {} }
    });
    return JE;
}

test('collection enrichment places one collection after its first movie without changing title order', async () => {
    const JE = harness();
    const collection = { id: 12, name: 'Dune' };
    const items = [{ id: 1, mediaType: 'movie', collection }, { id: 2, mediaType: 'tv' },
        { id: 3, mediaType: 'movie', collection }, { id: 4, mediaType: 'movie', collection: { id: 13, name: 'Alien', posterPath: '/poster.jpg' } }];
    const result = await JE.seerrSearch.prepareResultsWithCollections(items);
    assert.deepEqual(result.map(item => `${item.mediaType}:${item.id}`), ['movie:1', 'collection:12', 'tv:2', 'movie:3', 'movie:4', 'collection:13']);
    assert.equal(result[1].title, 'Dune');
    assert.equal(result[1].posterPath, null);
    assert.equal(result[5].posterPath, '/poster.jpg');
});

test('disabled collections do not call enrichment and failures retain original search results', async () => {
    const JE = harness(); let calls = 0;
    JE.jellyseerrAPI.addCollections = async () => { calls++; throw new Error('unavailable'); };
    const items = [{ id: 1, mediaType: 'movie' }];
    JE.pluginConfig.ShowCollectionsInSearch = false;
    assert.equal(await JE.seerrSearch.prepareResultsWithCollections(items), items);
    assert.equal(calls, 0);
    JE.pluginConfig.ShowCollectionsInSearch = true;
    assert.equal(await JE.seerrSearch.prepareResultsWithCollections(items), items);
    assert.equal(calls, 1);
});
