const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const flush = () => new Promise(setImmediate);
function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}
function harness() {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, { style: {}, textContent: '', handlers: {} });
        return elements.get(id);
    };
    const requests = [], images = [], timers = [];
    let url = 0;
    const lifecycle = {
        disposed: false,
        listen(target, type, callback) { target.handlers[type] = callback; },
        setTimeout(callback) { timers.push(callback); },
        dispose() { this.disposed = true; },
    };
    const context = vm.createContext({
        document: { getElementById: element }, lifecycle, console,
        ApiClient: { getUrl: (route) => route, accessToken: () => 'token' },
        fetch(route, options) {
            const pending = deferred(); requests.push({ route, options, ...pending }); return pending.promise;
        },
        URL: { createObjectURL: () => 'blob:' + ++url, revokeObjectURL() {} },
        FormData: class { append() {} }, File: class {},
        Image: class { constructor() { images.push(this); } },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../settings/branding.js'), 'utf8'), context);
    const module = vm.runInContext('createAppearanceBranding({ lifecycle })', context);
    module.initialize();
    const upload = () => element('iconTransparentInput').handlers.change({ target: { files: [{ type: 'image/png', size: 1 }] } });
    const remove = () => element('iconTransparentDelete').handlers.click({ preventDefault() {}, stopPropagation() {} });
    return { module, element, requests, images, timers, upload, remove };
}
test('a late initial preview cannot replace an upload preview or status', async () => {
    const h = harness();
    h.upload();
    const preview = h.element('iconTransparentPreview');
    const uploadedSource = preview.src;
    h.requests[0].resolve({ ok: false });
    await flush();
    assert.equal(preview.src, uploadedSource);
    assert.equal(preview.style.display, 'block');
    assert.equal(h.element('iconTransparentStatus').textContent, 'Uploading...');
});
test('disposed upload keeps its POST but cannot refresh or alter the new page', async () => {
    const h = harness();
    h.upload();
    const post = h.requests.at(-1);
    assert.equal(post.options.method, 'POST');
    h.module.dispose();
    h.element('iconTransparentStatus').textContent = 'New page';
    post.resolve({ ok: true });
    h.requests[0].resolve({ ok: false });
    await flush();
    assert.equal(h.element('iconTransparentStatus').textContent, 'New page');
    assert.equal(h.requests.length, 6);
});
test('a late upload error cannot replace the status of a newer delete', async () => {
    const h = harness();
    h.upload();
    const upload = h.requests.at(-1);
    const error = deferred();
    upload.resolve({ ok: false, text: () => error.promise });
    await flush();
    h.remove();
    error.resolve('Old upload failed');
    await flush();
    assert.equal(h.element('iconTransparentStatus').textContent, 'Deleting...');
    assert.equal(h.requests.at(-1).options.method, 'POST');
});
test('image dimensions callbacks cannot overwrite a newer action or disposed page', async () => {
    const h = harness();
    h.upload();
    h.element('iconTransparentPreview').onload();
    const image = h.images[0];
    image.width = 123; image.height = 456;
    h.remove();
    h.element('iconTransparentDimensions').textContent = 'Current dimensions';
    image.onload();
    assert.equal(h.element('iconTransparentDimensions').textContent, 'Current dimensions');
    h.module.dispose();
    image.onload();
    assert.equal(h.element('iconTransparentDimensions').textContent, 'Current dimensions');
});
test('disposed blob reads do not install a preview', async () => {
    const h = harness();
    const blob = deferred();
    h.requests[0].resolve({ ok: true, blob: () => blob.promise });
    await flush();
    h.module.dispose();
    h.element('iconTransparentPreview').src = 'new-page.png';
    blob.resolve({});
    await flush();
    assert.equal(h.element('iconTransparentPreview').src, 'new-page.png');
});
test('successful uploads refresh their preview, but their status timer cannot clear a newer action', async () => {
    const h = harness();
    h.upload();
    h.requests.at(-1).resolve({ ok: true });
    await flush();
    assert.equal(h.requests.at(-1).route, '/JellyfinEnhanced/BrandingImage');
    h.requests.at(-1).resolve({ ok: true, blob: async () => ({}) });
    await flush();
    const preview = h.element('iconTransparentPreview');
    preview.naturalWidth = 80; preview.naturalHeight = 40;
    preview.onload();
    assert.equal(h.element('iconTransparentDimensions').textContent, '80 × 40px');
    assert.equal(h.element('iconTransparentStatus').textContent, '✓ Uploaded');
    assert.equal(h.timers.length, 1);
    h.remove();
    h.timers[0]();
    assert.equal(h.element('iconTransparentStatus').textContent, 'Deleting...');
});
