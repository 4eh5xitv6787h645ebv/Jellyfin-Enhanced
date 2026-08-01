#!/usr/bin/env node

/**
 * Secret-free acceptance verifier for Jellyfin Enhanced issue #581.
 *
 * This file intentionally uses only Node's built-in APIs. It does not mutate a
 * Jellyfin policy. Run --live while the test user is restricted, remove the
 * restriction through Jellyfin administration, then run --restriction-removed.
 */

'use strict';

const MODES = new Set(['--check', '--live', '--restriction-removed', '--help']);
const args = process.argv.slice(2);
const selectedModes = args.filter((arg) => MODES.has(arg));
const unknownArgs = args.filter((arg) => !MODES.has(arg));

const totals = { pass: 0, fail: 0, skip: 0 };

function report(kind, label, detail = '') {
    totals[kind] += 1;
    const suffix = detail ? ` — ${detail}` : '';
    console.log(`[${kind.toUpperCase()}] ${label}${suffix}`);
}

function pass(label, detail = '') {
    report('pass', label, detail);
}

function fail(label, detail = '') {
    report('fail', label, detail);
}

function skip(label, detail) {
    report('skip', label, detail);
}

function usage() {
    console.log(`Usage:
  node tools/verify-seerr-parental-controls.mjs --check
  node tools/verify-seerr-parental-controls.mjs --live
  node tools/verify-seerr-parental-controls.mjs --restriction-removed

Required for --live:
  JE581_BASE_URL
  JE581_ADMIN_TOKEN
  JE581_UNRESTRICTED_TOKEN
  JE581_RESTRICTED_TOKEN
  JE581_LIST_PATH
  JE581_BLOCKED_MEDIA_TYPE       movie or tv
  JE581_BLOCKED_TMDB_ID          positive integer
  JE581_ALLOWED_MEDIA_TYPE       movie or tv
  JE581_ALLOWED_TMDB_ID          positive integer

Required for --restriction-removed:
  JE581_BASE_URL
  JE581_RESTRICTION_REMOVED_TOKEN
  JE581_LIST_PATH
  JE581_BLOCKED_MEDIA_TYPE
  JE581_BLOCKED_TMDB_ID

Optional:
  JE581_LIST_MEDIA_TYPE          movie or tv hint for type-less collection rows
  JE581_TIMEOUT_MS               1000..120000; default 30000
  JE581_CHECK_TMDB               1 enables TMDB proxy checks
  JE581_CHECK_BLOCKED_REQUEST     1 requests the blocked-POST check
  JE581_ALLOW_MUTATION           1 acknowledges a broken server may forward it
  JE581_REQUEST_PATH             defaults to /JellyfinEnhanced/jellyseerr/request
  JE581_REQUEST_BODY_JSON        defaults to blocked mediaType/mediaId JSON
  JE581_SEERR_BASE_URL           enables before/after upstream mutation proof
  JE581_SEERR_API_KEY            required with JE581_SEERR_BASE_URL

--check never sends a network request and never prints token values.`);
}

function parseFlag(name) {
    const value = process.env[name];
    if (value === undefined || value === '') return false;
    if (value === '1' || value.toLowerCase() === 'true') return true;
    if (value === '0' || value.toLowerCase() === 'false') return false;
    throw new Error(`${name} must be 1, 0, true, or false.`);
}

function requireValue(name, required, missing) {
    const value = process.env[name]?.trim();
    if (!value && required) missing.push(name);
    return value || null;
}

function validateToken(name, value) {
    if (value === null) return;
    if (value.includes('\r') || value.includes('\n') || value.includes('"')) {
        throw new Error(`${name} contains a character that is not valid in a Jellyfin token.`);
    }
}

function parseMediaType(name, value, required) {
    if (value === null) {
        if (required) throw new Error(`${name} is required.`);
        return null;
    }

    const normalized = value.toLowerCase();
    if (normalized !== 'movie' && normalized !== 'tv') {
        throw new Error(`${name} must be movie or tv.`);
    }
    return normalized;
}

