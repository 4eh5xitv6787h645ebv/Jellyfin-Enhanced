// Admin broadcast form. Each controller owns and disposes its UI state and timer.
(function (JE) {
    'use strict';

    JE.internals = JE.internals || {};
    const internal = JE.internals.activeStreams = JE.internals.activeStreams || {};

    internal.createBroadcast = function () {
        // ── Broadcast ────────────────────────────────────────────────────────────
        let _broadcastFormOpen = false;
        let _broadcastCollapseTimer = null;

        const injectBroadcastButton = (panel) => {
            if (!panel) return;
            if (panel.querySelector('.je-as-broadcast-btn')) return;

            const header = panel.querySelector('.je-as-panel-header');
            if (!header) return;

            // ── Compose form ──────────────────
            const form = document.createElement('div');
            form.className = 'je-as-broadcast-form';

            // Title field
            const headerLabel = document.createElement('div');
            headerLabel.className = 'je-as-broadcast-field-label';
            headerLabel.textContent = 'Title (optional)';

            const headerInput = document.createElement('input');
            headerInput.type = 'text';
            headerInput.className = 'je-as-broadcast-input';
            headerInput.placeholder = 'e.g. Server Message';
            headerInput.maxLength = 200;

            // Message field
            const messageLabel = document.createElement('div');
            messageLabel.className = 'je-as-broadcast-field-label';
            messageLabel.textContent = 'Message (required)';

            const textArea = document.createElement('textarea');
            textArea.className = 'je-as-broadcast-textarea';
            textArea.placeholder = 'e.g. Server shutting down in 10 minutes';
            textArea.maxLength = 1000;

            // Warning note — below both fields
            const headerNote = document.createElement('div');
            headerNote.className = 'je-as-broadcast-field-note';
            headerNote.textContent = '⚠ Title may not show on all clients (web UI). Message is always visible.';

            // Timeout row
            const timeoutRow = document.createElement('div');
            timeoutRow.className = 'je-as-broadcast-timeout-row';
            const timeoutLabel = document.createElement('span');
            timeoutLabel.className = 'je-as-broadcast-timeout-label';
            timeoutLabel.textContent = 'Timeout (s):';
            const timeoutInput = document.createElement('input');
            timeoutInput.type = 'number';
            timeoutInput.className = 'je-as-broadcast-timeout-input';
            timeoutInput.value = '10';
            timeoutInput.min = '1';
            timeoutInput.max = '3600';
            timeoutRow.appendChild(timeoutLabel);
            timeoutRow.appendChild(timeoutInput);

            const resultEl = document.createElement('div');
            resultEl.className = 'je-as-broadcast-result';

            const actions = document.createElement('div');
            actions.className = 'je-as-broadcast-actions';

            const sendBtn = document.createElement('button');
            sendBtn.className = 'je-as-broadcast-send';
            sendBtn.textContent = 'Send';

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'je-as-broadcast-cancel';
            cancelBtn.textContent = 'Cancel';

            actions.appendChild(cancelBtn);
            actions.appendChild(sendBtn);

            form.appendChild(headerLabel);
            form.appendChild(headerInput);
            form.appendChild(messageLabel);
            form.appendChild(textArea);
            form.appendChild(headerNote);
            form.appendChild(timeoutRow);
            form.appendChild(resultEl);
            form.appendChild(actions);

            // ── Broadcast icon button ────────────────────────────────────────────
            const broadcastBtn = document.createElement('button');
            broadcastBtn.className = 'je-as-broadcast-btn';
            broadcastBtn.setAttribute('aria-label', 'Broadcast message to all sessions');
            broadcastBtn.title = 'Broadcast message';
            const broadcastIcon = document.createElement('span');
            broadcastIcon.className = 'material-icons';
            broadcastIcon.style.fontSize = '18px';
            broadcastIcon.textContent = 'campaign';
            broadcastBtn.appendChild(broadcastIcon);

            // Insert button before the close button
            const closeBtn = header.querySelector('.je-as-panel-close');
            header.insertBefore(broadcastBtn, closeBtn);

            // Insert form between header and body
            const body = panel.querySelector('.je-as-panel-body');
            panel.insertBefore(form, body);

            // ── Event wiring ─────────────────────────────────────────────────────
            broadcastBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleBroadcastForm(broadcastBtn, form, resultEl, textArea, headerInput, timeoutInput);
            });

            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                collapseBroadcastForm(broadcastBtn, form, resultEl, textArea, headerInput, timeoutInput);
            });

            sendBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const text = textArea.value.trim();
                if (!text) {
                    textArea.focus();
                    return;
                }
                const header = headerInput.value.trim() || undefined;
                const secs = parseFloat(timeoutInput.value) || 10;
                const timeoutMs = Math.round(secs * 1000);

                sendBtn.disabled = true;
                resultEl.className = 'je-as-broadcast-result';
                resultEl.textContent = '';

                await sendBroadcast(header, text, timeoutMs, resultEl);

                sendBtn.disabled = false;

                // Auto-collapse after 3 s
                if (_broadcastCollapseTimer) clearTimeout(_broadcastCollapseTimer);
                _broadcastCollapseTimer = setTimeout(() => {
                    collapseBroadcastForm(broadcastBtn, form, resultEl, textArea, headerInput, timeoutInput);
                }, 3000);
            });
        };

        const toggleBroadcastForm = (btn, form, resultEl, textArea, headerInput, timeoutInput) => {
            _broadcastFormOpen = !_broadcastFormOpen;
            btn.classList.toggle('je-as-broadcast-active', _broadcastFormOpen);
            form.classList.toggle('je-as-broadcast-form-open', _broadcastFormOpen);
            if (_broadcastFormOpen) {
                resultEl.className = 'je-as-broadcast-result';
                resultEl.textContent = '';
                textArea.value = '';
                headerInput.value = '';
                timeoutInput.value = '10';
                textArea.focus();
            }
        };

        const collapseBroadcastForm = (btn, form, resultEl, textArea, headerInput, timeoutInput) => {
            _broadcastFormOpen = false;
            btn.classList.remove('je-as-broadcast-active');
            form.classList.remove('je-as-broadcast-form-open');
            resultEl.className = 'je-as-broadcast-result';
            resultEl.textContent = '';
            textArea.value = '';
            headerInput.value = '';
            timeoutInput.value = '10';
        };

        const sendBroadcast = async (header, text, timeoutMs, resultEl) => {
            try {
                // skipRetry: broadcasting is not idempotent — never auto-repeat it.
                const data = await JE.core.api.plugin('/active-streams/broadcast', {
                    method: 'POST',
                    body: { header: header || null, text, timeoutMs },
                    skipRetry: true
                });
                const errNote = data.errors?.length ? ` (${data.errors.length} error${data.errors.length > 1 ? 's' : ''})` : '';
                resultEl.className = 'je-as-broadcast-result je-as-broadcast-ok';
                resultEl.textContent = `Sent to ${data.sent} of ${data.sent + data.skipped} sessions${errNote}`;
            } catch (err) {
                resultEl.className = 'je-as-broadcast-result je-as-broadcast-err';
                if (err && err.status) {
                    // HTTP error: surface the response body like the old
                    // `await resp.text()` path did.
                    resultEl.textContent = `Error: ${err.responseText || err.message}`;
                } else {
                    resultEl.textContent = `Failed: ${err.message}`;
                }
            }
        };

        return {
            inject: injectBroadcastButton,
            destroy() {
                if (_broadcastCollapseTimer) {
                    clearTimeout(_broadcastCollapseTimer);
                    _broadcastCollapseTimer = null;
                }
                _broadcastFormOpen = false;
            }
        };
    };
})(window.JellyfinEnhanced);
