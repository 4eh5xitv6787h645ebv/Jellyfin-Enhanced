/** Dashboard shell boundary. */
function createDashboardShell({ lifecycle, initAutoMovieQualityMode, loadConfig, saveConfig, resetAllUserSettings }) {
    const pluginId = 'f69e946a-4b3c-4e9a-8f0a-8d7c1b2c4d9b';

    const page = document.querySelector('#JellyfinEnhancedPage');

    const form = document.querySelector('#JellyfinEnhancedForm');

    // Theme detector: Jellyfin's themes hard-swap theme.css (no CSS
    // variable contract) so we infer dark vs. light from the computed
    // background-color of <html>. Dark themes return something like
    // rgb(16,16,16) (sum ~48); the Light theme returns rgb(242,242,242)
    // (sum 726). Threshold at 450 bins every shipped theme correctly.
    // We also re-run on `load` in case the theme sheet hadn't applied
    // by the time our initial check ran, and once more after ~600 ms
    // to catch late Jellyfin theme swaps during dashboard navigation.
    function _jeDetectTheme() {
        if (!page) return;
        // Wrap the read in try/catch — during SPA detach getComputedStyle
        // can throw InvalidAccessError. If anything goes wrong we fall
        // back to dark (matches the plugin's previous default) so the
        // rest of the IIFE's listener wiring isn't aborted by a throw
        // from this purely cosmetic detector.
        try {
            var bg = getComputedStyle(document.documentElement).backgroundColor;
            var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!m) {
                // Named colors (`black`), `transparent`, or `initial`: can't
                // tell light vs. dark reliably. Log once so a future broken
                // theme is diagnosable rather than silently dark.
                console.warn(
                    '[JE] theme detector: document background is unparseable (' + bg + '); defaulting to dark',
                );
                page.classList.remove('je-light-theme');
                page.classList.add('je-dark-theme');
                return;
            }
            var sum = +m[1] + +m[2] + +m[3];
            var isLight = sum > 450;
            page.classList.toggle('je-light-theme', isLight);
            page.classList.toggle('je-dark-theme', !isLight);
        } catch (e) {
            console.warn('[JE] theme detection failed, defaulting to dark:', e);
            page.classList.remove('je-light-theme');
            page.classList.add('je-dark-theme');
        }
    }

    const resetAllUserSettingsBtn = document.querySelector('#resetAllUserSettingsBtn');

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Point every CDN-backed image on this page at the local plugin CDN route.
        // Images carry a data-je-cdn="<source>/<path>" attribute instead of a hardcoded
        // external src, so the browser never contacts an external CDN. jeCdnUrl is
        // defined in the head <script> above and is base-path-safe.
        try {
            document.querySelectorAll('img[data-je-cdn]').forEach((img) => {
                img.src = jeCdnUrl(img.getAttribute('data-je-cdn'));
            });
        } catch (e) {
            console.warn('[JE] Failed to rewrite CDN image sources', e);
        }

        _jeDetectTheme();

        lifecycle.listen(window, 'load', _jeDetectTheme);

        lifecycle.setTimeout(_jeDetectTheme, 600);

        lifecycle.listen(page, 'pageshow', loadConfig);

        lifecycle.listen(form, 'submit', saveConfig);

        lifecycle.listen(resetAllUserSettingsBtn, 'click', resetAllUserSettings);

        initAutoMovieQualityMode();

        // Apply the blurred background to .je-sticky-header only when the
        // surrounding scroll container has actually scrolled — at scrollTop=0
        // the header stays transparent so it doesn't cover the Jellyfin top
        // bar / user avatar. We don't know ahead of time which element
        // actually scrolls (Jellyfin's layout has several candidates: the
        // page view wrapper, body, and window — and Jellyfin's `.scrollY`
        // utility class decorates some non-scrolling nodes), so we attach
        // scroll listeners to every reasonable candidate (matching ancestor
        // + window) and read whichever reports a non-zero scroll position.
        // This IIFE runs once at script parse; the listeners persist across
        // SPA navigation since Jellyfin keeps the config page DOM alive.
        (function wireStickyHeaderScroll() {
            var header = document.querySelector('.je-sticky-header');
            if (!header) return;
            // Collect all overflow-y:auto|scroll ancestors as scroll-candidate
            // nodes. We don't trust scrollHeight>clientHeight at bind time
            // (async content hasn't landed yet); we don't pick just the
            // first match (Jellyfin's .scrollY utility flags decorative
            // containers that don't actually scroll). Listening on all
            // matches plus window means whichever actually scrolls drives
            // the class toggle.
            function findScrollCandidates(el) {
                var nodes = [];
                var node = el && el.parentNode;
                while (node && node !== document.body && node.nodeType === 1) {
                    var oy = getComputedStyle(node).overflowY;
                    if (oy === 'auto' || oy === 'scroll') nodes.push(node);
                    node = node.parentNode;
                }
                return nodes;
            }
            var candidates = findScrollCandidates(header);
            var ticking = false;
            function currentScrollTop() {
                var winTop = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
                var contTop = 0;
                for (var i = 0; i < candidates.length; i++) {
                    var n = candidates[i];
                    // Skip detached nodes: their scrollTop freezes at the last
                    // value, which would incorrectly pin `.je-is-scrolled` on
                    // after the live scroller returns to top.
                    if (!n.isConnected) continue;
                    var t = n.scrollTop || 0;
                    if (t > contTop) contTop = t;
                }
                return winTop > contTop ? winTop : contTop;
            }
            function read() {
                try {
                    header.classList.toggle('je-is-scrolled', currentScrollTop() > 4);
                } catch (e) {
                    console.warn('[JE] sticky-header read failed:', e);
                } finally {
                    // Guarantees the rAF pipeline doesn't wedge on `ticking` if read() throws.
                    ticking = false;
                }
            }
            function onScroll() {
                if (ticking) return;
                ticking = true;
                lifecycle.requestAnimationFrame(read);
            }
            // Always listen on window (document-scrolling layouts) and on
            // each overflow-declared ancestor (mid-tree scrollers).
            lifecycle.listen(window, 'scroll', onScroll, { passive: true });
            if (candidates.length === 0) {
                console.warn(
                    '[JE] sticky-header: no overflow:auto|scroll ancestors found; relying on window scroll only.',
                );
            }
            candidates.forEach(function (n) {
                lifecycle.listen(n, 'scroll', onScroll, { passive: true });
            });
            read();
        })();
    }
    return { pluginId, form, initialize, dispose: () => lifecycle.dispose() };
}
