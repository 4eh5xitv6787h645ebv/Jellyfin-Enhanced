/** Feature settings and its private editor state. */
function createRatingsSettings({ lifecycle, refreshQualityCatAdminArrows, formatDateTimeDMY }) {
    let statusRequest = 0;
    function loadRatingsSettings(config) {
        // A reload can replace the key without issuing another status request.
        statusRequest++;
        document.querySelector('#showAwards').checked = !!config.ShowAwards;
        document.querySelector('#mdblistRatingsEnabled').checked = !!config.MdblistRatingsEnabled;
        document.querySelector('#mdblistApiKey').value = config.MdblistApiKey || '';
        document.querySelector('#mdblistRatingsShowOnItemDetails').checked =
            config.MdblistRatingsShowOnItemDetails !== false;
        document.querySelector('#mdblistRatingsFetchEnabled').checked = !!config.MdblistRatingsFetchEnabled;
        document.querySelector('#mdblistFetchReserve').value = config.MdblistFetchReserve || 400;
        document.querySelector('#mdblistRatingsAutoSyncEnabled').checked = !!config.MdblistRatingsAutoSyncEnabled;
        document.querySelector('#mdblistRatingsOverwriteExisting').checked = !!config.MdblistRatingsOverwriteExisting;
        if (typeof renderMdblistSourcesAdmin === 'function') renderMdblistSourcesAdmin(config);
        document.querySelector('#mdblistRatingsShowPercentSymbol').checked = !!config.MdblistRatingsShowPercentSymbol;
        if (config.MdblistApiKey && typeof checkMdblistStatus === 'function') {
            checkMdblistStatus();
        } else {
            const indicator = document.getElementById('mdblistStatusIndicator');
            const line = document.getElementById('mdblistStatusLine');
            if (indicator) {
                indicator.textContent = '';
                indicator.classList.remove('status-check');
            }
            if (line) line.textContent = '';
        }
        // Load extras settings
        document.querySelector('#coloredRatingsEnabled').checked = config.ColoredRatingsEnabled;
    }

    function readRatingsSettings(config) {
        config.ShowAwards = document.querySelector('#showAwards').checked;
        config.MdblistRatingsEnabled = document.querySelector('#mdblistRatingsEnabled').checked;
        config.MdblistApiKey = document.querySelector('#mdblistApiKey').value.trim();
        config.MdblistRatingsShowOnItemDetails = document.querySelector('#mdblistRatingsShowOnItemDetails').checked;
        config.MdblistRatingsFetchEnabled = document.querySelector('#mdblistRatingsFetchEnabled').checked;
        config.MdblistFetchReserve = parseInt(document.querySelector('#mdblistFetchReserve').value, 10) || 400;
        config.MdblistRatingsAutoSyncEnabled = document.querySelector('#mdblistRatingsAutoSyncEnabled').checked;
        config.MdblistRatingsOverwriteExisting = document.querySelector('#mdblistRatingsOverwriteExisting').checked;
        config.MdblistRatingsSources =
            typeof computeMdblistRatingsSources === 'function' ? computeMdblistRatingsSources() : '';
        config.MdblistRatingsShowPercentSymbol = document.querySelector('#mdblistRatingsShowPercentSymbol').checked;
        // Extras settings
        config.ColoredRatingsEnabled = document.querySelector('#coloredRatingsEnabled').checked;
    }

    function getRatingsParentDeps() {
        return [
            {
                parent: 'mdblistRatingsEnabled',
                label: 'Enable MDBList Ratings',
                children: [
                    'mdblistApiKey',
                    'mdblistRatingsShowOnItemDetails',
                    'mdblistRatingsFetchEnabled',
                    'mdblistFetchReserve',
                    'mdblistRatingsAutoSyncEnabled',
                    'mdblistRatingsOverwriteExisting',
                    'mdblistRatingsShowPercentSymbol',
                ],
            },
        ];
    }

    // MDBList rating sources: key (matches the API's source string), display
    // label, and logo filename (served via the "mdblist-logos" CDN source,
    // see CdnAssetService.cs).
    var MDBLIST_SOURCES = [
        { key: 'tmdb', label: 'TMDB', logo: 'tmdb.png' },
        { key: 'tomatoes', label: 'RT Critic', logo: 'rottentomatoes.png' },
        { key: 'popcorn', label: 'RT Audience', logo: 'rottentomatoes_audience.png' },
        { key: 'imdb', label: 'IMDb', logo: 'imdb.png' },
        { key: 'trakt', label: 'Trakt', logo: 'trakt.png' },
        { key: 'metacritic', label: 'Metascore', logo: 'metacritic.png' },
        { key: 'metacriticuser', label: 'Metacritic User', logo: 'metacritic_audience.png' },
        { key: 'letterboxd', label: 'Letterboxd', logo: 'letterboxd.png' },
        { key: 'rogerebert', label: 'Roger Ebert', logo: 'rogerebert.png' },
        { key: 'myanimelist', label: 'MAL', logo: 'myanimelist.png' },
        { key: 'anilist', label: 'AniList', logo: 'anilist.png' },
        { key: 'master', label: 'Master', logo: 'master.png' },
    ];

    // Builds the checkbox+logo+reorder row list from the saved
    // MdblistRatingsSources comma string; empty means every source is
    // checked, in MDBLIST_SOURCES' built-in order. Rebuilt fresh on every
    // load (unlike the quality-category rows, which reorder fixed static
    // HTML) since the row set itself doesn't otherwise exist in the DOM.
    function renderMdblistSourcesAdmin(config) {
        var container = document.getElementById('mdblistRatingsSourcesAdmin');
        if (!container) return;

        var configured = (config.MdblistRatingsSources || '')
            .split(',')
            .map(function (s) {
                return s.trim().toLowerCase();
            })
            .filter(Boolean);
        var knownKeys = MDBLIST_SOURCES.map(function (s) {
            return s.key;
        });
        var order = configured.length
            ? configured.filter(function (k) {
                  return knownKeys.indexOf(k) !== -1;
              })
            : knownKeys.slice();
        // Any known source the admin's saved list doesn't mention (e.g. added
        // to MDBLIST_SOURCES after they last saved) still shows, unchecked if
        // the admin has an explicit (non-empty) list, checked otherwise.
        knownKeys.forEach(function (k) {
            if (order.indexOf(k) === -1) order.push(k);
        });

        container.innerHTML = '';
        order.forEach(function (key) {
            var meta = MDBLIST_SOURCES.filter(function (s) {
                return s.key === key;
            })[0];
            if (!meta) return;
            var checked = configured.length === 0 || configured.indexOf(key) !== -1;

            var row = document.createElement('div');
            row.className = 'je-quality-cat-admin-row';
            row.dataset.sourceKey = key;

            var checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'checkboxContainer';
            var label = document.createElement('label');
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'je-mdblist-source-toggle';
            checkbox.checked = checked;
            var img = document.createElement('img');
            img.src = jeCdnUrl('mdblist-logos/' + meta.logo);
            img.alt = '';
            img.style.cssText = 'height:16px;vertical-align:middle;margin:0 8px;';
            var span = document.createElement('span');
            span.textContent = meta.label;
            label.appendChild(checkbox);
            label.appendChild(img);
            label.appendChild(span);
            checkboxContainer.appendChild(label);
            row.appendChild(checkboxContainer);

            var upBtn = document.createElement('button');
            upBtn.type = 'button';
            upBtn.className = 'raised raised-mini je-cat-up';
            upBtn.setAttribute('aria-label', 'Move up');
            upBtn.innerHTML = '<i class="material-icons" aria-hidden="true">arrow_upward</i>';
            var downBtn = document.createElement('button');
            downBtn.type = 'button';
            downBtn.className = 'raised raised-mini je-cat-down';
            downBtn.setAttribute('aria-label', 'Move down');
            downBtn.innerHTML = '<i class="material-icons" aria-hidden="true">arrow_downward</i>';
            row.appendChild(upBtn);
            row.appendChild(downBtn);

            container.appendChild(row);
        });
        refreshQualityCatAdminArrows(container);
    }

    // Reads the current row order + checked state back into the
    // comma-separated MdblistRatingsSources string at save time.
    function computeMdblistRatingsSources() {
        var container = document.getElementById('mdblistRatingsSourcesAdmin');
        if (!container) return '';
        var rows = Array.from(container.querySelectorAll('.je-quality-cat-admin-row'));
        return rows
            .filter(function (row) {
                var cb = row.querySelector('.je-mdblist-source-toggle');
                return cb && cb.checked;
            })
            .map(function (row) {
                return row.dataset.sourceKey;
            })
            .join(',');
    }

    /**
     * Fetches and displays live MDBList account/quota status. Tests
     * whatever's currently typed in the API key field (even if unsaved),
     * mirroring testTmdbConnection -- lets the admin verify a key before
     * hitting Save. Falls back to the saved key if the field is empty.
     */
    async function checkMdblistStatus() {
        if (lifecycle.disposed) return;
        const request = ++statusRequest;
        const isCurrent = () => !lifecycle.disposed && request === statusRequest;
        const statusLine = document.getElementById('mdblistStatusLine');
        const statusIndicator = document.getElementById('mdblistStatusIndicator');
        const apiKey = (document.querySelector('#mdblistApiKey')?.value || '').trim();

        if (statusIndicator) {
            statusIndicator.textContent = 'sync';
            statusIndicator.classList.add('status-check');
            statusIndicator.style.color = 'var(--primary-accent-color, #00a4dc)';
        }
        if (statusLine) statusLine.textContent = 'Checking...';

        try {
            const url = ApiClient.getUrl(
                '/JellyfinEnhanced/mdblist-ratings/account-status',
                apiKey ? { apiKey: apiKey } : {},
            );
            const status = await ApiClient.ajax({ type: 'GET', url: url, dataType: 'json' });
            if (!isCurrent()) return;

            if (statusIndicator) {
                statusIndicator.textContent = 'check_circle';
                statusIndicator.style.color = '#52b54b';
            }
            if (statusLine) {
                var remaining = status && status.RateLimitRemaining != null ? status.RateLimitRemaining : '?';
                var limit = status && status.RateLimit != null ? status.RateLimit : '?';
                var plan = status && status.Plan ? status.Plan : 'Free';
                var resetSeconds = status && status.RateLimitResetUnixSeconds ? status.RateLimitResetUnixSeconds : 0;
                var resetDate = new Date(resetSeconds * 1000);
                var resetText =
                    isFinite(resetDate.getTime()) && resetSeconds > 0 ? formatDateTimeDMY(resetDate) : 'unknown';
                statusLine.textContent =
                    remaining + ' / ' + limit + ' requests remaining today (' + plan + ' plan) · resets ' + resetText;
            }
        } catch (e) {
            if (!isCurrent()) return;
            if (statusIndicator) {
                statusIndicator.textContent = 'error';
                statusIndicator.style.color = '#dc3545';
            }
            if (statusLine) {
                statusLine.textContent =
                    e && e.status === 503
                        ? 'Enter an API key to check status.'
                        : e && e.status === 502
                          ? 'Could not reach MDBList - key may be invalid.'
                          : 'Could not check MDBList account status.';
            }
        } finally {
            if (isCurrent() && statusIndicator) statusIndicator.classList.remove('status-check');
        }
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Wire up/down arrow clicks for the MDBList sources list (delegated,
        // mirrors the quality-category handler above -- reuses the same
        // refreshQualityCatAdminArrows for the disabled-at-the-ends styling).
        (function () {
            lifecycle.listen(document, 'click', function (e) {
                var btn =
                    e.target.closest &&
                    e.target.closest(
                        '#mdblistRatingsSourcesAdmin .je-cat-up, #mdblistRatingsSourcesAdmin .je-cat-down',
                    );
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

        lifecycle.listen(document.getElementById('checkMdblistStatusBtn'), 'click', checkMdblistStatus);
    }
    function getDependencies() {
        return { parents: getRatingsParentDeps() };
    }
    return {
        load: loadRatingsSettings,
        read: readRatingsSettings,
        initialize,
        dispose: () => lifecycle.dispose(),
        getDependencies,
    };
}
