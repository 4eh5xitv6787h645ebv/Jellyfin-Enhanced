/**
 * @file Player context, basic transport controls, and aspect ratio.
 * Load before the other player modules; exports their shared context.
 */
(function(JE) {
    'use strict';

    /**
     * Finds the currently active video element on the page.
     * @returns {HTMLVideoElement|null} The video element or null if not found.
     */
    const getVideo = () => document.querySelector('video');

    /**
     * Finds the main settings button in the video player OSD.
     * @returns {HTMLElement|null} The settings button element.
     */
    const settingsBtn = () => document.querySelector(
    '.videoOsdBottom .btnVideoOsdSettings, .videoOsdBottom button[title="Settings"], .videoOsdBottom button[aria-label="Settings"]'
    );

    JE.openSettings = (cb) => {
        settingsBtn()?.click();
        setTimeout(cb, 120); // Wait for the menu to animate open
    };

    /**
     * Adjusts playback speed up or down through a predefined list of speeds.
     * @param {string} direction Either 'increase' or 'decrease'.
     */
    JE.adjustPlaybackSpeed = (direction) => {
        const video = getVideo();
        if (!video) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        let currentIndex = speeds.findIndex(speed => Math.abs(speed - video.playbackRate) < 0.01);
        if (currentIndex === -1) {
            currentIndex = speeds.findIndex(speed => speed >= video.playbackRate);
            if (currentIndex === -1) currentIndex = speeds.length - 1;
        }
        if (direction === 'increase') {
            currentIndex = Math.min(currentIndex + 1, speeds.length - 1);
        } else {
            currentIndex = Math.max(currentIndex - 1, 0);
        }
        video.playbackRate = speeds[currentIndex];
        JE.toast(JE.t('toast_speed', { speed: speeds[currentIndex] }));
    };

    /**
     * Resets the video playback speed to normal (1.0x).
     */
    JE.resetPlaybackSpeed = () => {
        const video = getVideo();
        if (!video) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        video.playbackRate = 1.0;
        JE.toast(JE.t('toast_speed_normal'));
    };

    /**
     * Jumps to a specific percentage of the video's duration.
     * @param {number} percentage The percentage to jump to (0-100).
     */
    JE.jumpToPercentage = (percentage) => {
        const video = getVideo();
        if (!video || !video.duration) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        video.currentTime = video.duration * (percentage / 100);
        JE.toast(JE.t('toast_jumped_to', { percent: percentage }));
    };

    function getCurrentVideoItemId() {
        try {
            const hash = window.location.hash || '';
            const q = hash.indexOf('?');
            if (q === -1) return null;
            return new URLSearchParams(hash.substring(q + 1)).get('id');
        } catch (err) {
            console.warn('🪼 Jellyfin Enhanced: frame-step item id parse failed', err);
            return null;
        }
    }


    // JE.t returns the raw key on miss; tWithFallback substitutes an inline English default
    // until upstream en.json catches up. Mirrors elsewhere/reviews.js.
    const _tFallbackWarned = new Set();
    function tWithFallback(key, fallback, params) {
        let result;
        try {
            result = JE.t(key, params);
        } catch (err) {
            console.warn(`🪼 Jellyfin Enhanced: JE.t('${key}') threw, using fallback:`, err);
            result = null;
        }
        if (!result || result === key) {
            if (!_tFallbackWarned.has(key)) {
                _tFallbackWarned.add(key);
                console.warn(`🪼 Jellyfin Enhanced: missing translation key '${key}', using inline fallback`);
            }
            let out = fallback;
            if (params) {
                for (const [k, v] of Object.entries(params)) {
                    out = out.split(`{${k}}`).join(String(v));
                }
            }
            return out;
        }
        return result;
    }

    /**
     * Normalizes a Jellyfin item id for comparison (dashless, lowercase).
     * @param {string|null|undefined} value
     * @returns {?string}
     */
    function normalizeItemId(value) {
        const v = (value || '').replace(/-/g, '').toLowerCase();
        return v || null;
    }

    /**
     * Parses the playing item id from a /Videos/{id}/... media source URL.
     * @param {string} src
     * @returns {?string}
     */
    function parseItemIdFromVideosSrc(src) {
        const m = (src || '').match(/\/[Vv]ideos\/([0-9a-fA-F-]{32,36})\b/);
        return m ? m[1] : null;
    }

    /**
     * Item identity visible right now: source-URL parse with the video-page URL
     * as fallback. Null for id-less sources (hls.js blob) — an indeterminate
     * value never *asserts* staleness.
     * @returns {?string}
     */
    function currentItemHint() {
        const video = getVideo();
        const src = (video && (video.currentSrc || video.src)) || '';
        return normalizeItemId(parseItemIdFromVideosSrc(src) || getCurrentVideoItemId());
    }

    /**
     * Resolves the caller's OWN playing session — the remote-control target the
     * DOM-free paths command. Fail-open: an ambiguous DeviceId match (multiple
     * playing sessions) returns null rather than risking the wrong session.
     * @returns {Promise<?object>} The session DTO, or null.
     */
    async function probeOwnSession() {
        try {
            const ac = window.ApiClient;
            if (!ac) return null;
            const userId = ac.getCurrentUserId();
            const deviceId = typeof ac.deviceId === 'function' ? ac.deviceId() : '';
            if (!userId || !deviceId) return null;
            const sessions = await ac.ajax({
                type: 'GET',
                url: ac.getUrl(`/Sessions?ControllableByUserId=${encodeURIComponent(userId)}`),
                dataType: 'json'
            });
            if (!Array.isArray(sessions)) return null;
            const matches = sessions.filter(s => s && s.DeviceId === deviceId && s.NowPlayingItem && s.NowPlayingItem.Id);
            return matches.length === 1 ? matches[0] : null;
        } catch (err) {
            console.warn('🪼 Jellyfin Enhanced: own-session probe failed', err);
            return null;
        }
    }


    /**
     * Human-readable track name for toasts.
     * @param {?object} stream
     * @returns {string}
     */
    function trackDisplayName(stream) {
        if (!stream) return tWithFallback('track_off', 'Off');
        const name = (stream.DisplayTitle || stream.Title || stream.Language || stream.Codec || '').trim();
        return name || ('#' + stream.Index);
    }


    // ── DOM-free aspect ratio cycling ────────────────────────────────────────
    //
    // Mirrors jellyfin-web's htmlVideoPlayer.setAspectRatio (identical in 10.11
    // and 12): the mode lives in the native appSettings localStorage key
    // `aspectRatio` (unprefixed — AppSettings.set only prefixes user-scoped
    // keys), and applying it is `object-fit` on the media element ('auto'
    // removes the property; the PGS graphical-subtitle canvas maps 'auto' to
    // 'contain'). Writing the same key keeps the native settings menu's check
    // marks — and the next native apply — consistent. No panel ever opens.

    /** The three native aspect modes, in native menu order. */
    const ASPECT_MODES = ['auto', 'cover', 'fill'];

    /**
     * Localized label for an aspect mode (used in the toast).
     * @param {string} mode
     * @returns {string}
     */
    function aspectModeLabel(mode) {
        if (mode === 'cover') return tWithFallback('aspect_ratio_cover', 'Cover');
        if (mode === 'fill') return tWithFallback('aspect_ratio_fill', 'Fill');
        return tWithFallback('aspect_ratio_auto', 'Auto');
    }

    /**
     * Cycles video aspect ratio (Auto → Cover → Fill) without opening the OSD
     * settings menu.
     */
    JE.cycleAspect = () => {
        const video = getVideo();
        if (!video) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        let stored = null;
        try {
            stored = window.localStorage.getItem('aspectRatio');
        } catch (err) {
            console.warn('🪼 Jellyfin Enhanced: aspect ratio setting read failed', err);
        }
        const current = ASPECT_MODES.indexOf(stored) !== -1 ? stored : 'auto';
        const next = ASPECT_MODES[(ASPECT_MODES.indexOf(current) + 1) % ASPECT_MODES.length];
        try {
            window.localStorage.setItem('aspectRatio', next);
        } catch (err) {
            // Apply-only degradation: the mode still changes for this stream,
            // the native menu just won't reflect it.
            console.warn('🪼 Jellyfin Enhanced: aspect ratio setting write failed', err);
        }
        if (next === 'auto') {
            video.style.removeProperty('object-fit');
        } else {
            video.style.objectFit = next;
        }
        // libpgs renders graphical subtitles into a sibling canvas whose fit the
        // native player keeps in step with the video ('auto' → 'contain').
        const parent = video.parentElement;
        if (parent) {
            parent.querySelectorAll(':scope > canvas').forEach(canvas => {
                canvas.style.objectFit = next === 'auto' ? 'contain' : next;
            });
        }
        JE.toast(JE.t('toast_aspect_ratio', { ratio: aspectModeLabel(next) }));
    };


    // Private collaboration surface for player feature modules. Public shortcut APIs remain on JE.
    JE.internals = JE.internals || {};
    JE.internals.player = Object.assign(JE.internals.player || {}, {
        getVideo, getCurrentVideoItemId, tWithFallback, normalizeItemId,
        parseItemIdFromVideosSrc, currentItemHint, probeOwnSession, trackDisplayName
    });

})(window.JellyfinEnhanced);
