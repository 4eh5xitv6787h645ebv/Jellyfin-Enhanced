import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createContext, runInContext } from 'node:vm';

import { composeConfiguration } from '../../../tools/build/build-configuration.mjs';

const root = new URL('../../../', import.meta.url);
const features = [
    'user-settings',
    'maintenance',
    'appearance',
    'streaming-availability',
    'playback',
    'navigation',
    'item-details',
    'hidden-content',
    'tags',
    'reviews',
    'ratings',
    'seerr',
    'bookmarks',
    'arr',
    'calendar',
    'activity',
    'active-streams',
    'analytics',
    'downloads',
    'spoiler-guard',
];
const featureSources = await Promise.all(
    features.map((feature) => readFile(new URL('src/features/' + feature + '/settings/settings.js', root), 'utf8')),
);
const pascal = (value) =>
    value
        .split('-')
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join('');
const coordinatorSource = await readFile(new URL('src/host/dashboard/settings-coordinator.js', root), 'utf8');
const baseline = JSON.parse(await readFile(new URL('./baseline-contract.json', import.meta.url)));
const { 'configPage.html': markup } = await composeConfiguration();
const markupIds = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));

// Deliberately narrow form adapter: unexpected selectors fail instead of silently
// manufacturing controls. Integrations are stubbed at the page's feature boundary.
function formHarness(saved = {}) {
    const elements = new Map();
    function element(id) {
        assert.ok(markupIds.has(id), `Missing form element: ${id}`);
        if (!elements.has(id)) {
            elements.set(id, {
                id,
                value: '',
                checked: false,
                style: {},
                dataset: {},
                handlers: {},
                classList: {
                    add() {},
                    remove() {},
                    toggle() {},
                    contains() {
                        return false;
                    },
                },
                addEventListener(event, callback) {
                    this.handlers[event] = callback;
                },
                closest() {
                    return this;
                },
                querySelectorAll() {
                    return [];
                },
                querySelector() {
                    return null;
                },
                children: [],
                appendChild(child) {
                    this.children.push(child);
                    return child;
                },
                setAttribute(name, value) {
                    this[name] = value;
                },
                removeEventListener(event, callback) {
                    if (this.handlers[event] === callback) delete this.handlers[event];
                },
            });
        }
        return elements.get(id);
    }
    baseline.controls.forEach(element);
    const alerts = [];
    let loading;
    const context = createContext({
        Date,
        URL,
        console: { warn() {}, error() {} },
        pluginId: 'test-plugin',
        _qualityCatRenderOK: false,
        defaultShortcuts: [{ Name: 'Search', Key: '/' }],
        shortcutOverrides: [],
        CUSTOM_TAB_MANAGED_ENTRIES: [{ ownedKey: 'BookmarksCustomTabOwned' }],
        _jeCustomTabOwnedCache: { BookmarksCustomTabOwned: true },
        document: {
            getElementById: element,
            createElement() {
                return {
                    style: {},
                    dataset: {},
                    appendChild() {},
                    setAttribute() {},
                    addEventListener() {},
                    removeEventListener() {},
                };
            },
            querySelector(selector) {
                if (selector === 'input[name="maintenanceModeUsers"]:checked')
                    return { value: element('mmUsers_select').checked ? 'select' : 'all' };
                assert.match(selector, /^#[\w-]+$/);
                return element(selector.slice(1));
            },
            querySelectorAll() {
                return [];
            },
        },
        fetch: async () => ({ ok: true, json: async () => ({ results: [], regions: [] }) }),
        jeCdnUrl: (path) => path,
        window: {},
        ApiClient: {
            getUrl: (path) => path,
            ajax: async () => ({}),
            getUsers: async () => [],
            getPluginConfiguration: async () => structuredClone(saved),
        },
        Dashboard: {
            alert: (message) => alerts.push(message),
            showLoadingMsg() {},
            hideLoadingMsg() {
                loading?.();
            },
        },
        saveArrInstances: () => [],
        syncBlockedUsersToHiddenInput() {},
        setTimeout() {},
        clearTimeout() {},
        checkInstalledPlugins() {},
        renderOverrides() {},
        populateAddShortcutDropdown() {},
        loadMaintenanceUsers() {},
        populateRegionSelect() {},
        loadBlockedUsersList() {},
        loadArrInstances() {},
        updateAllDependencies() {},
        updateRequestsRequirementsBanner() {},
        jeMarkSaved() {},
        syncAllBannerParents() {},
    });
    const lifecycle = {
        disposed: false,
        listen(target, event, callback) {
            target.addEventListener(event, callback);
        },
        setTimeout() {},
        clearTimeout() {},
        dispose() {},
    };
    const deps = {
        lifecycle,
        pluginId: 'test-plugin',
        getPluginStatus: () => ({}),
        readFieldValue: () => '',
        loadAutoMovieRadarrServers() {},
        hasTmdbKey: () => false,
        checklistRowState: () => ({}),
        loadBlockedUsersList() {},
        syncBlockedUsersToHiddenInput() {},
        loadArrInstances() {},
        saveArrInstances: () => [],
        _jeNormalizeArrUrl: (value) => value,
        anyArrConfigured: () => false,
        seerrConfigured: () => false,
        refreshQualityCatAdminArrows() {},
        formatDateTimeDMY: () => '',
    };
    featureSources.forEach((source, i) => runInContext(source, context, { filename: features[i] + '/settings.js' }));
    const modules = features.map((feature) => context['create' + pascal(feature) + 'Settings'](deps));
    runInContext(coordinatorSource, context);
    const coordinator = context.createDashboardSettingsCoordinator(modules);
    const itemDetails = modules[features.indexOf('item-details')];
    context.featureModules = Object.fromEntries(features.map((feature, index) => [feature, modules[index]]));
    return {
        context,
        element,
        alerts,
        async read() {
            const config = structuredClone(saved);
            coordinator.readFeatureSettings(config);
            itemDetails.normalizeReadSettings(config);
            return config;
        },
        async load() {
            const config = structuredClone(saved);
            coordinator.loadFeatureSettings(config);
            itemDetails.normalizeLoadedSettings(config);
        },
    };
}

test('saving preserves unknown server settings, disabled shortcut overrides and managed-tab ownership', async () => {
    const form = formHarness({
        FutureSetting: { enabled: true },
        QualityResolutionOrder: 6,
        Shortcuts: [{ Name: 'OpenSearch', Key: '' }],
        BookmarksCustomTabOwned: true,
    });
    form.context.featureModules['user-settings'].load({ Shortcuts: [{ Name: 'OpenSearch', Key: '' }] });
    const config = await form.read();
    assert.deepEqual(config.FutureSetting, { enabled: true });
    assert.equal(config.Shortcuts[0].Key, '');
    assert.equal(config.BookmarksCustomTabOwned, true);
    assert.equal(config.QualityResolutionOrder, 6, 'failed quality render must not overwrite saved ordering');
});

test('saving normalizes Seerr credentials, clamps numeric limits and strips markup delimiters', async () => {
    const form = formHarness();
    form.element('jellyseerrUrls').value = ' https://seerr.test \ninvalid.local\nftp://wrong.test\nhttp://second.test';
    form.element('JellyseerrApiKey').value = ' a b\nc ';
    form.element('autoMovieRequestMinutesWatched').value = '300';
    form.element('downloadsPollIntervalSeconds').value = '3';
    form.element('analyticsReportIntervalDays').value = '100';
    form.element('spoilerBlurIntensity').value = '300';
    form.element('spoilerOverviewPlaceholder').value = '<b>Hidden</b>"\'`';
    const config = await form.read();
    assert.equal(config.JellyseerrUrls, 'https://seerr.test\nhttp://second.test');
    assert.equal(config.JellyseerrApiKey, 'abc');
    assert.equal(config.AutoMovieRequestMinutesWatched, 180);
    assert.equal(config.DownloadsPollIntervalSeconds, 30);
    assert.equal(config.AnalyticsReportIntervalDays, 30);
    assert.equal(config.SpoilerBlurIntensity, 100);
    assert.equal(config.SpoilerOverviewPlaceholder, 'bHidden/b');
    assert.equal(form.alerts.length, 1);
});

test('form dependencies retain their save-time overrides and maintenance action combinations', async () => {
    const form = formHarness();
    form.element('metadataIconsEnabled').checked = true;
    form.element('showLetterboxdLinkAsText').checked = true;
    form.element('showArrLinksAsText').checked = true;
    form.element('mmAction_accounts').checked = true;
    form.element('mmAction_remote').checked = true;
    const config = await form.read();
    assert.equal(config.ShowLetterboxdLinkAsText, false);
    assert.equal(config.ShowArrLinksAsText, false);
    assert.equal(config.EnableTagsLocalStorageFallback, true);
    assert.equal(config.MaintenanceModeAction, 'both');
    assert.equal(config.MaintenanceModeAffectedUsers, 'all');
});

test('loading restores settings, migration defaults, and bidirectional TMDB field wiring', async () => {
    const form = formHarness({ TMDB_API_KEY: 'saved-key', MaintenanceModeAction: 'both', SpoilerBlurIntensity: 150 });
    await form.load();
    assert.equal(form.element('TMDB_API_KEY').value, 'saved-key');
    assert.equal(form.element('jellyseerr_TMDB_API_KEY').value, 'saved-key');
    assert.equal(form.element('mmAction_accounts').checked, true);
    assert.equal(form.element('mmAction_remote').checked, true);
    assert.equal(form.element('spoilerBlurIntensity').value, 40);
    assert.equal(form.element('spoilerStripOverview').checked, true);
    assert.equal(form.element('hiddenContentAdmin').checked, true);
    const keyField = form.element('TMDB_API_KEY');
    keyField.value = 'edited-key';
    keyField.handlers.input.call(keyField);
    assert.equal(form.element('jellyseerr_TMDB_API_KEY').value, 'edited-key');
});
