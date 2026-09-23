/** Dashboard custom tabs boundary. */
function createDashboardCustomTabs({
    lifecycle,
    getBookmarksCustomTabManagedEntries,
    getHiddenContentCustomTabManagedEntries,
    getDownloadsCustomTabManagedEntries,
    getCalendarCustomTabManagedEntries,
    getSeerrCustomTabManagedEntries,
    getActivityCustomTabManagedEntries,
    pluginId,
    renderOptionalPluginsDashboard,
}) {
    function restoreCustomTabOwnership(config) {
        CUSTOM_TAB_MANAGED_ENTRIES.forEach(function (entry) {
            _jeCustomTabOwnedCache[entry.ownedKey] = config[entry.ownedKey] === true;
        });
    }

    function applyCustomTabOwnership(config) {
        // Carry the cached "JE owns this Custom Tabs entry" flags through any
        // round-trip; sync may overwrite specific keys after computing actions.
        CUSTOM_TAB_MANAGED_ENTRIES.forEach(function (entry) {
            config[entry.ownedKey] = _jeCustomTabOwnedCache[entry.ownedKey] === true;
        });
    }

    // key -> true when installed but Status !== 'Active'
    // Tri-state compat probe result for Custom Tabs:
    //   null           — not yet probed (or Custom Tabs not installed)
    //   'ok'           — /Plugins/.../Configuration returned the expected shape
    //   'incompatible' — config read but shape doesn't match { Tabs:[{Title,ContentHtml}] }
    //   'probe-failed' — HTTP/JSON/auth error reading the config
    var customTabsCompatState = null;

    // ---------------------------------------------------------------------
    // Custom Tabs auto-management
    //
    // The Custom Tabs plugin (https://github.com/IAmParadox27/jellyfin-plugin-custom-tabs)
    // stores its tab list at /Plugins/{guid}/Configuration as
    // `{ "Tabs": [{ "Title": "...", "ContentHtml": "..." }, ...] }`.
    // We can manage individual entries on the user's behalf, but only when
    // the schema we observe matches that shape exactly. If the schema has
    // changed in a future release, every code path here bails out silently
    // and the related UI ("Add the Custom Tabs entry for me" toggles) stays
    // hidden — the user falls back to manual setup with no error noise.
    // ---------------------------------------------------------------------
    var CUSTOM_TABS_PLUGIN_ID = 'fbacd0b6fd464a05b0a42045d6a135b0';

    // Per managed Custom Tabs entry: which JE config flags drive it
    // (parent + auto-create), what Title to write, and the exact
    // ContentHtml snippet that JE's matching front-end module looks for.
    // ContentHtml strings are the SOURCE OF TRUTH for "this tab is ours" —
    // the sync logic identifies our entries by exact-string match.
    // `masterKey` is the top-level feature toggle (Enable Bookmarks / Enable
    // Hidden Content / Enable Requests Page / Enable Calendar Page). Sync
    // requires ALL THREE — masterKey, parentKey, autoKey — to be true for
    // the entry to exist. Without masterKey in the predicate, disabling the
    // master feature would leave an orphan Custom Tabs entry that opens to
    // broken/empty content (the JE module behind it is off).
    var CUSTOM_TAB_MANAGED_ENTRIES = [
        getBookmarksCustomTabManagedEntries()[0],
        getHiddenContentCustomTabManagedEntries()[0],
        getDownloadsCustomTabManagedEntries()[0],
        getCalendarCustomTabManagedEntries()[0],
        getSeerrCustomTabManagedEntries()[0],
        getActivityCustomTabManagedEntries()[0],
    ];

    function isCustomTabsConfigShapeOk(cfg) {
        if (!cfg || typeof cfg !== 'object') {
            console.warn('[JE] Custom Tabs compat: config is not an object:', cfg);
            return false;
        }
        if (!Array.isArray(cfg.Tabs)) {
            console.warn('[JE] Custom Tabs compat: cfg.Tabs is not an array. Keys present:', Object.keys(cfg));
            return false;
        }
        for (var i = 0; i < cfg.Tabs.length; i++) {
            var t = cfg.Tabs[i];
            if (!t || typeof t !== 'object') {
                console.warn('[JE] Custom Tabs compat: tab[' + i + '] is not an object:', t);
                return false;
            }
            if (typeof t.Title !== 'string' || typeof t.ContentHtml !== 'string') {
                console.warn(
                    '[JE] Custom Tabs compat: tab[' + i + '] missing expected fields. Got keys:',
                    Object.keys(t),
                );
                return false;
            }
        }
        return true;
    }

    // Surfaces a single probe-failure banner above the form. Multiple probes
    // (plugin list, Custom Tabs config schema) can fail independently — the
    // banner aggregates them so the admin sees one actionable message instead
    // of nothing. Pass an empty/null msg to clear the banner for that source.
    var _jeProbeWarnings = Object.create(null);

    function setProbeWarning(source, msg) {
        if (lifecycle.disposed) return;
        if (msg) _jeProbeWarnings[source] = msg;
        else delete _jeProbeWarnings[source];
        var banner = document.getElementById('je-probe-warning');
        var msgEl = document.getElementById('je-probe-warning-msg');
        if (!banner || !msgEl) return;
        var keys = Object.keys(_jeProbeWarnings);
        if (keys.length === 0) {
            banner.style.display = 'none';
            msgEl.textContent = '';
        } else {
            msgEl.textContent =
                ': ' +
                keys
                    .map(function (k) {
                        return _jeProbeWarnings[k];
                    })
                    .join(' / ');
            banner.style.display = '';
        }
    }

    let probeGeneration = 0;
    function checkCustomTabsConfigCompat() {
        if (lifecycle.disposed) return;
        const generation = ++probeGeneration;
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/Plugins/' + CUSTOM_TABS_PLUGIN_ID + '/Configuration'),
            dataType: 'json',
        })
            .then(function (cfg) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                var ok = isCustomTabsConfigShapeOk(cfg);
                document.body.classList.toggle('je-has-customtabs-compat', ok);
                customTabsCompatState = ok ? 'ok' : 'incompatible';
                if (!ok) {
                    console.warn('[JE] Custom Tabs config schema not recognized; auto-manage toggles hidden.');
                    setProbeWarning(
                        'customtabs',
                        'Custom Tabs config has an unrecognized shape. Auto-create toggles disabled until Jellyfin Enhanced supports the new schema.',
                    );
                } else {
                    setProbeWarning('customtabs', null);
                }
                try {
                    renderOptionalPluginsDashboard();
                } catch (e) {
                    console.warn(
                        '[JE] renderOptionalPluginsDashboard threw from checkCustomTabsConfigCompat (then):',
                        e,
                    );
                }
            })
            .catch(function (err) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                document.body.classList.remove('je-has-customtabs-compat');
                customTabsCompatState = 'probe-failed';
                console.warn('[JE] Custom Tabs config probe failed; auto-manage toggles hidden:', err);
                setProbeWarning(
                    'customtabs',
                    "Couldn't read Custom Tabs config (check Jellyfin logs). Auto-create toggles disabled until the probe succeeds.",
                );
                try {
                    renderOptionalPluginsDashboard();
                } catch (e) {
                    console.warn(
                        '[JE] renderOptionalPluginsDashboard threw from checkCustomTabsConfigCompat (catch):',
                        e,
                    );
                }
            });
    }

    /**
     * Plan + apply Custom Tabs sync for every managed entry.
     *
     * Returns a promise resolving to `{ ok, status, detail, ownedUpdates }`:
     *  - `ok: true` → sync ran cleanly (or was a clean no-op)
     *  - `ok: false` → something failed; `detail` describes it (admin-visible)
     *  - `status: 'noop' | 'ok' | 'skipped' | 'failed'`
     *  - `ownedUpdates: [{ ownedKey, value }]` — *JE-side* flag updates the caller
     *    must persist alongside the rest of the JE config so future syncs know
     *    which entries we created vs. which the admin added manually.
     *
     * Sync rules per managed entry (uses `ownedKey` to gate destructive deletes):
     *  - shouldExist (auto+parent both on) AND no matching CT entry → ADD; owned=true
     *  - shouldExist AND a matching CT entry exists → leave entry alone; preserve owned
     *  - !shouldExist AND a matching CT entry exists AND we own it → REMOVE; owned=false
     *  - !shouldExist AND a matching CT entry exists but we don't own it → leave it
     *    (it's the admin's manually-created tab); owned stays false
     *  - !shouldExist AND no matching entry → no-op; owned=false
     *
     * The single GET → mutate → single POST sequence avoids the race where
     * multiple per-entry round-trips would clobber each other.
     */
    function syncAllManagedCustomTabs(savedConfig) {
        if (!document.body.classList.contains('je-has-customtabs-compat')) {
            // Bail early. If the admin has auto-create intent stored but we
            // can't act on it (plugin missing / compat probe failed), return
            // ok:false so the save-flow alert gate fires — otherwise the
            // green "Saved!" toast masks the dropped intent.
            // Mirror `shouldExist`: intent requires all three flags —
            // master + parent + auto. A disabled-at-master feature with
            // auto+parent still checked wouldn't have a real sync action
            // anyway, so shouldn't trigger the cosmetic "saved but CT
            // dropped your auto-create" alert.
            var anyIntent = CUSTOM_TAB_MANAGED_ENTRIES.some(function (e) {
                return (
                    savedConfig[e.autoKey] === true &&
                    savedConfig[e.parentKey] === true &&
                    savedConfig[e.masterKey] === true
                );
            });
            return Promise.resolve({
                ok: !anyIntent, // only "skipped cleanly" when there was nothing to do
                status: 'skipped',
                detail: anyIntent
                    ? 'Custom Tabs is not detected (or its config schema is unrecognized). Auto-create was requested but skipped; toggle a Custom Tabs setting to retry the probe.'
                    : 'Custom Tabs not detected; nothing to sync.',
                ownedUpdates: [],
            });
        }
        return ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/Plugins/' + CUSTOM_TABS_PLUGIN_ID + '/Configuration'),
            dataType: 'json',
        })
            .then(function (cfg) {
                if (!isCustomTabsConfigShapeOk(cfg)) {
                    return {
                        ok: false,
                        status: 'failed',
                        detail: 'Custom Tabs configuration shape no longer matches what Jellyfin Enhanced knows how to write; auto-manage skipped to avoid corrupting it.',
                        ownedUpdates: [],
                    };
                }
                var changed = false;
                var ownedUpdates = [];
                CUSTOM_TAB_MANAGED_ENTRIES.forEach(function (entry) {
                    // ALL three gates must be on: the master feature, the
                    // Use-Custom-Tabs child toggle, and the Auto-Create
                    // opt-in. Missing the master-flag check here meant
                    // disabling the top-level feature still left an orphan
                    // CT entry that opened to broken content.
                    var shouldExist =
                        savedConfig[entry.autoKey] === true &&
                        savedConfig[entry.parentKey] === true &&
                        savedConfig[entry.masterKey] === true;
                    var isOwned = savedConfig[entry.ownedKey] === true;
                    var idx = -1;
                    for (var i = 0; i < cfg.Tabs.length; i++) {
                        if (cfg.Tabs[i].ContentHtml === entry.html) {
                            idx = i;
                            break;
                        }
                    }
                    if (shouldExist && idx === -1) {
                        cfg.Tabs.push({ Title: entry.title, ContentHtml: entry.html });
                        changed = true;
                        ownedUpdates.push({ ownedKey: entry.ownedKey, value: true });
                    } else if (shouldExist /* && idx !== -1 */) {
                        // Entry already exists — preserve current owned flag. Do NOT
                        // claim ownership of an existing entry that we didn't add,
                        // so that the admin can manage it manually if they later
                        // turn auto-create off.
                        ownedUpdates.push({ ownedKey: entry.ownedKey, value: isOwned });
                    } else if (!shouldExist && idx !== -1 && isOwned) {
                        // We created this; safe to remove.
                        cfg.Tabs.splice(idx, 1);
                        changed = true;
                        ownedUpdates.push({ ownedKey: entry.ownedKey, value: false });
                    } else {
                        // !shouldExist + (no entry, OR entry but not ours) → leave alone.
                        ownedUpdates.push({ ownedKey: entry.ownedKey, value: false });
                    }
                });
                if (!changed) {
                    return {
                        ok: true,
                        status: 'noop',
                        detail: 'Custom Tabs already in sync.',
                        ownedUpdates: ownedUpdates,
                    };
                }
                return ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl('/Plugins/' + CUSTOM_TABS_PLUGIN_ID + '/Configuration'),
                    contentType: 'application/json',
                    data: JSON.stringify(cfg),
                })
                    .then(function () {
                        return { ok: true, status: 'ok', detail: 'Custom Tabs updated.', ownedUpdates: ownedUpdates };
                    })
                    .catch(function (err) {
                        return {
                            ok: false,
                            status: 'failed',
                            detail: 'Custom Tabs update failed: ' + ((err && err.message) || 'see console'),
                            ownedUpdates: [], // do NOT persist owned flags if the POST didn't land
                        };
                    });
            })
            .catch(function (err) {
                return {
                    ok: false,
                    status: 'failed',
                    detail: 'Could not read Custom Tabs configuration: ' + ((err && err.message) || 'see console'),
                    ownedUpdates: [],
                };
            });
    }

    // ==================== End Multi-Instance Arr Management ====================

    // Cache of the four "JE owns this Custom Tabs entry" booleans from the
    // most recently loaded config. Sync uses these to decide whether a
    // matching CT entry was created by JE (safe to delete) or by the admin
    // (must not touch). saveConfig writes the updated values back as part
    // of its single config write.
    var _jeCustomTabOwnedCache = Object.create(null);

    /**
     * Run sync, then if any owned-flag updates were produced, persist them
     * back to JE config in a second write so future saves see the new state.
     * Returns the (possibly downgraded) sync result so the caller can surface
     * any failure to the admin.
     *
     * Cache discipline: `_jeCustomTabOwnedCache` is mutated ONLY after the
     * server confirms the owned-flag write. On failure we re-read the live
     * config and restore the cache to ground truth — otherwise a partial
     * write would leave the in-memory cache disagreeing with what the next
     * page-load will see, causing JE to silently orphan its own tabs on
     * future cleanup. The downgraded result tells `saveConfig` to surface
     * the partial-success to the admin.
     */
    async function runCustomTabsSync(config) {
        const syncResult = await syncAllManagedCustomTabs(config);
        if (!syncResult || !Array.isArray(syncResult.ownedUpdates) || syncResult.ownedUpdates.length === 0) {
            return syncResult;
        }
        // Detect changes against the cache, but DO NOT mutate the cache yet.
        const pendingUpdates = syncResult.ownedUpdates.filter(function (u) {
            return _jeCustomTabOwnedCache[u.ownedKey] !== u.value;
        });
        if (pendingUpdates.length === 0) {
            return syncResult;
        }
        // Narrow second-write: fetch the latest config from the server first,
        // then apply ONLY the owned-flag delta. This minimizes the race window
        // where an interleaving save (double-click, "Apply to all users", or
        // a concurrent admin in another browser tab) would otherwise be lost
        // if we replayed the form's stale snapshot on top. Any unrelated
        // fields the other save wrote are preserved because we only mutate
        // the `*CustomTabJeOwned` keys on the fresh copy.
        let fresh;
        try {
            fresh = await ApiClient.getPluginConfiguration(pluginId);
        } catch (fetchErr) {
            console.error('[JE] Could not re-fetch config for owned-flag persist:', fetchErr);
            fresh = null;
        }
        const target = fresh || config; // fall back to form state if fetch fails
        pendingUpdates.forEach(function (u) {
            target[u.ownedKey] = u.value;
        });
        try {
            await ApiClient.updatePluginConfiguration(pluginId, target);
            // Server confirmed — commit cache.
            pendingUpdates.forEach(function (u) {
                _jeCustomTabOwnedCache[u.ownedKey] = u.value;
            });
            return syncResult;
        } catch (persistErr) {
            console.error('[JE] Failed to persist Custom Tabs owned-flag updates:', persistErr);
            // Roll cache back to ground truth so the next save's plan
            // computes against the actual server state, not a poisoned cache.
            try {
                const fresh = await ApiClient.getPluginConfiguration(pluginId);
                CUSTOM_TAB_MANAGED_ENTRIES.forEach(function (entry) {
                    _jeCustomTabOwnedCache[entry.ownedKey] = fresh[entry.ownedKey] === true;
                });
            } catch (reloadErr) {
                console.error('[JE] Cache rollback after owned-flag persist failure also failed:', reloadErr);
            }
            // Downgrade the result so saveConfig's check surfaces the partial.
            // The recovery message has to be specific because the trivial "re-save"
            // path does not actually repair the state: post-rollback the cache and
            // server agree on owned=false, the CT entry exists, and the next sync's
            // shouldExist+entry-exists branch will preserve owned=false (no second
            // write fires). Real recovery is to delete the CT entry from the
            // Custom Tabs plugin UI and then re-save here so the next sync ADDs
            // a fresh entry and stamps it owned=true.
            return Object.assign({}, syncResult, {
                ok: false,
                status: 'partial',
                detail:
                    (syncResult.detail ? syncResult.detail + ': ' : '') +
                    'Custom Tabs has the new entry, but Jellyfin Enhanced could not save its ownership record. ' +
                    'JE will not be able to clean this entry up on a later toggle change. ' +
                    'To restore JE management: open the Custom Tabs plugin, delete the JE-managed entry there, then save this page again; JE will recreate it and record ownership properly.',
            });
        }
    }

    function getCustomTabsCompatibility() {
        return customTabsCompatState;
    }

    function resetCustomTabsCompatibility() {
        // A plugin re-probe can supersede a pending compatibility request.
        ++probeGeneration;
        customTabsCompatState = null;
    }

    return {
        restoreCustomTabOwnership,
        applyCustomTabOwnership,
        setProbeWarning,
        checkCustomTabsConfigCompat,
        runCustomTabsSync,
        getCustomTabsCompatibility,
        resetCustomTabsCompatibility,
    };
}
