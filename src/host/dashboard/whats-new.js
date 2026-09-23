/** Dashboard whats new boundary. */
function createDashboardWhatsNew({ lifecycle, jeJumpToTab }) {
    // What's New: settings the server detected as newly added, powered
    // by WhatsNewService.CheckForNewSettings on the backend.

    /** camelCase/PascalCase id -> "Camel Case Id" for display. */
    function jeHumanizeSettingId(id) {
        var spaced = id.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
        return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    }

    let probeGeneration = 0;
    function checkWhatsNew() {
        if (lifecycle.disposed) return;
        const generation = ++probeGeneration;
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/whats-new'),
            dataType: 'json',
        })
            .then(function (data) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                var pluginVersion = data && data.pluginVersion;
                if (!pluginVersion) return;

                // Drop ids that no longer exist in this build (renamed/removed).
                var newSettings = (data && data.newSettings) || {};
                var perSetting = Object.keys(newSettings)
                    .map(function (id) {
                        var el = document.getElementById(id);
                        var tabContent = el ? el.closest('.jellyfin-tab-content') : null;
                        return tabContent
                            ? {
                                  id: id,
                                  tab: tabContent.id,
                                  selector: '#' + id,
                                  title: jeHumanizeSettingId(id),
                                  version: newSettings[id],
                              }
                            : null;
                    })
                    .filter(Boolean);

                var distinctVersions = new Set(
                    perSetting.map(function (f) {
                        return f.version;
                    }),
                );
                var singleVersion = distinctVersions.size === 1 ? perSetting[0].version : null;

                renderWhatsNewBanner(
                    perSetting.length ? groupWhatsNewByFieldset(perSetting) : [],
                    pluginVersion,
                    singleVersion,
                );
                renderWhatsNewBadges(perSetting);
            })
            .catch(function (err) {
                if (lifecycle.disposed || generation !== probeGeneration) return;
                console.warn('[JE] whats-new check failed:', err);
            });
    }

    var _jeAutoFieldsetIdCounter = 0;

    /** Tab content id (e.g. "seerr") -> its visible nav label (e.g. "Seerr"), read straight off the tab button so it never drifts from what's on screen. */
    function jeTabLabel(tabId) {
        var btn = document.querySelector('.jellyfin-tab-button[data-tab="' + tabId + '"] h3');
        if (!btn) return tabId;
        var clone = btn.cloneNode(true);
        clone.querySelectorAll('i.material-icons, img').forEach(function (el) {
            el.remove();
        });
        var text = clone.textContent.trim();
        return text || tabId;
    }

    /** Collapses new settings to one banner entry per fieldset, so a whole new feature reads as one line, not a wall of chips. */
    function groupWhatsNewByFieldset(perSetting) {
        var newIdSet = new Set(
            perSetting.map(function (f) {
                return f.id;
            }),
        );
        var groups = {};
        var order = [];
        perSetting.forEach(function (f) {
            var fieldset = document.querySelector(f.selector).closest('fieldset');
            var legend = fieldset ? fieldset.querySelector(':scope > legend.sectionTitle') : null;
            var title = f.title;
            if (legend) {
                var clone = legend.cloneNode(true);
                clone.querySelectorAll('i.material-icons, img').forEach(function (el) {
                    el.remove();
                });
                var legendText = clone.textContent.trim();
                if (legendText) title = legendText;
            }
            var key = f.tab + ':' + title;
            if (!groups[key]) {
                // Flash the whole fieldset only when every control in it is new;
                // otherwise flash each new control individually.
                var selector = f.selector;
                var isWholeFieldset = false;
                if (fieldset) {
                    var allIds = Array.from(
                        fieldset.querySelectorAll('input[id], select[id], textarea[id], button[id]'),
                    ).map(function (el) {
                        return el.id;
                    });
                    var allNew =
                        allIds.length > 0 &&
                        allIds.every(function (id) {
                            return newIdSet.has(id);
                        });
                    if (allNew) {
                        if (!fieldset.id) fieldset.id = 'je-fieldset-auto-' + ++_jeAutoFieldsetIdCounter;
                        selector = '#' + fieldset.id;
                        isWholeFieldset = true;
                    }
                }
                groups[key] = {
                    tab: f.tab,
                    tabLabel: jeTabLabel(f.tab),
                    selector: selector,
                    title: title,
                    isWholeFieldset: isWholeFieldset,
                    flashSelectors: [isWholeFieldset ? selector : f.selector],
                };
                order.push(key);
            } else if (!groups[key].isWholeFieldset) {
                groups[key].flashSelectors.push(f.selector);
            }
        });
        return order.map(function (key) {
            return groups[key];
        });
    }

    function dismissWhatsNew() {
        if (lifecycle.disposed) return;
        ++probeGeneration; // An older GET must not restore the dismissed banner.
        ApiClient.ajax({ type: 'POST', url: ApiClient.getUrl('/JellyfinEnhanced/whats-new/dismiss') }).catch(
            function (err) {
                console.warn('[JE] whats-new dismiss failed:', err);
            },
        );
        renderWhatsNewBanner([]);
        renderWhatsNewBadges([]);
    }

    function renderWhatsNewBanner(unseen, pluginVersion, singleVersion) {
        var existing = document.getElementById('je-whats-new-banner');
        if (existing) existing.remove();
        if (!pluginVersion) return;

        var banner = document.createElement('div');
        banner.id = 'je-whats-new-banner';
        banner.className = 'je-info-banner je-fieldset-wide je-whats-new-banner';

        var closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'je-whats-new-close';
        closeBtn.title = 'Dismiss';
        closeBtn.setAttribute('aria-label', 'Dismiss');
        closeBtn.innerHTML = '&#x2715;';
        lifecycle.listen(closeBtn, 'click', dismissWhatsNew, undefined, 'dismiss-whats-new');
        banner.appendChild(closeBtn);

        var icon = document.createElement('i');
        icon.className = 'material-icons je-info-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'auto_awesome';
        banner.appendChild(icon);

        var body = document.createElement('div');

        var headingRow = document.createElement('div');
        headingRow.className = 'je-whats-new-heading-row';
        // Every pending setting comes from the same version (the common
        // case, and always true for the first release with this feature)
        // -> name it and deep-link that tag. Spanning several undismissed
        // releases falls back to a version-neutral heading and the full
        // release list, since each badge states its own version anyway.
        var heading = document.createElement('strong');
        heading.textContent =
            unseen.length === 0
                ? 'No new settings in v' + pluginVersion + '.'
                : singleVersion
                  ? "What's new in v" + singleVersion + ':'
                  : "What's new since you last checked:";
        headingRow.appendChild(heading);
        if (pluginVersion) {
            var releaseLink = document.createElement('a');
            releaseLink.href =
                unseen.length === 0
                    ? 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases/tag/' + encodeURIComponent(pluginVersion)
                    : singleVersion
                      ? 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases/tag/' +
                        encodeURIComponent(singleVersion)
                      : 'https://github.com/n00bcodr/Jellyfin-Enhanced/releases';
            releaseLink.target = '_blank';
            releaseLink.rel = 'noopener noreferrer';
            releaseLink.className = 'je-whats-new-release-link';
            var releaseLinkIcon = document.createElement('i');
            releaseLinkIcon.className = 'material-icons';
            releaseLinkIcon.setAttribute('aria-hidden', 'true');
            releaseLinkIcon.textContent = 'open_in_new';
            releaseLink.appendChild(releaseLinkIcon);
            releaseLink.appendChild(document.createTextNode('Read the release notes for entire changelog'));
            headingRow.appendChild(releaseLink);
        }
        body.appendChild(headingRow);

        if (unseen.length > 0) {
            var list = document.createElement('div');
            list.className = 'je-whats-new-list';
            unseen.forEach(function (f) {
                var chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'je-whats-new-chip';
                chip.textContent = f.tabLabel + ' > ' + f.title;
                lifecycle.listen(chip, 'click', function () {
                    jeJumpToTab(f.tab, f.selector, f.flashSelectors);
                });
                list.appendChild(chip);
            });
            body.appendChild(list);
        }

        banner.appendChild(body);
        var overview = document.getElementById('overview');
        if (overview) overview.insertBefore(banner, overview.firstChild);
    }

    function jeAppendNewBadge(container, version) {
        if (!container) return;
        var badge = document.createElement('span');
        badge.className = 'je-new-badge';
        var badgeIcon = document.createElement('i');
        badgeIcon.className = 'material-icons';
        badgeIcon.setAttribute('aria-hidden', 'true');
        badgeIcon.textContent = 'auto_awesome';
        badge.appendChild(badgeIcon);
        badge.appendChild(document.createTextNode(version ? 'New in v' + version : 'New'));
        container.appendChild(badge);
    }

    /** When a whole fieldset is new, badge just its legend instead of every control inside it. Each badge uses its own setting's first-detected version. */
    function renderWhatsNewBadges(perSetting) {
        document.querySelectorAll('.je-new-badge').forEach(function (b) {
            b.remove();
        });
        var newIdSet = new Set(
            perSetting.map(function (f) {
                return f.id;
            }),
        );
        var versionById = new Map(
            perSetting.map(function (f) {
                return [f.id, f.version];
            }),
        );

        var byFieldset = new Map();
        var noFieldset = [];
        perSetting.forEach(function (f) {
            var el = document.getElementById(f.id);
            if (!el) return;
            var fieldset = el.closest('fieldset');
            if (!fieldset) {
                noFieldset.push(el);
                return;
            }
            if (!byFieldset.has(fieldset)) byFieldset.set(fieldset, []);
            byFieldset.get(fieldset).push(el);
        });

        noFieldset.forEach(function (el) {
            jeAppendNewBadge(el.closest('label') || el.parentElement, versionById.get(el.id));
        });

        byFieldset.forEach(function (newEls, fieldset) {
            var allIds = Array.from(fieldset.querySelectorAll('input[id], select[id], textarea[id], button[id]')).map(
                function (el) {
                    return el.id;
                },
            );
            var allNew =
                allIds.length > 0 &&
                allIds.every(function (id) {
                    return newIdSet.has(id);
                });
            if (allNew) {
                jeAppendNewBadge(fieldset.querySelector(':scope > legend.sectionTitle'), versionById.get(newEls[0].id));
            } else {
                newEls.forEach(function (el) {
                    jeAppendNewBadge(el.closest('label') || el.parentElement, versionById.get(el.id));
                });
            }
        });
    }

    return { checkWhatsNew, dispose: () => lifecycle.dispose() };
}
