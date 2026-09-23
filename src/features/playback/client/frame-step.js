/**
 * @file Frame stepping: FPS resolution, per-source cache, and feedback overlay.
 * Depends on playback.js.
 */
(function(JE) {
    'use strict';

    const { getVideo, getCurrentVideoItemId, tWithFallback } = JE.internals.player;

    // Frame Step (YouTube-style , / .). FPS cached per (itemId + media source) so series
    // auto-play swaps don't cross-pollute. Transient failures fall back to 24 without caching.
    const FRAME_STEP_FALLBACK_FPS = 24;
    const _fpsCache = new Map();
    const _fpsInflight = new Map();
    let _frameOverlay = null;
    let _frameOverlayHideTimer = null;
    let _frameOverlayFadeTimer = null;
    const _fallbackFpsWarned = new Set();

    function pickFps(stream) {
        if (!stream) return null;
        const candidates = [stream.ReferenceFrameRate, stream.RealFrameRate, stream.AverageFrameRate];
        for (const c of candidates) {
            const n = parseFloat(c);
            if (Number.isFinite(n) && n >= 1 && n < 1000) return n;
        }
        return null;
    }

    function getActiveMediaSourceId(video) {
        try {
            const src = video?.currentSrc || video?.src || '';
            const q = src.indexOf('?');
            if (q === -1) return null;
            return new URLSearchParams(src.substring(q + 1)).get('MediaSourceId') || null;
        } catch (err) {
            console.warn('🪼 Jellyfin Enhanced: frame-step MediaSourceId parse failed', err);
            return null;
        }
    }

    async function fetchFpsForItem(itemId, activeMediaSourceId) {
        if (!itemId || !window.ApiClient) return null;
        try {
            const userId = window.ApiClient.getCurrentUserId();
            const item = await window.ApiClient.getItem(userId, itemId);
            const sources = Array.isArray(item?.MediaSources) ? item.MediaSources : [];
            const ordered = activeMediaSourceId
                ? [...sources.filter(s => s.Id === activeMediaSourceId), ...sources.filter(s => s.Id !== activeMediaSourceId)]
                : sources;
            for (const source of ordered) {
                const vs = source.MediaStreams?.find(s => s.Type === 'Video');
                const fps = pickFps(vs);
                if (fps) return fps;
            }
        } catch (err) {
            console.warn('🪼 Jellyfin Enhanced: frame-step fps lookup failed', err);
        }
        return null;
    }

    function getFpsCacheKey(itemId, video) {
        if (!itemId) return null;
        const msId = getActiveMediaSourceId(video);
        if (msId) return `${itemId}|ms:${msId}`;
        const src = (video?.currentSrc || video?.src || '').split('?')[0];
        return `${itemId}|src:${src}`;
    }

    async function resolveFps(video) {
        const itemId = getCurrentVideoItemId();
        const cacheKey = getFpsCacheKey(itemId, video);
        if (cacheKey && _fpsCache.has(cacheKey)) return _fpsCache.get(cacheKey);
        // Inflight keyed by itemId so presses before/after currentSrc populates share one fetch.
        if (itemId && _fpsInflight.has(itemId)) return _fpsInflight.get(itemId);

        const activeMediaSourceId = getActiveMediaSourceId(video);
        const promise = (async () => {
            const fetched = itemId ? await fetchFpsForItem(itemId, activeMediaSourceId) : null;
            const isReal = Number.isFinite(fetched) && fetched >= 1;
            const fps = isReal ? fetched : FRAME_STEP_FALLBACK_FPS;
            // Build write key from the source we fetched for, not getVideo() which may have swapped.
            const finalKey = itemId
                ? (activeMediaSourceId
                    ? `${itemId}|ms:${activeMediaSourceId}`
                    : `${itemId}|src:${(video?.currentSrc || video?.src || '').split('?')[0]}`)
                : null;
            if (finalKey && isReal) _fpsCache.set(finalKey, fps);
            if (!isReal && itemId && !_fallbackFpsWarned.has(itemId)) {
                try {
                    JE.toast(tWithFallback(
                        'toast_frame_step_fps_fallback',
                        'ℹ Frame step using fallback {fps} fps (actual rate unknown)',
                        { fps: FRAME_STEP_FALLBACK_FPS }
                    ));
                    _fallbackFpsWarned.add(itemId);
                } catch (err) {
                    console.warn('🪼 Jellyfin Enhanced: frame-step fallback toast failed', err);
                }
            }
            return fps;
        })();
        if (itemId) _fpsInflight.set(itemId, promise);
        try { return await promise; }
        finally { if (itemId) _fpsInflight.delete(itemId); }
    }

    function showFrameOverlay(text) {
        if (!_frameOverlay) {
            _frameOverlay = document.createElement('div');
            _frameOverlay.setAttribute('data-je-frame-overlay', 'true');
            _frameOverlay.style.cssText = `
                position: fixed; bottom: 18%; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.78); color: #fff; padding: 6px 14px; border-radius: 6px;
                font-size: 0.95em; font-weight: 600; z-index: 999999;
                pointer-events: none; font-family: system-ui;
                opacity: 0; transition: opacity 0.15s ease-out; display: none;
                white-space: nowrap;
            `;
            document.body.appendChild(_frameOverlay);
        }
        _frameOverlay.textContent = text;
        _frameOverlay.style.display = 'block';
        requestAnimationFrame(() => {
            if (_frameOverlay) _frameOverlay.style.opacity = '1';
        });

        if (_frameOverlayHideTimer) { clearTimeout(_frameOverlayHideTimer); _frameOverlayHideTimer = null; }
        if (_frameOverlayFadeTimer) { clearTimeout(_frameOverlayFadeTimer); _frameOverlayFadeTimer = null; }
        _frameOverlayHideTimer = setTimeout(() => {
            _frameOverlayHideTimer = null;
            if (!_frameOverlay) return;
            _frameOverlay.style.opacity = '0';
            _frameOverlayFadeTimer = setTimeout(() => {
                _frameOverlayFadeTimer = null;
                if (_frameOverlay && _frameOverlay.style.opacity === '0') {
                    _frameOverlay.style.display = 'none';
                }
            }, 200);
        }, 900);
    }

    JE.frameStep = async (direction) => {
      try {
        const video = getVideo();
        if (!video) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        if (!video.paused) {
            try {
                const r = video.pause();
                // pause() returns a Promise on Chromecast/MSE/PiP; swallow rejection.
                if (r && typeof r.catch === 'function') {
                    r.catch(err => console.warn('🪼 Jellyfin Enhanced: video.pause() rejected', err));
                }
            } catch (err) {
                console.warn('🪼 Jellyfin Enhanced: video.pause() threw', err);
            }
        }

        const fps = await resolveFps(video);
        const frameDuration = 1 / fps;
        const delta = direction === 'forward' ? frameDuration : -frameDuration;
        const upper = Number.isFinite(video.duration) ? video.duration : Infinity;
        const newTime = Math.max(0, Math.min(upper, video.currentTime + delta));
        video.currentTime = newTime;

        const arrow = direction === 'forward' ? '▶' : '◀';
        const frameNum = Math.max(0, Math.round(newTime * fps));
        const fpsLabel = Number.isInteger(fps) ? String(fps) : fps.toFixed(3).replace(/\.?0+$/, '');
        const text = tWithFallback(
            'toast_frame_step',
            '{arrow} Frame {frame}  ·  {fps} fps',
            { arrow, frame: frameNum, fps: fpsLabel }
        );
        showFrameOverlay(text);
      } catch (err) {
        console.warn('🪼 Jellyfin Enhanced: frameStep failed', err);
      }
    };


})(window.JellyfinEnhanced);
