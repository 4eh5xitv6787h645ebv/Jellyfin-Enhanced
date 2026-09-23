const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(setImmediate);
function harness() {
    const nodes = new Map(), requests = [];
    const makeNode = () => ({ style: {}, dataset: {}, children: [], appendChild(node) { this.children.push(node); } });
    const element = (id) => {
        if (!nodes.has(id)) {
            const node = makeNode();
            Object.defineProperty(node, 'innerHTML', { set(value) { this.children = []; this.html = value; } });
            nodes.set(id, node);
        }
        return nodes.get(id);
    };
    const lifecycle = { disposed: false, dispose() { this.disposed = true; }, listen() {} };
    const context = vm.createContext({
        console, lifecycle,
        document: {
            getElementById: element, querySelector: (id) => element(id.replace(/^#/, '')),
            createElement: makeNode, createTextNode: (text) => ({ textContent: text }),
        },
        ApiClient: {
            getUrl: (route) => route,
            ajax(options) {
                let resolve, reject;
                const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
                requests.push({ options, resolve, reject });
                return promise;
            },
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../settings/settings.js'), 'utf8'), context);
    return { module: vm.runInContext('createMaintenanceSettings({ lifecycle })', context), element, requests };
}
test('only the newest user list load renders, including failures of older loads', async () => {
    const h = harness();
    h.module.load({ MaintenanceModeAffectedUsers: '["old"]' });
    h.module.load({ MaintenanceModeAffectedUsers: 'all' });
    h.requests[1].resolve([{ id: 'new', username: 'New user' }]);
    await flush();
    const grid = h.element('je-mm-users-inner').children[0];
    assert.equal(grid.children[0].children[0].checked, true);
    assert.equal(grid.children[0].children[0].value, 'new');
    h.requests[0].reject(new Error('stale failure'));
    await flush();
    assert.equal(h.element('je-mm-users-inner').children[0], grid);
});
test('disposed user loads do not modify a replacement page', async () => {
    const h = harness();
    h.module.load({});
    h.module.dispose();
    const sentinel = {};
    h.element('je-mm-users-inner').children.push(sentinel);
    h.requests[0].resolve([{ id: 'old' }]);
    await flush();
    assert.deepEqual(h.element('je-mm-users-inner').children, [sentinel]);
});
test('a stale user avatar error does not update retired list nodes', async () => {
    const h = harness();
    h.module.load({});
    h.requests[0].resolve([{ id: 'user', username: 'User' }]);
    await flush();
    const avatar = h.element('je-mm-users-inner').children[0].children[0].children[1];
    h.module.load({});
    avatar.children[0].onerror();
    assert.equal(avatar.children.length, 1);
});
test('explicit maintenance enable still broadcasts after page disposal', async () => {
    const h = harness();
    const pending = h.module.applyMaintenanceMode({ MaintenanceModeEnabled: true });
    assert.equal(h.requests[0].options.type, 'POST');
    h.module.dispose();
    h.requests[0].resolve({});
    await flush();
    assert.equal(h.requests[1].options.url, '/JellyfinEnhanced/MaintenanceMode/Broadcast');
    h.requests[1].resolve({});
    await pending;
});
test('older successful user requests cannot replace newer user selections', async () => {
    const h = harness();
    h.module.load({});
    h.module.load({ MaintenanceModeAffectedUsers: '["selected"]' });
    h.requests[1].resolve([{ id: 'selected' }, { id: 'other' }]);
    await flush();
    const grid = h.element('je-mm-users-inner').children[0];
    assert.equal(grid.children[0].children[0].checked, true);
    assert.equal(grid.children[1].children[0].checked, false);
    h.requests[0].resolve([{ id: 'old' }]);
    await flush();
    assert.equal(h.element('je-mm-users-inner').children[0], grid);
});
