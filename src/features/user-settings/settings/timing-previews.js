/** Feature settings and its private editor state. */
function createUserSettingsTimingPreviews({ lifecycle }) {
    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        // Shortcuts Panel & Toast timing previews — lets admins see how long
        // their chosen durations feel without leaving the settings page. Both
        // previews read the CURRENT (unsaved) input value so you can tweak the
        // number, click preview, and immediately see the result.
        //   - Shortcuts panel preview: full-screen overlay with a live countdown
        //     that self-dismisses at the configured delay (Esc / click-outside /
        //     Close-now also dismiss).
        //   - Toast preview: replicates the in-app toast styling at bottom-center
        //     and fades out at the configured duration.
        (function wireTimingPreviews() {
            var panelBtn = document.getElementById('jeTestShortcutsPanel');
            var toastBtn = document.getElementById('jeTestToast');
            var panelInput = document.getElementById('HelpPanelAutocloseDelay');
            var toastInput = document.getElementById('ToastDuration');

            // Clamp to a sane window: at least 200 ms (anything shorter is a flash
            // that the user can't see), at most 120 s (prevents stuck overlays
            // from fat-fingered values). Fallback if the field is blank/invalid.
            function readMs(input, fallback) {
                var raw = parseInt(input && input.value, 10);
                if (!Number.isFinite(raw) || raw < 200) return fallback;
                return Math.min(raw, 120000);
            }

            function fmtSeconds(ms) {
                return (ms / 1000).toFixed(1) + 's';
            }

            // Active-preview cleanup tracking — otherwise repeated clicks leak
            // setIntervals, setTimeouts, and document-level keydown listeners
            // because simply removing the prior overlay's DOM node never calls
            // its enclosing cleanup() closure.
            var _activePanelPreviewCleanup = null;
            const previewToasts = new Set();
            lifecycle.onDispose(() => {
                if (_activePanelPreviewCleanup) _activePanelPreviewCleanup();
                previewToasts.forEach((toast) => toast.remove());
                previewToasts.clear();
            });

            if (panelBtn && panelInput) {
                lifecycle.listen(panelBtn, 'click', function () {
                    // Dismiss any previous preview FULLY — cleanup clears the
                    // interval/timeout/keydown handler in addition to removing
                    // the DOM node.
                    if (_activePanelPreviewCleanup) _activePanelPreviewCleanup();

                    var ms = readMs(panelInput, 15000);
                    var overlay = document.createElement('div');
                    overlay.className = 'je-preview-panel-overlay';

                    var card = document.createElement('div');
                    card.className = 'je-preview-panel-card';

                    var title = document.createElement('div');
                    title.className = 'je-preview-panel-title';
                    title.innerHTML =
                        '<i class="material-icons" aria-hidden="true">keyboard</i>Shortcuts Panel preview';
                    card.appendChild(title);

                    var body = document.createElement('div');
                    body.className = 'je-preview-panel-body';
                    var countdown = document.createElement('span');
                    countdown.className = 'je-preview-panel-countdown';
                    countdown.textContent = fmtSeconds(ms);
                    body.appendChild(
                        document.createTextNode('This is how long the real shortcuts/settings panel (opened with the '),
                    );
                    var kbd = document.createElement('kbd');
                    kbd.textContent = '?';
                    body.appendChild(kbd);
                    body.appendChild(
                        document.createTextNode(
                            ' key in the main Jellyfin UI) will stay open without interaction. Auto-closes in ',
                        ),
                    );
                    body.appendChild(countdown);
                    body.appendChild(document.createTextNode('.'));
                    card.appendChild(body);

                    var actions = document.createElement('div');
                    actions.className = 'je-preview-panel-actions';
                    var closeBtn = document.createElement('button');
                    closeBtn.type = 'button';
                    closeBtn.className = 'emby-button raised raised-mini';
                    closeBtn.textContent = 'Close now';
                    actions.appendChild(closeBtn);
                    card.appendChild(actions);

                    // Minimal dialog-style a11y: screen readers announce as dialog,
                    // title serves as accessible name, closeBtn gets initial focus.
                    overlay.setAttribute('role', 'dialog');
                    overlay.setAttribute('aria-modal', 'true');
                    title.id = 'je-preview-panel-title';
                    overlay.setAttribute('aria-labelledby', 'je-preview-panel-title');
                    overlay.appendChild(card);
                    document.body.appendChild(overlay);
                    try {
                        closeBtn.focus();
                    } catch (e) {
                        /* focus may fail in rare host conditions */
                    }

                    var startTs = Date.now();
                    var isActive = true;
                    var intervalId = lifecycle.setInterval(function () {
                        if (!isActive) return;
                        var remaining = Math.max(0, ms - (Date.now() - startTs));
                        countdown.textContent = fmtSeconds(remaining);
                        if (remaining <= 0) cleanup();
                    }, 100);
                    var timeoutId = lifecycle.setTimeout(cleanup, ms);

                    function cleanup() {
                        if (!isActive) return;
                        isActive = false;
                        lifecycle.clearInterval(intervalId);
                        lifecycle.clearTimeout(timeoutId);
                        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                        document.removeEventListener('keydown', onKey);
                        if (_activePanelPreviewCleanup === cleanup) _activePanelPreviewCleanup = null;
                    }
                    function onKey(e) {
                        if (e.key === 'Escape') {
                            e.stopPropagation();
                            cleanup();
                        }
                    }
                    lifecycle.listen(closeBtn, 'click', cleanup);
                    lifecycle.listen(overlay, 'click', function (e) {
                        if (e.target === overlay) cleanup();
                    });
                    lifecycle.listen(document, 'keydown', onKey, undefined, 'dismiss-panel-preview');
                    _activePanelPreviewCleanup = cleanup;
                });
            }

            if (toastBtn && toastInput) {
                lifecycle.listen(toastBtn, 'click', function () {
                    // Clear any prior preview toasts AND their still-pending timers
                    // (otherwise rapid-fire clicks leave detached toasts with pending
                    // slide-in/out/remove setTimeouts that would fire against removed
                    // DOM — harmless but wasteful).
                    document.querySelectorAll('.je-preview-toast').forEach(function (el) {
                        if (el._jeShowTimer) lifecycle.clearTimeout(el._jeShowTimer);
                        if (el._jeHideTimer) lifecycle.clearTimeout(el._jeHideTimer);
                        if (el._jeRemoveTimer) lifecycle.clearTimeout(el._jeRemoveTimer);
                        el.remove();
                        previewToasts.delete(el);
                    });
                    var ms = readMs(toastInput, 3000);
                    var toast = document.createElement('div');
                    toast.className = 'je-preview-toast';
                    toast.setAttribute('role', 'status');
                    toast.setAttribute('aria-live', 'polite');
                    toast.textContent = 'Example toast, disappears in ' + fmtSeconds(ms);
                    document.body.appendChild(toast);
                    previewToasts.add(toast);
                    // Mirror real JE.toast(): slide in from the right after a tick,
                    // stay for `ms`, then slide back out by removing the .je-shown class.
                    toast._jeShowTimer = lifecycle.setTimeout(function () {
                        toast.classList.add('je-shown');
                    }, 10);
                    toast._jeHideTimer = lifecycle.setTimeout(function () {
                        toast.classList.remove('je-shown');
                        toast._jeRemoveTimer = lifecycle.setTimeout(function () {
                            if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
                            previewToasts.delete(toast);
                        }, 350);
                    }, ms);
                });
            }
        })();
    }
    return { initialize, dispose: () => lifecycle.dispose() };
}
