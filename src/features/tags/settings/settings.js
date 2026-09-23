/** Feature settings and its private editor state. */
function createTagsSettings({ lifecycle, pluginId }) {
    function loadTagsSettings(config) {
        document.querySelector('#qualityTagsEnabled').checked = config.QualityTagsEnabled;
        document.querySelector('#showResolutionTag').checked = config.ShowResolutionTag !== false;
        document.querySelector('#showSourceTag').checked = config.ShowSourceTag !== false;
        document.querySelector('#showDynamicRangeTag').checked = config.ShowDynamicRangeTag !== false;
        document.querySelector('#showSpecialFormatTag').checked = config.ShowSpecialFormatTag !== false;
        document.querySelector('#showVideoCodecTag').checked = config.ShowVideoCodecTag !== false;
        document.querySelector('#showAudioInfoTag').checked = config.ShowAudioInfoTag !== false;
        // Restore stack order: rows are visually reordered to match
        // current saved order values (ties broken by default order).
        if (typeof renderQualityCatOrderAdmin === 'function') renderQualityCatOrderAdmin(config);
        document.querySelector('#genreTagsEnabled').checked = config.GenreTagsEnabled;
        document.querySelector('#peopleTagsEnabled').checked = config.PeopleTagsEnabled;
        const qPos = config.QualityTagsPosition || 'top-left';
        const gPos = config.GenreTagsPosition || 'top-right';
        const lPos = config.LanguageTagsPosition || 'bottom-left';
        const rPos = config.RatingTagsPosition || 'bottom-right';
        const langEnabled = !!config.LanguageTagsEnabled;
        const ratingEnabled = !!config.RatingTagsEnabled;
        const peopleEnabled = !!config.PeopleTagsEnabled;
        const qSel = document.querySelector('#qualityTagsPosition');
        const gSel = document.querySelector('#genreTagsPosition');
        const lSel = document.querySelector('#languageTagsPosition');
        const rSel = document.querySelector('#ratingTagsPosition');
        const lChk = document.querySelector('#languageTagsEnabled');
        const rChk = document.querySelector('#ratingTagsEnabled');
        if (qSel) qSel.value = qPos;
        if (gSel) gSel.value = gPos;
        if (lSel) lSel.value = lPos;
        if (rSel) rSel.value = rPos;
        if (lChk) lChk.checked = langEnabled;
        document.querySelector('#languageTagsPriority').value = config.LanguageTagsPriority || '';
        document.querySelector('#languageTagsPriorityStrict').checked = config.LanguageTagsPriorityStrict === true;
        if (rChk) rChk.checked = ratingEnabled;
        const pChk = document.querySelector('#peopleTagsEnabled');
        if (pChk) pChk.checked = peopleEnabled;
        document.querySelector('#disableTagsOnSearchPage').checked = config.DisableTagsOnSearchPage === true;
        document.querySelector('#tagsHideOnHover').checked = config.TagsHideOnHover === true;
        document.querySelector('#tagCacheServerMode').checked = config.TagCacheServerMode !== false;
        document.querySelector('#enableTagsLocalStorageFallback').checked =
            config.EnableTagsLocalStorageFallback === true;
        document.querySelector('#tagsCacheTtlDays').value = config.TagsCacheTtlDays || 30;
        document.querySelector('#showUserRatingDash').checked = config.ShowUserRatingDash !== false;
        document.querySelector('#showUserRatingOnPosters').checked = config.ShowUserRatingOnPosters === true;
    }

    function readTagsSettings(config) {
        config.QualityTagsEnabled = document.querySelector('#qualityTagsEnabled').checked;
        config.ShowResolutionTag = document.querySelector('#showResolutionTag').checked;
        config.ShowSourceTag = document.querySelector('#showSourceTag').checked;
        config.ShowDynamicRangeTag = document.querySelector('#showDynamicRangeTag').checked;
        config.ShowSpecialFormatTag = document.querySelector('#showSpecialFormatTag').checked;
        config.ShowVideoCodecTag = document.querySelector('#showVideoCodecTag').checked;
        config.ShowAudioInfoTag = document.querySelector('#showAudioInfoTag').checked;
        // Persist current visual stack order. Each admin row reads its current
        // DOM position (1-based) into the corresponding *Order config key.
        // Skipped if the load-time render failed — otherwise we'd clobber the
        // user's saved order with default DOM positions.
        if (_qualityCatRenderOK) {
            const adminCatRows = document.querySelectorAll('#qualityCategoriesAdmin .je-quality-cat-admin-row');
            adminCatRows.forEach((row, idx) => {
                const orderKey = row.dataset.orderKey;
                if (orderKey) config[orderKey] = idx + 1;
            });
        }
        config.GenreTagsEnabled = document.querySelector('#genreTagsEnabled').checked;
        config.LanguageTagsEnabled = document.querySelector('#languageTagsEnabled').checked;
        config.RatingTagsEnabled = document.querySelector('#ratingTagsEnabled').checked;
        config.PeopleTagsEnabled = document.querySelector('#peopleTagsEnabled').checked;
        config.DisableTagsOnSearchPage = document.querySelector('#disableTagsOnSearchPage').checked;
        config.TagsHideOnHover = document.querySelector('#tagsHideOnHover').checked;
        config.TagCacheServerMode = document.querySelector('#tagCacheServerMode').checked;
        config.EnableTagsLocalStorageFallback = config.TagCacheServerMode
            ? document.querySelector('#enableTagsLocalStorageFallback').checked
            : true;
        config.QualityTagsPosition = document.querySelector('#qualityTagsPosition').value;
        config.GenreTagsPosition = document.querySelector('#genreTagsPosition').value;
        config.LanguageTagsPosition = document.querySelector('#languageTagsPosition').value;
        config.LanguageTagsPriority = document.querySelector('#languageTagsPriority').value.trim();
        config.LanguageTagsPriorityStrict = document.querySelector('#languageTagsPriorityStrict').checked;
        config.RatingTagsPosition = document.querySelector('#ratingTagsPosition').value;
        config.TagsCacheTtlDays = parseInt(document.querySelector('#tagsCacheTtlDays').value, 10) || 30;
        config.ShowUserRatingDash = document.querySelector('#showUserRatingDash').checked;
        config.ShowUserRatingOnPosters = document.querySelector('#showUserRatingOnPosters').checked;
    }

    function getTagsParentDeps() {
        return [
            {
                parent: 'qualityTagsEnabled',
                label: 'Enable Quality Tags',
                children: [
                    'qualityTagsPosition',
                    'showResolutionTag',
                    'showSourceTag',
                    'showDynamicRangeTag',
                    'showSpecialFormatTag',
                    'showVideoCodecTag',
                    'showAudioInfoTag',
                ],
                noHint: true,
            },
            { parent: 'genreTagsEnabled', label: 'Enable Genre Tags', children: ['genreTagsPosition'], noHint: true },
            {
                parent: 'languageTagsEnabled',
                label: 'Enable Language Tags',
                children: ['languageTagsPosition', 'languageTagsPriority', 'languageTagsPriorityStrict'],
                noHint: true,
            },
            {
                parent: 'ratingTagsEnabled',
                label: 'Enable Rating Tags',
                children: ['ratingTagsPosition'],
                noHint: true,
            },
        ];
    }

    function describeTags(bool, feat) {
        var tagCount = [
            'qualityTagsEnabled',
            'genreTagsEnabled',
            'languageTagsEnabled',
            'ratingTagsEnabled',
            'peopleTagsEnabled',
        ].filter(bool).length;
        feat('Media Tags', tagCount > 0, 'display', tagCount + ' tag type(s) enabled');
    }

    const clearTagsCacheBtn = document.querySelector('#clearTagsCacheBtn');

    // Tracks whether the most recent `renderQualityCatOrderAdmin` call ran
    // to completion. If false at save time, we skip writing positional
    // *Order values back to config so a render failure can't clobber the
    // user's saved order with default DOM positions.
    var _qualityCatRenderOK = false;

    // Reorders the admin quality-category rows to match the saved *Order values from the plugin config
    function renderQualityCatOrderAdmin(config) {
        _qualityCatRenderOK = false;
        try {
            var container = document.getElementById('qualityCategoriesAdmin');
            if (!container) return;
            var rows = Array.from(container.querySelectorAll('.je-quality-cat-admin-row'));
            rows.sort(function (a, b) {
                var aOrder = parseInt(config[a.dataset.orderKey], 10);
                var bOrder = parseInt(config[b.dataset.orderKey], 10);
                if (!Number.isFinite(aOrder)) aOrder = parseInt(a.dataset.defaultOrder, 10);
                if (!Number.isFinite(bOrder)) bOrder = parseInt(b.dataset.defaultOrder, 10);
                if (aOrder !== bOrder) return aOrder - bOrder;
                return parseInt(a.dataset.defaultOrder, 10) - parseInt(b.dataset.defaultOrder, 10);
            });
            rows.forEach(function (row) {
                container.appendChild(row);
            });
            refreshQualityCatAdminArrows(container);
            _qualityCatRenderOK = true;
        } catch (err) {
            console.error('Jellyfin Enhanced: renderQualityCatOrderAdmin failed; will skip *Order save', err);
        }
    }

    // Updates the disabled/opacity styling on the up/down buttons so the
    // top row can't go up and the bottom row can't go down.
    function refreshQualityCatAdminArrows(container) {
        var rows = container.querySelectorAll('.je-quality-cat-admin-row');
        rows.forEach(function (row, idx) {
            var up = row.querySelector('.je-cat-up');
            var down = row.querySelector('.je-cat-down');
            var first = idx === 0;
            var last = idx === rows.length - 1;
            if (up) {
                up.disabled = first;
                up.style.opacity = first ? '0.4' : '1';
                up.style.cursor = first ? 'not-allowed' : 'pointer';
            }
            if (down) {
                down.disabled = last;
                down.style.opacity = last ? '0.4' : '1';
                down.style.cursor = last ? 'not-allowed' : 'pointer';
            }
        });
    }

    /**
     * Shows clear-client-cache controls only when server-side tag cache is disabled.
     */
    function updateClientTagCacheControlsVisibility() {
        var serverModeCheckbox = document.getElementById('tagCacheServerMode');
        var controls = document.getElementById('clientTagCacheControls');
        var serverControls = document.getElementById('serverTagCacheControls');
        var localStorageFallbackContainer = document.getElementById('tagsLocalStorageFallbackContainer');
        var localStorageFallbackCheckbox = document.getElementById('enableTagsLocalStorageFallback');
        if (!serverModeCheckbox || !controls) return;

        if (serverControls) {
            serverControls.style.display = serverModeCheckbox.checked ? '' : 'none';
        }

        if (localStorageFallbackContainer) {
            var hide = serverModeCheckbox.checked ? 'none' : '';
            localStorageFallbackContainer.style.display = hide;
            var localStorageFallbackDesc = document.querySelector('[data-desc-for="enableTagsLocalStorageFallback"]');
            if (localStorageFallbackDesc) localStorageFallbackDesc.style.display = hide;
        }

        if (!serverModeCheckbox.checked && localStorageFallbackCheckbox) {
            localStorageFallbackCheckbox.checked = true;
        }

        controls.style.display = serverModeCheckbox.checked ? 'none' : '';
        updateClearTagCachesQuickBtnVisibility();
    }

    var rebuildTagCacheBtn = document.querySelector('#rebuildTagCacheBtn');

    /**
     * Quick Action: proxy the "Clear client tag caches" button from the
     * Display tab. Keeps the canonical clear-flow in one place while
     * giving the action a home on Overview.
     */
    var clearTagCachesQuickBtn = document.getElementById('clearTagCachesQuickBtn');

    /**
     * Syncs the "Clear all client tag caches" quick-action button visibility
     * with the server-mode toggle — it's only relevant when server-side cache
     * is disabled.
     */
    function updateClearTagCachesQuickBtnVisibility() {
        var serverModeCheckbox = document.getElementById('tagCacheServerMode');
        if (!clearTagCachesQuickBtn || !serverModeCheckbox) return;
        clearTagCachesQuickBtn.style.display = serverModeCheckbox.checked ? 'none' : '';
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Wire up/down arrow clicks for the admin quality-category list.
        // Uses event delegation on the container so this only registers once.
        (function () {
            lifecycle.listen(document, 'click', function (e) {
                var btn =
                    e.target.closest &&
                    e.target.closest('#qualityCategoriesAdmin .je-cat-up, #qualityCategoriesAdmin .je-cat-down');
                if (!btn || btn.disabled) return;
                e.preventDefault();
                var row = btn.closest('.je-quality-cat-admin-row');
                if (!row) return;
                var parent = row.parentNode;
                if (!parent) return;
                var isUp = btn.classList.contains('je-cat-up');
                var sibling = isUp ? row.previousElementSibling : row.nextElementSibling;
                if (!sibling || !sibling.classList.contains('je-quality-cat-admin-row')) return;
                if (isUp) {
                    parent.insertBefore(row, sibling);
                } else {
                    parent.insertBefore(sibling, row);
                }
                refreshQualityCatAdminArrows(parent);
            });
        })();

        lifecycle.listen(clearTagsCacheBtn, 'click', async () => {
            if (
                confirm(
                    'Clear all client caches?\n\nThis will force all clients to clear their quality and genre tag caches on next page load.',
                )
            ) {
                Dashboard.showLoadingMsg();
                try {
                    const config = await ApiClient.getPluginConfiguration(pluginId);
                    config.ClearLocalStorageTimestamp = Date.now();
                    await ApiClient.updatePluginConfiguration(pluginId, config);
                    Dashboard.hideLoadingMsg();
                    Dashboard.alert({
                        title: 'Success',
                        message: 'Cache clear signal sent. All clients will clear their caches on next page load.',
                    });
                } catch (e) {
                    Dashboard.hideLoadingMsg();
                    console.error('Failed to set cache clear timestamp:', e);
                    Dashboard.alert({
                        title: 'Error',
                        message: 'Failed to set cache clear timestamp. Check server logs for details.',
                    });
                }
            }
        });

        if (rebuildTagCacheBtn) {
            lifecycle.listen(rebuildTagCacheBtn, 'click', async () => {
                if (
                    !confirm(
                        'Rebuild the server tag cache?\n\nThis re-scans the whole library in the background and may take a few minutes. Tags keep serving from the existing cache until the rebuild finishes.',
                    )
                ) {
                    return;
                }
                rebuildTagCacheBtn.disabled = true;
                try {
                    const url = ApiClient.getUrl('/JellyfinEnhanced/tag-cache/rebuild');
                    const res = await ApiClient.ajax({ type: 'POST', url: url, dataType: 'json' });
                    Dashboard.alert({
                        title: 'Rebuild Started',
                        message:
                            (res && res.message) ||
                            'Rebuilding the tag cache in the background. Check the server logs for progress and completion.',
                    });
                } catch (e) {
                    console.error('Failed to start tag cache rebuild:', e);
                    var message = 'Failed to start the rebuild. Check server logs for details.';
                    if (e && e.status === 409) {
                        message = 'A tag cache rebuild is already in progress.';
                    } else if (e && e.status === 400) {
                        message = 'Enable Server-Side Tag Cache first.';
                    }
                    Dashboard.alert({ title: 'Error', message: message });
                } finally {
                    rebuildTagCacheBtn.disabled = false;
                }
            });
        }

        if (clearTagCachesQuickBtn && clearTagsCacheBtn) {
            lifecycle.listen(clearTagCachesQuickBtn, 'click', function () {
                clearTagsCacheBtn.click();
            });
        }
    }
    function getDependencies() {
        return { parents: getTagsParentDeps() };
    }
    return {
        load: loadTagsSettings,
        read: readTagsSettings,
        describeTags,
        refreshQualityCatAdminArrows,
        updateClientTagCacheControlsVisibility,
        initialize,
        dispose: () => lifecycle.dispose(),
        getDependencies,
    };
}