function parsePositiveInteger(name, value, required) {
    if (value === null) {
        if (required) throw new Error(`${name} is required.`);
        return null;
    }

    if (!/^[1-9]\d*$/.test(value)) {
        throw new Error(`${name} must be a positive integer.`);
    }

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) {
        throw new Error(`${name} is outside JavaScript's safe integer range.`);
    }
    return parsed;
}

function validatePluginPath(name, value, required) {
    if (value === null) {
        if (required) throw new Error(`${name} is required.`);
        return null;
    }

    if (!value.startsWith('/JellyfinEnhanced/') || value.startsWith('//')) {
        throw new Error(`${name} must be a relative /JellyfinEnhanced/... path.`);
    }

    if (value.includes('#') || value.includes('\\') || value.includes('\r') || value.includes('\n')) {
        throw new Error(`${name} contains a fragment, backslash, or line break.`);
    }

    try {
        decodeURI(value);
    } catch {
        throw new Error(`${name} is not a valid relative URL path.`);
    }
    return value;
}

function parseBaseUrl(value, required) {
    if (value === null) {
        if (required) throw new Error('JE581_BASE_URL is required.');
        return null;
    }

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('JE581_BASE_URL must be an absolute HTTP or HTTPS URL.');
    }

    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        || parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash) {
        throw new Error('JE581_BASE_URL must be an HTTP(S) origin/path without credentials, query, or fragment.');
    }

    return parsed.href.replace(/\/+$/, '');
}

function parseSeerrBaseUrl(value) {
    if (value === null) return null;

    let parsed;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error('JE581_SEERR_BASE_URL must be an absolute HTTP or HTTPS URL.');
    }

    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
        || parsed.username
        || parsed.password
        || parsed.search
        || parsed.hash) {
        throw new Error('JE581_SEERR_BASE_URL must be an HTTP(S) origin/path without credentials, query, or fragment.');
    }

    return parsed.href.replace(/\/+$/, '');
}

function parseTimeout(value) {
    if (value === null) return 30000;
    if (!/^\d+$/.test(value)) throw new Error('JE581_TIMEOUT_MS must be an integer.');
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 120000) {
        throw new Error('JE581_TIMEOUT_MS must be between 1000 and 120000.');
    }
    return parsed;
}

