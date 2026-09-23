/** Feature settings and its private editor state. */
function createDownloadsRequirements({ lifecycle, debouncedUpdateDeps }) {
    // Requests Page requirements line — hides once at least one of Sonarr/Radarr
    // AND Seerr have URL + API key configured (Sonarr and Radarr are each optional
    // on their own — the backend just skips whichever one is unconfigured — but at
    // least one of the two is needed for the page to show anything). Shows a dynamic
    // list of what's still missing otherwise. The surrounding info banner itself
    // stays visible; only the "Requirements:" sentence toggles. Runs off the live DOM
    // so typing a URL/API key updates immediately without needing a save-and-reload.
    function updateRequestsRequirementsBanner() {
        var line = document.getElementById('requestsPageRequirementsLine');
        if (!line) return;
        var list = document.getElementById('requestsPageRequirementsList');

        function hasCompleteInstance(listId) {
            var root = document.getElementById(listId);
            if (!root) return false;
            // Walk each instance card (the <details class="arr-instance-card"> element
            // built by createInstanceCard). Matching on the real card wrapper avoids
            // closest() landing on the inner .inputContainer div, which only contains
            // the URL input and misses the API-key sibling.
            var cards = root.querySelectorAll('.arr-instance-card');
            for (var i = 0; i < cards.length; i++) {
                var urlEl = cards[i].querySelector('.arr-instance-url');
                var apiEl = cards[i].querySelector('.arr-instance-apikey');
                var url = urlEl ? (urlEl.value || '').trim() : '';
                var api = apiEl ? (apiEl.value || '').trim() : '';
                if (url && api) return true;
            }
            return false;
        }

        var sonarrOK = hasCompleteInstance('sonarrInstancesList');
        var radarrOK = hasCompleteInstance('radarrInstancesList');
        var seerrUrlsEl = document.getElementById('jellyseerrUrls');
        var seerrKeyEl = document.getElementById('JellyseerrApiKey');
        var seerrOK =
            seerrUrlsEl &&
            (seerrUrlsEl.value || '').trim().length > 0 &&
            seerrKeyEl &&
            (seerrKeyEl.value || '').trim().length > 0;

        if ((sonarrOK || radarrOK) && seerrOK) {
            line.style.display = 'none';
            return;
        }

        var missing = [];
        if (!sonarrOK && !radarrOK) missing.push('Sonarr or Radarr');
        if (!seerrOK) missing.push('Seerr');
        var missingText;
        if (missing.length === 1) {
            missingText = missing[0] + ' (URL and API key)';
        } else {
            missingText = missing.join(' and ') + ' (URL and API key each)';
        }
        if (list) list.textContent = 'Still to configure: ' + missingText + '.';
        line.style.display = '';
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Live-update the Requests Page requirements banner AND the dependency
        // gates as the admin types into Seerr fields or adds/edits/removes/
        // toggles *arr instances. Without this, the *arr UI Links / Tags Sync
        // gate banners would stay up until the next form save + reload even
        // though hasAnyArrService() is already true.
        (function wireRequestsBannerReactive() {
            var formEl = document.getElementById('JellyfinEnhancedForm');
            if (!formEl) {
                console.error('[JE] #JellyfinEnhancedForm missing — reactive dep updates disabled');
                return;
            }
            function relevant(target) {
                if (!target) return false;
                if (target.id === 'jellyseerrUrls' || target.id === 'JellyseerrApiKey') return true;
                if (!target.classList) return false;
                return (
                    target.classList.contains('arr-instance-url') ||
                    target.classList.contains('arr-instance-apikey') ||
                    target.classList.contains('arr-instance-enabled')
                );
            }
            function refresh() {
                try {
                    updateRequestsRequirementsBanner();
                    debouncedUpdateDeps();
                } catch (err) {
                    // Observer + listener callbacks must never throw — a throw
                    // here would leave gate banners frozen in their last state
                    // and keep firing on every subsequent mutation.
                    console.error('[JE] dep refresh failed', err);
                }
            }
            // `input` covers all relevant cases: per-keystroke for text/api-key
            // fields, and bubbled-from-checkbox for `.arr-instance-enabled`
            // clicks/keyboard toggles. We deliberately skip a parallel `change`
            // listener — native checkboxes fire BOTH events per toggle, which
            // would double-fire refresh() (debouncedUpdateDeps collapses it,
            // but the synchronous updateRequestsRequirementsBanner pass would
            // run twice).
            lifecycle.listen(formEl, 'input', function (e) {
                if (relevant(e.target)) refresh();
            });
            // Instance add/remove happens via button clicks that mutate
            // #sonarrInstancesList / #radarrInstancesList. Observe both so the
            // banner updates immediately on remove (no input event fires).
            ['sonarrInstancesList', 'radarrInstancesList'].forEach(function (id) {
                var root = document.getElementById(id);
                if (!root) return;
                lifecycle.createObserver(refresh).observe(root, { childList: true, subtree: true });
            });
        })();
    }
    return { updateRequestsRequirementsBanner, initialize, dispose: () => lifecycle.dispose() };
}
