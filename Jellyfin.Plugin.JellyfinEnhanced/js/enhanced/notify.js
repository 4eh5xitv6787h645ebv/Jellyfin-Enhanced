// /js/enhanced/notify.js
// Phase 2: Unified notification API replacing ad-hoc JE.toast() calls
// for error/warning scenarios. Safe by default (text, not innerHTML).
//
// Usage:
//   JE.notify.info('Settings saved');
//   JE.notify.warn('Seerr connection slow');
//   JE.notify.error('Failed to load calendar', { detail: '503 from Sonarr' });
//   JE.notify.persistent('seerr-down', 'Seerr is unreachable', {
//       action: { label: 'Test connection', onClick: () => { ... } }
//   });
//
// Persistent notifications are keyed by id — calling with the same id
// replaces the existing notification instead of stacking.
(function(JE) {
    'use strict';

    var TOAST_DURATION_DEFAULT = 3000;
    var persistentNotifications = new Map();
    var styleInjected = false;

    function injectStyles() {
        if (styleInjected) return;
        styleInjected = true;
        var style = document.createElement('style');
        style.id = 'je-notify-styles';
        style.textContent = [
            '.je-notify { position: fixed; bottom: 20px; right: 20px; z-index: 999999;',
            '  display: flex; flex-direction: column; gap: 8px; pointer-events: none; max-width: 400px; }',
            '.je-notify-item { pointer-events: auto; padding: 12px 16px; border-radius: 8px;',
            '  font-size: 14px; line-height: 1.4; color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.4);',
            '  display: flex; align-items: flex-start; gap: 10px; animation: je-notify-in 0.3s ease; }',
            '.je-notify-item.info { background: rgba(0,164,220,0.95); }',
            '.je-notify-item.warn { background: rgba(255,152,0,0.95); }',
            '.je-notify-item.error { background: rgba(220,53,69,0.95); }',
            '.je-notify-item .je-notify-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }',
            '.je-notify-item .je-notify-body { flex: 1; }',
            '.je-notify-item .je-notify-title { font-weight: 600; margin-bottom: 2px; }',
            '.je-notify-item .je-notify-detail { opacity: 0.85; font-size: 12px; margin-top: 4px; }',
            '.je-notify-item .je-notify-action { margin-top: 6px; }',
            '.je-notify-item .je-notify-action a { color: #fff; text-decoration: underline; cursor: pointer; font-weight: 600; }',
            '.je-notify-item .je-notify-close { cursor: pointer; opacity: 0.7; font-size: 16px; flex-shrink: 0; }',
            '.je-notify-item .je-notify-close:hover { opacity: 1; }',
            '@keyframes je-notify-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }',
        ].join('\n');
        document.head.appendChild(style);
    }

    function getContainer() {
        var container = document.getElementById('je-notify-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'je-notify-container';
            container.className = 'je-notify';
            document.body.appendChild(container);
        }
        return container;
    }

    function createNotificationElement(level, message, options) {
        options = options || {};
        var el = document.createElement('div');
        el.className = 'je-notify-item ' + level;

        // Icon
        var icons = { info: 'info', warn: 'warning', error: 'error' };
        var iconSpan = document.createElement('span');
        iconSpan.className = 'je-notify-icon material-icons';
        iconSpan.textContent = icons[level] || 'info';
        el.appendChild(iconSpan);

        // Body
        var body = document.createElement('div');
        body.className = 'je-notify-body';
        var title = document.createElement('div');
        title.className = 'je-notify-title';
        title.textContent = message; // Safe: textContent, not innerHTML
        body.appendChild(title);

        if (options.detail) {
            var detail = document.createElement('div');
            detail.className = 'je-notify-detail';
            detail.textContent = options.detail; // Safe
            body.appendChild(detail);
        }

        if (options.action) {
            var actionDiv = document.createElement('div');
            actionDiv.className = 'je-notify-action';
            var link = document.createElement('a');
            link.textContent = options.action.label || 'Action';
            link.addEventListener('click', function(e) {
                e.preventDefault();
                if (typeof options.action.onClick === 'function') options.action.onClick();
            });
            actionDiv.appendChild(link);
            body.appendChild(actionDiv);
        }

        el.appendChild(body);

        // Close button
        var closeBtn = document.createElement('span');
        closeBtn.className = 'je-notify-close material-icons';
        closeBtn.textContent = 'close';
        closeBtn.addEventListener('click', function() { el.remove(); });
        el.appendChild(closeBtn);

        return el;
    }

    function show(level, message, options) {
        injectStyles();
        options = options || {};
        var container = getContainer();
        var duration = typeof options.duration === 'number' ? options.duration : (
            JE.pluginConfig?.ToastDuration || TOAST_DURATION_DEFAULT
        );

        var el = createNotificationElement(level, message, options);
        container.appendChild(el);

        if (duration > 0) {
            setTimeout(function() { if (el.parentNode) el.remove(); }, duration);
        }
    }

    /**
     * Show a persistent notification keyed by id. Calling again with the
     * same id replaces the existing notification (no stacking). Stays
     * visible until explicitly dismissed or replaced.
     */
    function persistent(id, message, options) {
        injectStyles();
        options = options || {};
        var container = getContainer();

        // Remove existing with same id
        if (persistentNotifications.has(id)) {
            var old = persistentNotifications.get(id);
            if (old.parentNode) old.remove();
        }

        var el = createNotificationElement(options.level || 'error', message, options);
        el.dataset.notifyId = id;
        container.appendChild(el);
        persistentNotifications.set(id, el);

        // Override close to also remove from map
        var closeBtn = el.querySelector('.je-notify-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                persistentNotifications.delete(id);
            });
        }
    }

    /**
     * Dismiss a persistent notification by id.
     */
    function dismiss(id) {
        if (persistentNotifications.has(id)) {
            var el = persistentNotifications.get(id);
            if (el.parentNode) el.remove();
            persistentNotifications.delete(id);
        }
    }

    /**
     * Parse a ProblemDetails (RFC 7807) response and show as an error
     * notification. Falls back to a generic error message if the response
     * isn't a valid ProblemDetails object.
     */
    function fromProblemDetails(response) {
        if (!response || typeof response !== 'object') {
            show('error', 'An unexpected error occurred');
            return;
        }
        var title = response.title || response.message || 'Error';
        var detail = response.detail || response.error || '';
        show('error', title, { detail: detail, duration: 8000 });
    }

    JE.notify = {
        info: function(msg, opts) { show('info', msg, opts); },
        warn: function(msg, opts) { show('warn', msg, opts); },
        error: function(msg, opts) { show('error', msg, opts); },
        persistent: persistent,
        dismiss: dismiss,
        fromProblemDetails: fromProblemDetails
    };

})(window.JellyfinEnhanced);