function readConfiguration(mode, strict) {
    const missing = [];
    const live = mode === '--live';
    const removed = mode === '--restriction-removed';
    const networkMode = live || removed;

    const baseUrlValue = requireValue('JE581_BASE_URL', strict && networkMode, missing);
    const listPathValue = requireValue('JE581_LIST_PATH', strict && networkMode, missing);
    const blockedTypeValue = requireValue('JE581_BLOCKED_MEDIA_TYPE', strict && networkMode, missing);
    const blockedIdValue = requireValue('JE581_BLOCKED_TMDB_ID', strict && networkMode, missing);
    const allowedTypeValue = requireValue('JE581_ALLOWED_MEDIA_TYPE', strict && live, missing);
    const allowedIdValue = requireValue('JE581_ALLOWED_TMDB_ID', strict && live, missing);
    const adminToken = requireValue('JE581_ADMIN_TOKEN', strict && live, missing);
    const unrestrictedToken = requireValue('JE581_UNRESTRICTED_TOKEN', strict && live, missing);
    const restrictedToken = requireValue('JE581_RESTRICTED_TOKEN', strict && live, missing);
    const removedToken = requireValue('JE581_RESTRICTION_REMOVED_TOKEN', strict && removed, missing);

    if (strict && missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    for (const [name, token] of [
        ['JE581_ADMIN_TOKEN', adminToken],
        ['JE581_UNRESTRICTED_TOKEN', unrestrictedToken],
        ['JE581_RESTRICTED_TOKEN', restrictedToken],
        ['JE581_RESTRICTION_REMOVED_TOKEN', removedToken]
    ]) {
        validateToken(name, token);
    }

    const checkTmdb = parseFlag('JE581_CHECK_TMDB');
    const checkBlockedRequest = parseFlag('JE581_CHECK_BLOCKED_REQUEST');
    const allowMutation = parseFlag('JE581_ALLOW_MUTATION');
    const listMediaTypeValue = requireValue('JE581_LIST_MEDIA_TYPE', false, missing);
    const timeoutValue = requireValue('JE581_TIMEOUT_MS', false, missing);
    const requestPathValue = requireValue('JE581_REQUEST_PATH', false, missing)
        || '/JellyfinEnhanced/jellyseerr/request';
    const requestBodyValue = requireValue('JE581_REQUEST_BODY_JSON', false, missing);
    const seerrBaseUrlValue = requireValue('JE581_SEERR_BASE_URL', false, missing);
    const seerrApiKey = requireValue('JE581_SEERR_API_KEY', false, missing);
    if ((seerrBaseUrlValue === null) !== (seerrApiKey === null)) {
        throw new Error('JE581_SEERR_BASE_URL and JE581_SEERR_API_KEY must be supplied together.');
    }
    validateToken('JE581_SEERR_API_KEY', seerrApiKey);

    let requestBody = null;
    if (requestBodyValue !== null) {
        try {
            requestBody = JSON.parse(requestBodyValue);
        } catch {
            throw new Error('JE581_REQUEST_BODY_JSON must contain valid JSON.');
        }
        if (requestBody === null || Array.isArray(requestBody) || typeof requestBody !== 'object') {
            throw new Error('JE581_REQUEST_BODY_JSON must be a JSON object.');
        }
    }

    return {
        missing,
        baseUrl: parseBaseUrl(baseUrlValue, strict && networkMode),
        listPath: validatePluginPath('JE581_LIST_PATH', listPathValue, strict && networkMode),
        listMediaType: parseMediaType('JE581_LIST_MEDIA_TYPE', listMediaTypeValue, false),
        blockedType: parseMediaType('JE581_BLOCKED_MEDIA_TYPE', blockedTypeValue, strict && networkMode),
        blockedId: parsePositiveInteger('JE581_BLOCKED_TMDB_ID', blockedIdValue, strict && networkMode),
        allowedType: parseMediaType('JE581_ALLOWED_MEDIA_TYPE', allowedTypeValue, strict && live),
        allowedId: parsePositiveInteger('JE581_ALLOWED_TMDB_ID', allowedIdValue, strict && live),
        adminToken,
        unrestrictedToken,
        restrictedToken,
        removedToken,
        timeoutMs: parseTimeout(timeoutValue),
        checkTmdb,
        checkBlockedRequest,
        allowMutation,
        requestPath: validatePluginPath('JE581_REQUEST_PATH', requestPathValue, true),
        requestBody,
        seerrBaseUrl: parseSeerrBaseUrl(seerrBaseUrlValue),
        seerrApiKey
    };
}

function authHeaders(token, includeJsonBody) {
    const headers = {
        Accept: 'application/json',
        Authorization: `MediaBrowser Token="${token}"`,
        'X-Emby-Token': token
    };
    if (includeJsonBody) headers['Content-Type'] = 'application/json';
    return headers;
}

async function requestApi(config, label, token, path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    const method = options.method || 'GET';

    try {
        const response = await fetch(`${config.baseUrl}${path}`, {
            method,
            headers: authHeaders(token, options.body !== undefined),
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            redirect: 'manual',
            signal: controller.signal
        });
        const text = await response.text();
        return { label, method, path, status: response.status, text };
    } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timed out' : 'network request failed';
        fail(`${label}: ${method} ${path}`, reason);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function readSeerrRequestCount(config, label) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
        const response = await fetch(
            `${config.seerrBaseUrl}/api/v1/request?take=1000&skip=0&filter=all`,
            {
                headers: {
                    Accept: 'application/json',
                    'X-Api-Key': config.seerrApiKey
                },
                redirect: 'manual',
                signal: controller.signal
            }
        );
        if (!response.ok) {
            fail(label, `Seerr request snapshot returned HTTP ${response.status}`);
            return null;
        }

        const payload = await response.json();
        if (payload === null || typeof payload !== 'object' || !Array.isArray(payload.results)) {
            fail(label, 'Seerr request snapshot had an unexpected JSON shape');
            return null;
        }

        return payload.results.filter((row) => {
            const media = row?.media;
            return media !== null
                && typeof media === 'object'
                && normalizeMediaType(media.mediaType) === config.blockedType
                && readPositiveId(media.tmdbId) === config.blockedId;
        }).length;
    } catch (error) {
        const reason = error?.name === 'AbortError' ? 'timed out' : 'could not be read';
        fail(label, `Seerr request snapshot ${reason}`);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function isSuccess(response) {
    return response !== null && response.status >= 200 && response.status < 300;
}

function expectStatus(response, expected, label) {
    if (response === null) return false;
    if (response.status === expected) {
        pass(label, `HTTP ${response.status}`);
        return true;
    }
    fail(label, `expected HTTP ${expected}, received HTTP ${response.status}`);
    return false;
}

function expectSuccess(response, label) {
    if (response === null) return false;
    if (isSuccess(response)) {
        pass(label, `HTTP ${response.status}`);
        return true;
    }
    fail(label, `expected 2xx, received HTTP ${response.status}`);
    return false;
}

function parseJsonResponse(response, label) {
    if (response === null || !isSuccess(response)) return null;
    try {
        return JSON.parse(response.text);
    } catch {
        fail(label, 'response was not valid JSON');
        return null;
    }
}

function normalizeMediaType(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    if (normalized === 'movie') return 'movie';
    if (normalized === 'tv' || normalized === 'series') return 'tv';
    return null;
}

function readPositiveId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return value;
    if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
        const parsed = Number(value);
        if (Number.isSafeInteger(parsed)) return parsed;
    }
    return null;
}

