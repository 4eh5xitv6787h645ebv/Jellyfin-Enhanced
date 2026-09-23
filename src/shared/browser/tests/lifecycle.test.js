'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('feature lifecycle teardown releases resources, isolates failures, and remains reusable across navigation', () => {
    const navigations = new Set();
    const disposed = [];
    const JE = { core: { navigation: { onNavigate: callback => { navigations.add(callback); return () => navigations.delete(callback); } } } };
    const context = vm.createContext({ window: { JellyfinEnhanced: JE }, console: { log() {}, warn() {}, error() {} }, clearInterval: id => disposed.push(`interval:${id}`), clearTimeout: id => disposed.push(`timeout:${id}`) });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../lifecycle.js'), 'utf8'), context);
    const lifecycle = JE.core.lifecycle;
    const handle = lifecycle.register('example');
    assert.equal(lifecycle.register('example'), handle);
    const stop = handle.teardownOn('navigate');
    handle.track({ disconnect: () => disposed.push('observer') });
    handle.track({ abort: () => disposed.push('request') });
    handle.track({ intervalId: 10 });
    handle.track({ timeoutId: 20 });
    handle.track(() => { throw new Error('cleanup failed'); });
    handle.track(() => disposed.push('cleanup'));
    handle.onTeardown(() => disposed.push('persistent-hook'));
    navigations.forEach(fn => fn());
    assert.deepEqual(disposed, ['observer', 'request', 'interval:10', 'timeout:20', 'cleanup', 'persistent-hook']);
    handle.track(() => disposed.push('new-page'));
    navigations.forEach(fn => fn());
    assert.deepEqual(disposed.slice(6), ['new-page', 'persistent-hook']);
    stop();
    assert.equal(navigations.size, 0);
});

test('session identity transitions clear state before publishing and invalidate pending work', () => {
    const events = [];
    const listeners = new Map();
    let currentUser = 'admin';
    const ApiClient = {
        getCurrentUserId: () => currentUser,
        serverId: () => 'server-one',
        setAuthenticationInfo(token, userId) { currentUser = userId; }
    };
    const JE = { core: { navigation: { onNavigate: callback => listeners.set('navigate', callback) } } };
    const document = { dispatchEvent: event => events.push(`event:${event.type}:${event.detail.userId}`), addEventListener() {} };
    const context = vm.createContext({ window: { JellyfinEnhanced: JE, ApiClient }, ApiClient, document, console: { log() {}, warn() {}, error() {} }, setInterval: () => 1, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../session.js'), 'utf8'), context);
    const initialEpoch = JE.session.getEpoch();
    JE.session.onUserChange('fixture', ({ userId }) => events.push(`reset:${userId}`));
    ApiClient.setAuthenticationInfo('new-token', 'viewer');
    // The wrapper reads the host identity after its synchronous setter returns.
    assert.deepEqual(events, ['reset:viewer', 'event:je:user-changed:viewer']);
    assert.equal(JE.session.isCurrent(initialEpoch), false);
    assert.equal(JE.session.getUserId(), 'viewer');
    JE.session.checkNow('duplicate-signal');
    assert.equal(events.length, 2);
});
