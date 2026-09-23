/** Dashboard dependencies boundary. */
function createDashboardDependencies({
    lifecycle,
    isMetadataIconsEnabled,
    invalidatePersistedTest,
    renderOptionalPluginsDashboard,
    renderFeaturesDashboard,
    renderServiceStatusDashboard,
    updateClientTagCacheControlsVisibility,
    syncAllBannerParents,
    getPluginStatus,
    rules,
}) {
    // Setup fieldsets that hold the connection inputs are tagged with
    // `data-dep-setup` directly in the HTML — `updateSectionDep` walks
    // every fieldset and gates only the ones WITHOUT that marker, so
    // admins can always edit Sonarr/Radarr/Bazarr/Seerr setup boxes
    // regardless of what else is configured.
    var SECTION_DEPS = rules.sections;

    var INDIVIDUAL_DEPS = rules.individual;

    // Informational only (unlike INDIVIDUAL_DEPS) — Native Tab is more
    // reliable than Custom Tabs on Jellyfin 12, but Custom Tabs still works.
    var CUSTOM_TABS_V12_HINTS = rules.customTabsHints;

    /**
     * Shows the `je-note-banner` under a `*UseCustomTabs` checkbox, on
     * Jellyfin 12, when it's checked and its Native Tab counterpart isn't.
     * @param {Object} dep - Entry from CUSTOM_TABS_V12_HINTS
     */
    function updateCustomTabsV12Hint(dep) {
        var checkbox = document.getElementById(dep.customId);
        var banner = document.getElementById(dep.bannerId);
        if (!checkbox || !banner) return;
        var nativeCheckbox = document.getElementById(dep.nativeId);
        var shouldWarn =
            getPluginStatus().isJellyfin12 && checkbox.checked && !(nativeCheckbox && nativeCheckbox.checked);
        banner.style.display = shouldWarn ? '' : 'none';
    }

    /**
     * Adds a dependency tag to an element's comma-separated data-dep-disabled attribute.
     * @param {HTMLElement} el - The element to tag
     * @param {string} tag - The dependency tag to add
     */
    function addDepTag(el, tag) {
        var existing = (el.getAttribute('data-dep-disabled') || '').split(',').filter(Boolean);
        if (existing.indexOf(tag) === -1) existing.push(tag);
        el.setAttribute('data-dep-disabled', existing.join(','));
    }

    /**
     * Removes a dependency tag from an element; returns true if all tags are cleared.
     * @param {HTMLElement} el - The element to update
     * @param {string} tag - The dependency tag to remove
     * @returns {boolean} True if no dependency tags remain on the element
     */
    function removeDepTag(el, tag) {
        var existing = (el.getAttribute('data-dep-disabled') || '').split(',').filter(Boolean);
        var filtered = existing.filter(function (t) {
            return t !== tag;
        });
        if (filtered.length) {
            el.setAttribute('data-dep-disabled', filtered.join(','));
            return false;
        }
        el.removeAttribute('data-dep-disabled');
        return true;
    }

    /**
     * Creates an orange warning banner DOM element for a missing section dependency.
     * @param {Object} dep - Dependency rule with bannerIcon, bannerTitle, and bannerHint
     * @returns {HTMLElement} The constructed banner element
     */
    function createDepBanner(dep) {
        var banner = document.createElement('div');
        banner.id = dep.bannerId;
        banner.className = 'je-dep-banner';
        var icon = document.createElement('i');
        icon.className = 'material-icons je-dep-banner-icon';
        icon.textContent = dep.bannerIcon;
        var textDiv = document.createElement('div');
        textDiv.className = 'je-dep-banner-text';
        var strong = document.createElement('strong');
        strong.textContent = dep.bannerTitle;
        var br = document.createElement('br');
        var span = document.createElement('span');
        span.className = 'je-dep-banner-hint';
        span.textContent = dep.bannerHint;
        textDiv.appendChild(strong);
        textDiv.appendChild(br);
        textDiv.appendChild(span);
        banner.appendChild(icon);
        banner.appendChild(textDiv);
        return banner;
    }

    /**
     * Evaluates one section-level dependency rule, showing/hiding banners and disabling inputs.
     * @param {Object} dep - Section dependency rule with checkFn, tabSelector, and banner config
     */
    function updateSectionDep(dep) {
        var isMet = dep.checkFn();
        var tab = document.querySelector(dep.tabSelector);
        if (!tab) return;
        var fieldsets = tab.querySelectorAll(':scope > fieldset');
        var targets = [];
        for (var i = 0; i < fieldsets.length; i++) {
            // Setup fieldsets (Sonarr/Radarr/Bazarr config, Seerr connection setup)
            // are always editable so admins can add a connection without first
            // having one — they carry `data-dep-setup` directly in the HTML.
            if (fieldsets[i].hasAttribute('data-dep-setup')) continue;
            targets.push(fieldsets[i]);
        }

        targets.forEach(function (fieldset) {
            var bannerId = dep.bannerId + '-' + Array.prototype.indexOf.call(fieldsets, fieldset);
            var banner = document.getElementById(bannerId);
            if (!isMet) {
                if (!banner) {
                    var b = createDepBanner(dep);
                    b.id = bannerId;
                    var legend = fieldset.querySelector('legend');
                    if (legend) {
                        legend.after(b);
                    } else {
                        fieldset.prepend(b);
                    }
                    banner = b;
                }
                banner.classList.remove('je-hidden');
                banner.classList.add('je-dep-banner'); // ensure class present if banner was pre-existing
                fieldset.querySelectorAll('input, select, textarea, button').forEach(function (el) {
                    if (banner.contains(el)) return;
                    el.disabled = true;
                    addDepTag(el, dep.bannerId);
                });
                fieldset.querySelectorAll('label, .inputLabel, .selectLabel').forEach(function (el) {
                    el.style.opacity = '0.5';
                    el.style.cursor = 'not-allowed';
                    addDepTag(el, dep.bannerId);
                });
                fieldset.querySelectorAll('.fieldDescription').forEach(function (el) {
                    el.style.opacity = '0.5';
                    addDepTag(el, dep.bannerId);
                });
            } else {
                if (banner) banner.classList.add('je-hidden');
                fieldset.querySelectorAll('[data-dep-disabled]').forEach(function (el) {
                    var allClear = removeDepTag(el, dep.bannerId);
                    if (allClear) {
                        if (typeof el.disabled !== 'undefined' && el.tagName !== 'LABEL' && el.tagName !== 'DIV') {
                            el.disabled = false;
                        }
                        el.style.opacity = '';
                        el.style.cursor = '';
                    }
                });
            }
        });
    }

    /**
     * Evaluates one individual setting dependency, disabling checkbox and showing hint when unmet.
     * @param {Object} dep - Individual dependency rule with id, checkFn, hint, and icon
     */
    function updateIndividualDep(dep) {
        var checkbox = document.getElementById(dep.id);
        if (!checkbox) return;
        var label = checkbox.closest('label');
        if (!label) return;
        var isMet = dep.checkFn();
        var tag = 'ind-' + dep.id;

        if (!isMet) {
            checkbox.disabled = true;
            addDepTag(checkbox, tag);
            label.style.opacity = '0.5';
            label.style.cursor = 'not-allowed';
            label.title = dep.hint;
            addDepTag(label, tag);
            var span = label.querySelector('span');
            if (span && !label.querySelector('.dep-required-icon')) {
                var icon = document.createElement('i');
                icon.className = 'material-icons dep-required-icon';
                icon.textContent = dep.icon || 'key';
                icon.style.cssText = 'font-size: 16px; vertical-align: middle; margin-left: 8px; color: #ff9800;';
                icon.title = dep.hint;
                span.appendChild(icon);
            }
            if (span && !label.querySelector('.dep-hint-text')) {
                var hintEl = document.createElement('span');
                hintEl.className = 'dep-hint-text';
                hintEl.textContent = dep.hint;
                span.appendChild(hintEl);
            }
        } else {
            var allClear = removeDepTag(checkbox, tag);
            if (allClear) checkbox.disabled = false;
            var labelClear = removeDepTag(label, tag);
            if (labelClear) {
                label.style.opacity = '';
                label.style.cursor = '';
                label.title = '';
            }
            var reqIcon = label.querySelector('.dep-required-icon');
            if (reqIcon) reqIcon.remove();
            var hintText = label.querySelector('.dep-hint-text');
            if (hintText) hintText.remove();
        }
    }

    var PARENT_DEPS = rules.parents;

    /**
     * Evaluates one parent-child dependency, disabling children when the parent is unchecked.
     * @param {Object} dep - Parent dependency rule with parent id, label, and children ids
     */
    function updateParentDep(dep) {
        var parent = document.getElementById(dep.parent);
        if (!parent) return;
        var isEnabled = parent.checked;
        var tag = 'parent-' + dep.parent;
        var hintClass = 'parent-hint-' + dep.parent;

        dep.children.forEach(function (childId) {
            var child = document.getElementById(childId);
            if (!child) return;
            var container =
                child.closest('.checkboxContainer, .inputContainer, .selectContainer') || child.closest('label');

            if (!isEnabled) {
                child.disabled = true;
                addDepTag(child, tag);
                if (container) {
                    container.style.opacity = '0.5';
                    container.style.cursor = 'not-allowed';
                    addDepTag(container, tag);
                    // Add hint unless the dependency opted out (e.g. tag-position
                    // dropdowns, where the disabled styling next to the parent
                    // checkbox already makes the relationship obvious).
                    if (!dep.noHint && !container.querySelector('.' + hintClass)) {
                        var hint = document.createElement('div');
                        hint.className = 'dep-hint-text ' + hintClass;
                        hint.textContent = 'Enable "' + dep.label + '" to configure';
                        container.appendChild(hint);
                    }
                }
            } else {
                var allClear = removeDepTag(child, tag);
                if (allClear) child.disabled = false;
                if (container) {
                    var cc = removeDepTag(container, tag);
                    if (cc) {
                        container.style.opacity = '';
                        container.style.cursor = '';
                    }
                    // Remove hint
                    var hint = container.querySelector('.' + hintClass);
                    if (hint) hint.remove();
                }
            }
        });
    }

    // ==============================================================
    // Gated help (phase 5). Any setup-instruction block that only
    // applies when a specific toggle is on lives under a
    // [data-gated-by="<checkbox-id>"] attribute. Hidden when the
    // toggle is off; visible when on. Transitions from off→on also
    // auto-open the accordion so the admin doesn't have to hunt
    // for the freshly-revealed help.
    //
    // Declarative tag + generic dispatcher = no per-section wiring.
    // Adding a new gated help block means: drop data-gated-by on
    // the element + add the checkbox id below to GATED_HELP_IDS.
    // ==============================================================

    // Track prior checked state per gated-help parent so we can
    // detect an off→on transition in the change listener and
    // auto-expand the just-revealed accordion.
    var _jeGatedHelpState = Object.create(null);

    /**
     * Syncs visibility of every [data-gated-by] element to its
     * parent checkbox's checked state. If autoExpandOnRise is true
     * AND a parent just went from unchecked to checked, the gated
     * `<details>` is auto-opened.
     */
    function applyGatedHelp(autoExpandOnRise) {
        var gated = document.querySelectorAll('[data-gated-by]');
        gated.forEach(function (el) {
            var parentAttr = el.getAttribute('data-gated-by');
            if (!parentAttr) return;
            // Allow comma-separated IDs: ALL listed parents must be checked
            // for the gated element to show. Used by Custom Tabs auto-manage
            // toggles which depend on BOTH `*UseCustomTabs` AND the master
            // `*Enabled` toggle for the feature.
            var parentIds = parentAttr
                .split(',')
                .map(function (s) {
                    return s.trim();
                })
                .filter(Boolean);
            var allOn = true;
            var anyRise = false;
            parentIds.forEach(function (parentId) {
                var parent = document.getElementById(parentId);
                if (!parent) {
                    allOn = false;
                    return;
                }
                var thisOn = !!parent.checked;
                if (!thisOn) allOn = false;
                var wasOn = _jeGatedHelpState[parentId] === true;
                if (thisOn && !wasOn) anyRise = true;
                _jeGatedHelpState[parentId] = thisOn;
            });
            el.hidden = !allOn;
            if (autoExpandOnRise && allOn && anyRise && el.tagName === 'DETAILS') {
                el.open = true;
            }
        });
    }

    /**
     * Orchestrator: evaluates all section, individual, and parent dependency rules.
     * Each step is isolated so a throw in the status dashboard (which reads a lot
     * of field values) can't cascade and break dependency updates.
     */
    function updateAllDependencies() {
        SECTION_DEPS.forEach(updateSectionDep);
        INDIVIDUAL_DEPS.forEach(updateIndividualDep);
        CUSTOM_TABS_V12_HINTS.forEach(updateCustomTabsV12Hint);
        PARENT_DEPS.forEach(updateParentDep);
        updateClientTagCacheControlsVisibility();
        // `updateStatusDashboard` and the legacy `renderChecklist` both
        // now delegate to `renderServiceStatusDashboard`. Calling both
        // here would rebuild the service grid TWICE per dependency tick
        // (~30 times during a TMDB key rotation). One call is enough.
        try {
            renderServiceStatusDashboard();
        } catch (e) {
            console.warn('[JE] renderServiceStatusDashboard threw; dashboard may be stale:', e);
        }
        try {
            renderOptionalPluginsDashboard();
        } catch (e) {
            console.warn('[JE] renderOptionalPluginsDashboard threw:', e);
        }
        try {
            renderFeaturesDashboard();
        } catch (e) {
            console.warn('[JE] renderFeaturesDashboard threw:', e);
        }
        try {
            // Re-sync banner parent gating. loadConfig sets .checked
            // programmatically, which DOESN'T fire the change event our
            // banner listener uses — so we need an explicit refresh here.
            if (typeof syncAllBannerParents === 'function') syncAllBannerParents();
        } catch (e) {
            console.warn('[JE] syncAllBannerParents threw:', e);
        }
        try {
            // Don't auto-expand when triggered by a bulk dep sync —
            // that would fire `open = true` on every tick the parent
            // is checked, which is noisy. Real off→on transitions
            // go through the dedicated change listener above.
            applyGatedHelp(false);
        } catch (e) {
            console.warn('[JE] applyGatedHelp threw; gated help may be stale:', e);
        }
    }

    // Reactive dependency updates (debounced for text inputs, immediate for checkboxes)
    var depDebounce;

    /** Debounced wrapper that delays updateAllDependencies by 150ms. */
    function debouncedUpdateDeps() {
        lifecycle.clearTimeout(depDebounce);
        depDebounce = lifecycle.setTimeout(updateAllDependencies, 150);
    }

    // Drop persisted "Last tested <date>" entries when the inputs that produced
    // those tests change — otherwise an admin who rotated their TMDB API key or
    // changed Seerr URLs would keep seeing a green checkmark from the previous
    // credentials. The next test (or page render) re-establishes the row.
    function _wireInvalidate(sel, key) {
        var el = document.querySelector(sel);
        if (!el) return;
        var lastValue = el.value;
        // Use 'change' (fires on blur/commit) rather than 'input' (fires per
        // keystroke). Input-per-keystroke would invalidate + rebuild the
        // service-status grid 30+ times during a TMDB key rotation, causing
        // visible lag on slower machines. Change-on-commit gets the same
        // correctness outcome without the churn.
        lifecycle.listen(el, 'change', function () {
            if (el.value !== lastValue) {
                invalidatePersistedTest(key);
                lastValue = el.value;
            }
        });
    }

    // Parent checkbox change listeners
    var parentIds = {};

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Wire one change listener per unique parent id referenced by
        // [data-gated-by]. A single bulk dispatch refreshes every gated
        // element regardless of which parent fired.
        //
        // We also prime `_jeGatedHelpState` with each parent's current
        // checked value at wire time. Without priming, the first user
        // click on a gated parent that was already checked (e.g. after a
        // config load flipped the DOM state out of band) would be read
        // as `wasOn === undefined (falsy) → isOn === true`, i.e. a rise,
        // and auto-expand when it shouldn't. Priming closes that hole
        // for the initial render AND for any parent the config loader
        // set programmatically (programmatic `.checked = true` does NOT
        // fire a change event, so the listener wouldn't see it).
        (function wireGatedHelp() {
            var gated = document.querySelectorAll('[data-gated-by]');
            var uniqueParents = Object.create(null);
            gated.forEach(function (el) {
                var attr = el.getAttribute('data-gated-by');
                if (!attr) return;
                attr.split(',')
                    .map(function (s) {
                        return s.trim();
                    })
                    .filter(Boolean)
                    .forEach(function (id) {
                        uniqueParents[id] = true;
                    });
            });
            Object.keys(uniqueParents).forEach(function (id) {
                var parent = document.getElementById(id);
                if (!parent) {
                    console.warn('[JE] gated-help: parent checkbox #' + id + ' not found — help will stay hidden');
                    return;
                }
                _jeGatedHelpState[id] = !!parent.checked;
                lifecycle.listen(parent, 'change', function () {
                    try {
                        applyGatedHelp(true);
                    } catch (e) {
                        console.warn('[JE] applyGatedHelp threw in change handler:', e);
                    }
                });
            });
            // Reflect initial visibility once so the DOM matches the primed
            // state immediately (no flicker when loadConfig eventually
            // triggers updateAllDependencies → applyGatedHelp(false)).
            try {
                applyGatedHelp(false);
            } catch (e) {
                console.warn('[JE] applyGatedHelp threw during init:', e);
            }
        })();

        ['#TMDB_API_KEY', '#jellyseerr_TMDB_API_KEY'].forEach(function (sel) {
            lifecycle.listen(document.querySelector(sel), 'input', debouncedUpdateDeps);
        });

        lifecycle.listen(document.querySelector('#jellyseerrEnabled'), 'change', updateAllDependencies);

        lifecycle.listen(document.querySelector('#tagCacheServerMode'), 'change', updateAllDependencies);

        lifecycle.listen(document.querySelector('#metadataIconsEnabled'), 'change', updateAllDependencies);

        ['#jellyseerrUrls', '#JellyseerrApiKey'].forEach(function (sel) {
            lifecycle.listen(document.querySelector(sel), 'input', debouncedUpdateDeps);
        });

        _wireInvalidate('#TMDB_API_KEY', 'tmdb');

        _wireInvalidate('#jellyseerr_TMDB_API_KEY', 'tmdb');

        _wireInvalidate('#jellyseerrUrls', 'seerr');

        _wireInvalidate('#JellyseerrApiKey', 'seerr');

        PARENT_DEPS.forEach(function (dep) {
            parentIds[dep.parent] = true;
        });

        Object.keys(parentIds).forEach(function (id) {
            var el = document.getElementById(id);
            if (el) lifecycle.listen(el, 'change', updateAllDependencies);
        });

        CUSTOM_TABS_V12_HINTS.forEach(function (dep) {
            [dep.customId, dep.nativeId].forEach(function (id) {
                var el = document.getElementById(id);
                if (el)
                    lifecycle.listen(el, 'change', function () {
                        updateCustomTabsV12Hint(dep);
                    });
            });
        });
    }
    return { updateAllDependencies, debouncedUpdateDeps, initialize, dispose: () => lifecycle.dispose() };
}