const TITLE_ARRAY_KEYS = new Set([
    'results',
    'parts',
    'cast',
    'crew',
    'knownFor',
    'known_for',
    'requests',
    'items'
]);

function titleIdentity(row, defaultType) {
    if (row === null || Array.isArray(row) || typeof row !== 'object') return null;

    const hasNestedMedia = row.media !== null
        && !Array.isArray(row.media)
        && typeof row.media === 'object';
    const item = hasNestedMedia ? row.media : row;
    const type = normalizeMediaType(item.mediaType)
        || normalizeMediaType(item.media_type)
        || normalizeMediaType(row.type)
        || defaultType;
    if (type === null) return null;

    // A request row's nested media.id is Seerr's internal ID. Only tmdbId is
    // authoritative there. Flat list rows commonly use id as their TMDB ID.
    const id = readPositiveId(item.tmdbId)
        || readPositiveId(item.tmdb_id)
        || (!hasNestedMedia ? readPositiveId(item.id) : null);
    return id === null ? null : `${type}:${id}`;
}

function collectTitleIdentities(payload, defaultType) {
    const identities = [];
    const seen = new Set();

    function add(identity) {
        if (identity !== null && !seen.has(identity)) {
            seen.add(identity);
            identities.push(identity);
        }
    }

    function visitArray(array, hint) {
        for (const row of array) {
            if (row === null || Array.isArray(row) || typeof row !== 'object') continue;
            add(titleIdentity(row, hint));
            visitObject(row, hint);
        }
    }

    function visitObject(object, hint) {
        for (const [key, value] of Object.entries(object)) {
            if (Array.isArray(value) && TITLE_ARRAY_KEYS.has(key)) {
                const nestedHint = key === 'parts' ? 'movie' : hint;
                visitArray(value, nestedHint);
            }
        }
    }

    if (Array.isArray(payload)) {
        visitArray(payload, defaultType);
    } else if (payload !== null && typeof payload === 'object') {
        add(titleIdentity(payload, defaultType));
        visitObject(payload, defaultType);
    }
    return identities;
}

