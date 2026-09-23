/**
 * @file Captures the stable position before a seek and implements jump back.
 * Depends on playback.js.
 */
(function(JE) {
    'use strict';

    const { getVideo, tWithFallback } = JE.internals.player;

    // --- Jump Back  ---
    // Track the last "stable" playback position via timeupdate (fires ~4x/sec
    // while playing). When a seek starts we snapshot that stable value — not
    // video.currentTime inside the seeking event
    // A guard flag prevents the jump-back action itself from overwriting the saved position.
    let _lastStablePosition = null;   // updated continuously during normal playback
    let _lastPositionBeforeSeek = null; // snapshotted at seek start
    let _jumpingBack = false;

    /**
     * Attaches timeupdate + seeking listeners to the given video element to track
     * the last known position before each seek. Safe to call multiple times — the
     * listeners are stored on the element and only attached once.
     * @param {HTMLVideoElement} video
     */
    JE.attachSeekTracker = (video) => {
        if (!video || video._jeSeekTrackerAttached) return;

        // Keep a rolling record of where we actually are during normal playback
        video.addEventListener('timeupdate', () => {
            if (_jumpingBack) return;
            if (!video.seeking && Number.isFinite(video.currentTime) && video.currentTime > 0) {
                _lastStablePosition = video.currentTime;
            }
        });

        video.addEventListener('seeking', () => {
            if (_jumpingBack) return;
            if (_lastStablePosition !== null) {
                _lastPositionBeforeSeek = _lastStablePosition;
            }
        });

        video._jeSeekTrackerAttached = true;
    };

    /**
     * Jumps back to the position captured just before the last seek.
     */
    JE.jumpToLastPosition = () => {
        const video = getVideo();
        if (!video) {
            JE.toast(JE.t('toast_no_video_found'));
            return;
        }
        if (_lastPositionBeforeSeek === null) {
            JE.toast(tWithFallback('toast_no_last_position', '{{icon:rewind}} No previous position saved'));
            return;
        }
        const targetTime = _lastPositionBeforeSeek;
        _lastPositionBeforeSeek = null; // consume it so repeated presses don't loop
        _jumpingBack = true;
        _lastStablePosition = null;    // reset so it re-accumulates after the jump
        video.currentTime = targetTime;
        setTimeout(() => { _jumpingBack = false; }, 500);

        const mins = Math.floor(targetTime / 60);
        const secs = Math.floor(targetTime % 60).toString().padStart(2, '0');
        JE.toast(tWithFallback('toast_jumped_back', '{{icon:rewind}} Jumped back to {time}', { time: `${mins}:${secs}` }));
    };


})(window.JellyfinEnhanced);
