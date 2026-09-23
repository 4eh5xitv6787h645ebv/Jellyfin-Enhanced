/**
 * @file Temporary playback speed boost and pointer gesture lifecycle.
 * Depends on playback.js.
 */
(function(JE) {
    'use strict';

    const { getVideo } = JE.internals.player;

    // --- Long Press Speed Control ---
    const LONG_PRESS_CONFIG = {
        DURATION: 500,
        SPEED_NORMAL: 1.0,
        SPEED_FAST: 2.0,
        MOVEMENT_THRESHOLD: 10, // pixels - ignore small movements
    };

    let pressTimer = null;
    let isLongPress = false;
    let videoElement = null;
    let originalSpeed = LONG_PRESS_CONFIG.SPEED_NORMAL;
    let speedOverlay = null;
    let pressStartX = null;
    let pressStartY = null;

    function createSpeedOverlay() {
        if (speedOverlay) return;
        speedOverlay = document.createElement('div');
        speedOverlay.setAttribute('data-speed-overlay', 'true');
        speedOverlay.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.9); color: white; padding: 8px 16px; border-radius: 6px;
            font-size: 1.2em; font-weight: bold; z-index: 999999;
            pointer-events: none; font-family: system-ui;
            opacity: 0; transition: opacity 0.2s ease-out; display: none;
        `;
        document.body.appendChild(speedOverlay);
    }

    function showOverlay(speed) {
        createSpeedOverlay();
        speedOverlay.innerHTML = `${speed}x${speed > 1 ? ' ' + JE.icon(JE.IconName.FAST_FORWARD) : ' ' + JE.icon(JE.IconName.PLAY)}`;
        speedOverlay.style.display = 'block';
        setTimeout(() => speedOverlay.style.opacity = '1', 10);
    }

    function hideOverlay() {
        if (speedOverlay) {
            speedOverlay.style.opacity = '0';
            setTimeout(() => speedOverlay.style.display = 'none', 200);
        }
    }

    JE.handleLongPressDown = (e) => {
        if (!JE.currentSettings.longPress2xEnabled || (e.button !== undefined && e.button !== 0) || pressTimer) {
            return;
        }
        videoElement = getVideo();
        if (!videoElement) return;

        // Store initial press position
        pressStartX = e.clientX || e.touches?.[0]?.clientX;
        pressStartY = e.clientY || e.touches?.[0]?.clientY;

        originalSpeed = videoElement.playbackRate || LONG_PRESS_CONFIG.SPEED_NORMAL;
        isLongPress = false;

        pressTimer = setTimeout(() => {
            if (JE.state.pauseScreenClickTimer) {
                clearTimeout(JE.state.pauseScreenClickTimer);
                JE.state.pauseScreenClickTimer = null;
            }
            isLongPress = true;
            // Make sure video is playing when we activate speed boost
            if (videoElement.paused) {
                videoElement.play().catch(err => console.warn("🪼 Play blocked:", err));
            }
            videoElement.playbackRate = LONG_PRESS_CONFIG.SPEED_FAST;
            showOverlay(LONG_PRESS_CONFIG.SPEED_FAST);
            if (navigator.vibrate) navigator.vibrate(50);
        }, LONG_PRESS_CONFIG.DURATION);
    };

    JE.handleLongPressUp = (e) => {
        if (!pressTimer) return;
        clearTimeout(pressTimer);
        pressTimer = null;

        if (isLongPress) {
            const video = getVideo();
            if (video) {
                video.playbackRate = originalSpeed;
            }
            hideOverlay();
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
        isLongPress = false;
        pressStartX = null;
        pressStartY = null;
    };

    JE.handleLongPressCancel = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
            if (isLongPress) {
                const video = getVideo();
                if (video) {
                    video.playbackRate = originalSpeed;
                }
                hideOverlay();
            }
            isLongPress = false;
        }
        pressStartX = null;
        pressStartY = null;
    };

    // Handle mouse movement during press to detect drag/scrub
    JE.handleLongPressMove = (e) => {
        if (!pressTimer || isLongPress || !pressStartX || !pressStartY) return;

        const currentX = e.clientX || e.touches?.[0]?.clientX;
        const currentY = e.clientY || e.touches?.[0]?.clientY;

        if (currentX === null || currentY === null) return;

        const distanceMoved = Math.sqrt(
            Math.pow(currentX - pressStartX, 2) + Math.pow(currentY - pressStartY, 2)
        );

        // If user moves more than threshold, cancel the long press (likely a drag attempt)
        if (distanceMoved > LONG_PRESS_CONFIG.MOVEMENT_THRESHOLD) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pressStartX = null;
            pressStartY = null;
        }
    };

    // Block click events that would pause/play when doing a long press
    JE.handleLongPressClick = (e) => {
        // If long press is just completed OR user is still holding (timer active),
        // prevent the click from pausing the video
        if (isLongPress || pressTimer) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return;
        }
    };

})(window.JellyfinEnhanced);
