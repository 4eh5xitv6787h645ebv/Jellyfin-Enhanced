const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../../../../..');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

class Element {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this.children = [];
        this.style = {};
        this.dataset = {};
        this.listeners = new Map();
        this._text = '';
        this._value = '';
        this.checked = false;
    }
    get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
    get value() { return this._value; }
    set value(value) { this._value = String(value); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children = []; this._text = value; }
    get firstChild() { return this.children[0]; }
    appendChild(child) {
        this.children.push(child);
        if (this.tagName === 'SELECT' && this.options.length === 1) this.value = child.value;
    }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
    remove(index) { this.children.splice(index, 1); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
    emit(type) { return Array.from(this.listeners.get(type) || [], callback => callback({ type, target: this })); }
}

function setup() {
    const nodes = new Map();
    const reads = [], mutations = [], saves = [];
    const pendingFrames = new Map();
    let frame = 0;
    const add = (id, tag) => { const element = new Element(tag); nodes.set(id, element); return element; };
    for (const id of ['blockedUsersContainer', 'blockedUsersCount', 'blockedUsersScrollHint', 'importUsersResult', 'autoMovieRequestCustomSettings']) add(id);
    add('jellyseerrImportBlockedUsers', 'input').value = 'persisted-blocklist';
    add('btnImportJellyseerrUsers', 'button').textContent = 'Import Users Now';
    for (const id of ['autoMovieRequestQualityMode', 'autoMovieRequestServer', 'autoMovieRequestProfile', 'autoMovieRequestRootFolder']) add(id, 'select');
    nodes.get('autoMovieRequestQualityMode').value = 'custom';
    const collect = node => [node, ...node.children.flatMap(collect)];
    const document = {
        getElementById: id => nodes.get(id) || null,
        querySelector: selector => nodes.get(selector.replace(/^#/, '')) || null,
        querySelectorAll: selector => selector === '.blockedUserCheckbox:checked'
            ? collect(nodes.get('blockedUsersContainer')).filter(node => node.className === 'blockedUserCheckbox' && node.checked)
            : [],
        createElement: tag => new Element(tag)
    };
    const context = vm.createContext({
        document, Event,
        window: {
            setTimeout, clearTimeout, setInterval, clearInterval,
            requestAnimationFrame: callback => { pendingFrames.set(++frame, callback); return frame; },
            cancelAnimationFrame: id => pendingFrames.delete(id)
        },
        console: { error() {}, warn() {} },
        ApiClient: {
            getUrl: url => url,
            getUsers: () => { const request = deferred(); reads.push({ ...request, url: '/Users' }); return request.promise; },
            ajax: options => { const request = deferred(); reads.push({ ...request, ...options }); return request.promise; },
            fetch: options => { const request = deferred(); mutations.push({ ...request, ...options }); return request.promise; }
        }
    });
    for (const source of ['src/host/dashboard/lifecycle.js', 'src/features/seerr/settings/users.js', 'src/features/seerr/settings/auto-movie-quality.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, source), 'utf8'), context, { filename: source });
    }
    const users = () => {
        const lifecycle = context.createDashboardLifecycle();
        const editor = context.createSeerrUsers({
            lifecycle,
            saveBeforeImport: () => { const request = deferred(); saves.push(request); return request.promise; }
        });
        editor.initialize();
        return { editor, lifecycle };
    };
    const quality = () => {
        const lifecycle = context.createDashboardLifecycle();
        const editor = context.createSeerrAutoMovieQuality({ lifecycle });
        editor.initAutoMovieQualityMode();
        return { editor, lifecycle };
    };
    return { nodes, add, reads, mutations, saves, users, quality };
}

const usersResponse = [{ Id: 'AA-11', Name: 'Alice' }, { Id: 'BB-22', Name: 'Bob' }];
const servers = [{ id: 1, name: 'One' }, { id: 2, name: 'Two' }];
const details = (id) => ({ profiles: [{ id, name: `Profile ${id}` }], rootFolders: [{ path: `/movies/${id}` }] });

test('blocklist keeps newest selection when user-list requests resolve out of order', async () => {
    const h = setup();
    const { editor } = h.users();
    const older = editor.loadBlockedUsersList('AA-11');
    const newer = editor.loadBlockedUsersList('BB-22');
    h.reads[1].resolve(usersResponse);
    await newer;
    h.reads[0].resolve(usersResponse);
    await older;
    editor.syncBlockedUsersToHiddenInput();
    assert.equal(h.nodes.get('jellyseerrImportBlockedUsers').value, 'bb22');
    assert.equal(h.nodes.get('blockedUsersCount').textContent, '(1 blocked)');
});

test('stale user-list failures cannot invalidate a successful load, and current failures preserve saved blocklist', async () => {
    const h = setup();
    const { editor } = h.users();
    const older = editor.loadBlockedUsersList('aa11');
    const newer = editor.loadBlockedUsersList('bb22');
    h.reads[1].resolve(usersResponse); await newer;
    h.reads[0].reject(new Error('old failure')); await older;
    editor.syncBlockedUsersToHiddenInput();
    assert.equal(h.nodes.get('jellyseerrImportBlockedUsers').value, 'bb22');
    const failing = editor.loadBlockedUsersList('aa11');
    h.reads[2].reject(new Error('current failure')); await failing;
    editor.syncBlockedUsersToHiddenInput();
    assert.equal(h.nodes.get('jellyseerrImportBlockedUsers').value, 'bb22');
    assert.equal(h.nodes.get('blockedUsersContainer').textContent, 'Could not load users.');
});

test('disposed and replaced user editors cannot update blocklist DOM or hidden saved values', async () => {
    for (const replace of [false, true]) {
        const h = setup();
        const { editor, lifecycle } = h.users();
        const pending = editor.loadBlockedUsersList('aa11');
        if (replace) h.add('blockedUsersContainer').textContent = 'new editor';
        else { lifecycle.dispose(); h.nodes.get('blockedUsersContainer').textContent = 'new editor'; }
        h.reads[0].resolve(usersResponse); await pending;
        editor.syncBlockedUsersToHiddenInput();
        assert.equal(h.nodes.get('blockedUsersContainer').textContent, 'new editor');
        assert.equal(h.nodes.get('jellyseerrImportBlockedUsers').value, 'persisted-blocklist');
    }
});

test('requested imports finish save/POST after disposal without changing replacement UI', async () => {
    const h = setup();
    const { lifecycle } = h.users();
    const [pending] = h.nodes.get('btnImportJellyseerrUsers').emit('click');
    lifecycle.dispose();
    h.nodes.get('btnImportJellyseerrUsers').textContent = 'replacement button';
    h.nodes.get('importUsersResult').textContent = 'replacement result';
    h.saves[0].resolve(true); await flush();
    assert.equal(h.mutations.length, 1);
    assert.equal(h.mutations[0].type, 'POST');
    assert.equal(h.mutations[0].url, 'JellyfinEnhanced/jellyseerr/import-users');
    h.mutations[0].resolve({ usersImported: 1, totalUsers: 2 }); await pending;
    assert.equal(h.nodes.get('btnImportJellyseerrUsers').textContent, 'replacement button');
    assert.equal(h.nodes.get('importUsersResult').textContent, 'replacement result');
});

test('older import completion cannot replace a newer result or reset its running button', async () => {
    const h = setup(); h.users();
    const btn = h.nodes.get('btnImportJellyseerrUsers');
    const [older] = btn.emit('click');
    h.saves[0].resolve(true); await flush();
    const [newer] = btn.emit('click');
    h.saves[1].resolve(true); await flush();
    h.mutations[0].resolve({ usersImported: 9, totalUsers: 9 }); await older;
    assert.equal(btn.disabled, true);
    assert.equal(btn.textContent, 'Importing...');
    h.mutations[1].resolve({ data: { usersImported: 1, totalUsers: 2, errors: ['<unsafe>'] } }); await newer;
    assert.equal(btn.disabled, false);
    assert.equal(btn.textContent, 'Import Users Now');
    assert.equal(h.nodes.get('importUsersResult').textContent, 'Imported 1 new user(s) out of 2 total.<unsafe>');
});

test('failed config save still prevents import submission', async () => {
    const h = setup(); h.users();
    const [pending] = h.nodes.get('btnImportJellyseerrUsers').emit('click');
    h.saves[0].reject(new Error('save failed')); await pending;
    assert.equal(h.mutations.length, 0);
    assert.match(h.nodes.get('importUsersResult').textContent, /Import was not attempted/);
    assert.equal(h.nodes.get('btnImportJellyseerrUsers').disabled, false);
});

test('a refused or unsuccessful pre-import save never submits the mutation', async () => {
    const h = setup(); h.users();
    const [pending] = h.nodes.get('btnImportJellyseerrUsers').emit('click');
    h.saves[0].resolve(false); await pending;
    assert.equal(h.mutations.length, 0);
    assert.match(h.nodes.get('importUsersResult').textContent, /Import was not attempted/);
    assert.equal(h.nodes.get('btnImportJellyseerrUsers').disabled, false);
});

test('Radarr server reloads keep latest saved config, default options and one change binding', async () => {
    const h = setup(); const { editor } = h.quality();
    editor.loadAutoMovieRadarrServers({ AutoMovieRequestCustomServerId: 1 });
    editor.loadAutoMovieRadarrServers({ AutoMovieRequestCustomServerId: 2, AutoMovieRequestCustomProfileId: 22, AutoMovieRequestCustomRootFolder: '/movies/22' });
    h.reads[1].resolve(servers); await flush();
    assert.equal(h.reads[2].url, '/JellyfinEnhanced/jellyseerr/radarr/2');
    h.reads[0].resolve(servers); await flush();
    assert.equal(h.reads.length, 3);
    h.reads[2].resolve(details(22)); await flush();
    assert.equal(h.nodes.get('autoMovieRequestServer').value, '2');
    assert.equal(h.nodes.get('autoMovieRequestProfile').value, '22');
    assert.equal(h.nodes.get('autoMovieRequestRootFolder').value, '/movies/22');
    assert.equal(h.nodes.get('autoMovieRequestProfile').options[0].value, '0');
    assert.equal(h.nodes.get('autoMovieRequestServer').listeners.get('change').size, 1);
});

test('server changes and deselection retire older details, including their failures', async () => {
    const h = setup(); const { editor } = h.quality();
    editor.loadAutoMovieRadarrServers(); h.reads[0].resolve(servers); await flush();
    const server = h.nodes.get('autoMovieRequestServer');
    server.value = '1'; server.emit('change');
    server.value = '2'; server.emit('change');
    h.reads[2].resolve(details(22)); await flush();
    h.reads[1].reject(new Error('old details failed')); await flush();
    assert.equal(h.nodes.get('autoMovieRequestProfile').options[1].textContent, 'Profile 22');
    server.value = '1'; server.emit('change');
    server.value = '-1'; server.emit('change');
    h.reads[3].resolve(details(11)); await flush();
    assert.equal(h.nodes.get('autoMovieRequestProfile').textContent, 'Select a server first...');
    assert.equal(h.nodes.get('autoMovieRequestRootFolder').value, '');
});

test('mode changes, disposal and DOM replacement ignore pending Radarr reads', async () => {
    for (const retire of ['mode', 'disposed', 'replacement']) {
        const h = setup(); const { editor, lifecycle } = h.quality();
        editor.loadAutoMovieRadarrServers({ AutoMovieRequestCustomServerId: 1 });
        if (retire === 'mode') {
            h.nodes.get('autoMovieRequestQualityMode').value = 'default';
            h.nodes.get('autoMovieRequestQualityMode').emit('change');
        } else if (retire === 'disposed') lifecycle.dispose();
        else h.add('autoMovieRequestServer', 'select');
        h.nodes.get('autoMovieRequestServer').textContent = 'replacement state';
        h.reads[0].resolve(servers); await flush();
        assert.equal(h.nodes.get('autoMovieRequestServer').textContent, 'replacement state');
        assert.equal(h.reads.length, 1);
    }
});

test('latest Radarr failures retain the existing failure messages', async () => {
    const h = setup(); const { editor } = h.quality();
    editor.loadAutoMovieRadarrServers(); h.reads[0].reject(new Error('offline')); await flush();
    assert.equal(h.nodes.get('autoMovieRequestServer').textContent, 'Failed to load servers');
    editor.loadAutoMovieRadarrServers({ AutoMovieRequestCustomServerId: 1 });
    h.reads[1].resolve(servers); await flush(); h.reads[2].reject(new Error('offline')); await flush();
    assert.equal(h.nodes.get('autoMovieRequestProfile').textContent, 'Failed to load');
    assert.equal(h.nodes.get('autoMovieRequestRootFolder').textContent, 'Failed to load');
});

test('pending profile details cannot overwrite disposed, replaced or programmatically reloaded controls', async () => {
    for (const retire of ['disposed', 'replacement', 'mode']) {
        const h = setup(); const { editor, lifecycle } = h.quality();
        editor.loadAutoMovieRadarrServers({ AutoMovieRequestCustomServerId: 1 });
        h.reads[0].resolve(servers); await flush();
        if (retire === 'disposed') lifecycle.dispose();
        else if (retire === 'replacement') h.add('autoMovieRequestProfile', 'select');
        else h.nodes.get('autoMovieRequestQualityMode').value = 'default';
        h.nodes.get('autoMovieRequestProfile').textContent = 'new profile state';
        h.nodes.get('autoMovieRequestRootFolder').textContent = 'new folder state';
        h.reads[1].resolve(details(11)); await flush();
        assert.equal(h.nodes.get('autoMovieRequestProfile').textContent, 'new profile state');
        assert.equal(h.nodes.get('autoMovieRequestRootFolder').textContent, 'new folder state');
    }
});