function sameSequence(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isOrderedSubset(subset, full) {
    let cursor = 0;
    for (const value of full) {
        if (cursor < subset.length && subset[cursor] === value) cursor += 1;
    }
    return cursor === subset.length;
}

function assertCondition(condition, label, detail = '') {
    if (condition) pass(label, detail);
    else fail(label, detail);
}

function jsonKind(value) {
    if (Array.isArray(value)) return 'array';
    if (value === null) return 'null';
    return typeof value;
}

function verifyPaginationShape(adminJson, restrictedJson, rowsWereRemoved) {
    assertCondition(
        jsonKind(adminJson) === jsonKind(restrictedJson),
        'restricted list preserves the top-level JSON kind',
        `${jsonKind(restrictedJson)} versus admin ${jsonKind(adminJson)}`
    );

    if (adminJson === null || restrictedJson === null
        || Array.isArray(adminJson) || Array.isArray(restrictedJson)
        || typeof adminJson !== 'object' || typeof restrictedJson !== 'object') return;

    for (const key of ['page', 'totalPages', 'totalResults', 'pageInfo']) {
        if (!Object.hasOwn(adminJson, key)) continue;
        assertCondition(
            Object.hasOwn(restrictedJson, key) && jsonKind(adminJson[key]) === jsonKind(restrictedJson[key]),
            `restricted list preserves pagination field ${key}`
        );
    }

    if (typeof adminJson.page === 'number' && typeof restrictedJson.page === 'number') {
        assertCondition(restrictedJson.page === adminJson.page, 'restricted list preserves the current page');
    }
    if (typeof adminJson.totalResults === 'number' && typeof restrictedJson.totalResults === 'number') {
        assertCondition(
            restrictedJson.totalResults === adminJson.totalResults,
            'restricted totalResults preserves the upstream upper bound'
        );
    }
    if (adminJson.pageInfo && restrictedJson.pageInfo
        && typeof adminJson.pageInfo === 'object' && typeof restrictedJson.pageInfo === 'object'
        && typeof adminJson.pageInfo.results === 'number'
        && typeof restrictedJson.pageInfo.results === 'number') {
        assertCondition(
            restrictedJson.pageInfo.results === adminJson.pageInfo.results,
            'restricted pageInfo.results preserves the upstream upper bound'
        );
    }

    if (rowsWereRemoved) {
        assertCondition(
            Object.hasOwn(restrictedJson, 'jellyfinEnhancedPagination'),
            'filtered list carries the jellyfinEnhancedPagination upper-bound marker'
        );
    }
}

function seerrDetailPath(mediaType, tmdbId) {
    return `/JellyfinEnhanced/jellyseerr/${mediaType}/${tmdbId}`;
}

function tmdbDetailPath(mediaType, tmdbId) {
    return `/JellyfinEnhanced/tmdb/${mediaType}/${tmdbId}`;
}

async function fetchAndParseList(config, label, token) {
    const response = await requestApi(config, label, token, config.listPath);
    if (!expectSuccess(response, `${label} list is available`)) return null;
    return parseJsonResponse(response, `${label} list JSON`);
}

async function verifyCurrentRestrictions(config) {
    const [adminJson, unrestrictedJson, restrictedJson] = await Promise.all([
        fetchAndParseList(config, 'administrator', config.adminToken),
        fetchAndParseList(config, 'unrestricted user', config.unrestrictedToken),
        fetchAndParseList(config, 'restricted user', config.restrictedToken)
    ]);

    const blockedKey = `${config.blockedType}:${config.blockedId}`;
    const allowedKey = `${config.allowedType}:${config.allowedId}`;

    if (adminJson !== null && unrestrictedJson !== null && restrictedJson !== null) {
        const adminIds = collectTitleIdentities(adminJson, config.listMediaType);
        const unrestrictedIds = collectTitleIdentities(unrestrictedJson, config.listMediaType);
        const restrictedIds = collectTitleIdentities(restrictedJson, config.listMediaType);

        assertCondition(adminIds.length > 0, 'administrator list exposes identifiable movie/TV rows');
        assertCondition(adminIds.includes(blockedKey), 'administrator list contains the blocked test title');
        assertCondition(adminIds.includes(allowedKey), 'administrator list contains the allowed test title');
        assertCondition(
            sameSequence(unrestrictedIds, adminIds),
            'unrestricted title IDs equal the administrator title IDs',
            `${unrestrictedIds.length} versus ${adminIds.length} titles`
        );
        assertCondition(
            isOrderedSubset(restrictedIds, adminIds),
            'restricted title IDs are an ordered subset of administrator title IDs',
            `${restrictedIds.length} of ${adminIds.length} titles`
        );
        assertCondition(!restrictedIds.includes(blockedKey), 'restricted list omits the blocked test title');
        assertCondition(restrictedIds.includes(allowedKey), 'restricted list retains the allowed test title');
        verifyPaginationShape(
            adminJson,
            restrictedJson,
            restrictedIds.length < adminIds.length
        );
    }

    const blockedDetailPath = seerrDetailPath(config.blockedType, config.blockedId);
    const [adminDetail, unrestrictedDetail, restrictedDetail] = await Promise.all([
        requestApi(config, 'administrator blocked-title detail', config.adminToken, blockedDetailPath),
        requestApi(config, 'unrestricted blocked-title detail', config.unrestrictedToken, blockedDetailPath),
        requestApi(config, 'restricted blocked-title detail', config.restrictedToken, blockedDetailPath)
    ]);
    expectSuccess(adminDetail, 'administrator can open the blocked test title in Seerr');
    expectSuccess(unrestrictedDetail, 'unrestricted user can open the blocked test title in Seerr');
    expectStatus(restrictedDetail, 403, 'restricted user receives 403 for blocked Seerr detail');

    const allowedDetail = await requestApi(
        config,
        'restricted allowed-title detail',
        config.restrictedToken,
        seerrDetailPath(config.allowedType, config.allowedId)
    );
    expectSuccess(allowedDetail, 'restricted user can open the allowed Seerr title');

    if (config.checkTmdb) {
        const blockedTmdbPath = tmdbDetailPath(config.blockedType, config.blockedId);
        const [adminTmdb, unrestrictedTmdb, restrictedTmdb] = await Promise.all([
            requestApi(config, 'administrator blocked-title TMDB detail', config.adminToken, blockedTmdbPath),
            requestApi(config, 'unrestricted blocked-title TMDB detail', config.unrestrictedToken, blockedTmdbPath),
            requestApi(config, 'restricted blocked-title TMDB detail', config.restrictedToken, blockedTmdbPath)
        ]);
        expectSuccess(adminTmdb, 'administrator can open the blocked test title through TMDB');
        expectSuccess(unrestrictedTmdb, 'unrestricted user can open the blocked test title through TMDB');
        expectStatus(restrictedTmdb, 403, 'restricted user receives 403 for blocked TMDB detail');

        const allowedTmdb = await requestApi(
            config,
            'restricted allowed-title TMDB detail',
            config.restrictedToken,
            tmdbDetailPath(config.allowedType, config.allowedId)
        );
        expectSuccess(allowedTmdb, 'restricted user can open the allowed TMDB title');
    } else {
        skip('TMDB proxy assertions', 'set JE581_CHECK_TMDB=1 when the test server has TMDB configured');
    }

    if (!config.checkBlockedRequest) {
        skip(
            'blocked Seerr request POST',
            'set JE581_CHECK_BLOCKED_REQUEST=1 and JE581_ALLOW_MUTATION=1 to acknowledge mutation risk'
        );
    } else if (!config.allowMutation) {
        skip(
            'blocked Seerr request POST',
            'JE581_CHECK_BLOCKED_REQUEST is set, but JE581_ALLOW_MUTATION=1 is also required'
        );
    } else {
        const body = config.requestBody || {
            mediaType: config.blockedType,
            mediaId: config.blockedId
        };
        const canProveOrdering = config.seerrBaseUrl !== null && config.seerrApiKey !== null;
        const beforeCount = canProveOrdering
            ? await readSeerrRequestCount(config, 'pre-mutation Seerr request snapshot')
            : null;
        const requestResponse = await requestApi(
            config,
            'restricted blocked-title request',
            config.restrictedToken,
            config.requestPath,
            { method: 'POST', body }
        );
        const rejected = expectStatus(
            requestResponse,
            403,
            'restricted blocked-title request returns 403'
        );

        if (!canProveOrdering) {
            skip(
                'blocked request is rejected before Seerr mutation',
                'set JE581_SEERR_BASE_URL and JE581_SEERR_API_KEY to compare upstream state'
            );
        } else if (beforeCount !== null && beforeCount > 0) {
            skip(
                'blocked request is rejected before Seerr mutation',
                'the blocked title already has a Seerr request, so ordering is not observable'
            );
        } else if (beforeCount !== null && rejected) {
            const afterCount = await readSeerrRequestCount(
                config,
                'post-mutation Seerr request snapshot'
            );
            if (afterCount !== null) {
                assertCondition(
                    afterCount === beforeCount,
                    'blocked request is rejected before Seerr mutation',
                    `${beforeCount} matching requests before and ${afterCount} after`
                );
            }
        }
    }

    skip(
        'restriction-removal assertions',
        'remove the policy without restarting, then run --restriction-removed'
    );
}

async function verifyRestrictionRemoved(config) {
    const listJson = await fetchAndParseList(config, 'restriction-removed user', config.removedToken);
    const blockedKey = `${config.blockedType}:${config.blockedId}`;

    if (listJson !== null) {
        const ids = collectTitleIdentities(listJson, config.listMediaType);
        assertCondition(ids.includes(blockedKey), 'previously blocked title returns after policy removal');
    }

    const detail = await requestApi(
        config,
        'restriction-removed Seerr detail',
        config.removedToken,
        seerrDetailPath(config.blockedType, config.blockedId)
    );
    expectSuccess(detail, 'previously blocked Seerr detail succeeds after policy removal');

    if (config.checkTmdb) {
        const tmdb = await requestApi(
            config,
            'restriction-removed TMDB detail',
            config.removedToken,
            tmdbDetailPath(config.blockedType, config.blockedId)
        );
        expectSuccess(tmdb, 'previously blocked TMDB detail succeeds after policy removal');
    } else {
        skip('restriction-removed TMDB assertion', 'set JE581_CHECK_TMDB=1 to include it');
    }

    skip('restriction-removed request POST', 'not sent because it would intentionally create a request');
}

function runCheckMode() {
    let config;
    try {
        config = readConfiguration('--check', false);
    } catch (error) {
        fail('environment validation', error.message);
        return;
    }

    pass('verifier loaded', `Node ${process.versions.node}; no network requests sent`);
    const requiredForLive = [
        'JE581_BASE_URL',
        'JE581_ADMIN_TOKEN',
        'JE581_UNRESTRICTED_TOKEN',
        'JE581_RESTRICTED_TOKEN',
        'JE581_LIST_PATH',
        'JE581_BLOCKED_MEDIA_TYPE',
        'JE581_BLOCKED_TMDB_ID',
        'JE581_ALLOWED_MEDIA_TYPE',
        'JE581_ALLOWED_TMDB_ID'
    ];
    const missingForLive = requiredForLive.filter((name) => !process.env[name]?.trim());
    if (missingForLive.length > 0) {
        skip('live environment completeness', `missing: ${missingForLive.join(', ')}`);
    } else {
        pass('supplied environment values are syntactically valid');
    }
    skip('live API assertions', 'run with --live after supplying the required environment');
    skip('restriction-removal assertions', 'run with --restriction-removed after lifting the same user policy');
    if (!config.checkTmdb) skip('TMDB proxy assertions', 'JE581_CHECK_TMDB is not enabled');
    if (!config.checkBlockedRequest || !config.allowMutation) {
        skip('blocked request POST', 'the two explicit mutation-risk opt-ins are not enabled');
    }
}

async function main() {
    if (unknownArgs.length > 0 || selectedModes.length !== 1) {
        usage();
        if (unknownArgs.length > 0) console.error(`Unknown arguments: ${unknownArgs.join(', ')}`);
        process.exitCode = 2;
        return;
    }

    const mode = selectedModes[0];
    if (mode === '--help') {
        usage();
        return;
    }
    if (mode === '--check') {
        runCheckMode();
    } else {
        let config;
        try {
            config = readConfiguration(mode, true);
        } catch (error) {
            fail('environment validation', error.message);
            process.exitCode = 2;
            return;
        }

        if (mode === '--live') await verifyCurrentRestrictions(config);
        else await verifyRestrictionRemoved(config);
    }

    console.log(`\nSummary: ${totals.pass} passed, ${totals.fail} failed, ${totals.skip} skipped.`);
    if (totals.fail > 0) process.exitCode = 1;
}

await main();
