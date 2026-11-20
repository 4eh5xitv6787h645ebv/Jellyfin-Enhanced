import { cdnUrl } from '../../../host/admin-config-host';
import type { PageModules } from './modules';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type ThemeDeps = Pick<PageModules, 'context'>;

export function createTheme(m: ThemeDeps) {
    const { lifecycle, page } = m.context;

            // Theme detector: Jellyfin's themes hard-swap theme.css (no CSS
            // variable contract) so we infer dark vs. light from the computed
            // background-color of <html>. Dark themes return something like
            // rgb(16,16,16) (sum ~48); the Light theme returns rgb(242,242,242)
            // (sum 726). Threshold at 450 bins every shipped theme correctly.
            // We also re-run on `load` in case the theme sheet hadn't applied
            // by the time our initial check ran, and once more after ~600 ms
            // to catch late Jellyfin theme swaps during dashboard navigation.
            function _jeDetectTheme() : void {
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
                        console.warn('[JE] theme detector: document background is unparseable (' + bg + '); defaulting to dark');
                        page.classList.remove('je-light-theme');
                        page.classList.add('je-dark-theme');
                        return;
                    }
                    var sum = Number(m[1]) + Number(m[2]) + Number(m[3]);
                    var isLight = sum > 450;
                    page.classList.toggle('je-light-theme', isLight);
                    page.classList.toggle('je-dark-theme',  !isLight);
                    _jeAccentInk();
                } catch (e) {
                    console.warn('[JE] theme detection failed, defaulting to dark:', e);
                    page.classList.remove('je-light-theme');
                    page.classList.add('je-dark-theme');
                }
            }

            /** sRGB relative luminance of an rgb()/rgba() colour, or null when it cannot be read. */
            function _jeLuminance(color: string) : number | null {
                var c = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (!c) return null;
                var lin = function(v: number) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
                return 0.2126 * lin(Number(c[1])) + 0.7152 * lin(Number(c[2])) + 0.0722 * lin(Number(c[3]));
            }

            /**
             * Text on the theme's accent (Save, a dialog's main answer): white or near-black, whichever contrasts more.
             * White on Jellyfin's own #00a4dc is only 2.9:1; near-black is about 6:1.
             */
            function _jeAccentInk() : void {
                if (!page) return;
                var probe = document.createElement('span');
                probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--primary-accent-color, #00a4dc)';
                page.appendChild(probe);
                var accent = _jeLuminance(getComputedStyle(probe).color);
                probe.remove();
                if (accent === null) return;
                var ink = _jeLuminance('rgb(4, 34, 46)') ?? 0;
                var onWhite = 1.05 / (accent + 0.05);
                var onInk = (accent + 0.05) / (ink + 0.05);
                page.style.setProperty('--jea-on-accent', onWhite >= onInk ? '#fff' : '#04222e');
            }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {
            // Point every CDN-backed image on this page at the local plugin CDN route.
            // Images carry a data-je-cdn="<source>/<path>" attribute instead of a hardcoded
            // external src, so the browser never contacts an external CDN. jeCdnUrl is
            // defined in the head <script> above and is base-path-safe.
            try {
                document.querySelectorAll<HTMLImageElement>('img[data-je-cdn]').forEach((img) => {
                    // A logo that cannot load (an offline server) falls back to a plain icon, not a broken image.
                    img.addEventListener('error', () => {
                        if (!img.isConnected) return;
                        const icon = document.createElement('i');
                        icon.className = 'material-icons ' + (img.classList.contains('je-tab-icon-img') ? 'je-tab-icon' : 'je-legend-icon');
                        icon.setAttribute('aria-hidden', 'true');
                        icon.textContent = img.classList.contains('je-tab-icon-img') ? 'extension' : 'link';
                        img.replaceWith(icon);
                    }, { once: true, signal: lifecycle.signal });
                    img.src = cdnUrl(img.getAttribute('data-je-cdn') ?? '');
                });
            } catch (e) {
                console.warn('[JE] Failed to rewrite CDN image sources', e);
            }

            // Next frame, before it paints (the page's first frame already has
            // the right theme classes): reading the computed background here, in
            // the middle of the page's insertion, forced an extra style pass.
            requestAnimationFrame(_jeDetectTheme);

            window.addEventListener('load', _jeDetectTheme, { signal: lifecycle.signal });

            lifecycle.timeout(_jeDetectTheme, 600);
    }

    return {
        wire,

    };
}
