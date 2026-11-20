import { esc } from './render';

export interface DialogOptions { title?: string | undefined; message?: string | undefined; confirmLabel?: string; cancelLabel?: string; danger?: boolean; otherLabel?: string }
/** Which button closed a dialog: confirm, the other choice (otherLabel), or cancel (also Escape). */
export type DialogChoice = 'confirm' | 'other' | 'cancel';
export interface AlertInput { title?: string; message?: string; text?: string; callback?: () => void }

/** Messages may carry a few trusted formatting tags; everything else is escaped. */
export function safeHtml(text: string | null | undefined): string {
    return esc(text ?? '')
        .replace(/&lt;(\/?(?:br|b|strong|em|i|code|ul|li|p))\s*\/?&gt;/gi, '<$1>')
        .replace(/\r?\n/g, '<br>');
}

let dialogCount = 0;

export function dialog(options: DialogOptions): Promise<boolean> {
    return choiceBox(options).then(choice => choice === 'confirm');
}

/** The dialog with up to three buttons: cancel, the other choice, and confirm. */
export function choiceBox({ title, message, confirmLabel, cancelLabel, danger, otherLabel }: DialogOptions): Promise<DialogChoice> {
    return new Promise(resolve => {
        const previous = document.activeElement;
        const id = 'jea-dialog-' + (++dialogCount);
        const wrap = document.createElement('div');
        wrap.className = 'jea-dialog-backdrop';
        wrap.innerHTML = `<div class="jea-dialog" role="${cancelLabel ? 'alertdialog' : 'dialog'}" aria-modal="true" aria-labelledby="${id}-title" aria-describedby="${id}-body">`
            + `<h3 class="jea-dialog-title" id="${id}-title">${esc(title || 'Message')}</h3>`
            + `<div class="jea-dialog-body" id="${id}-body">${safeHtml(message)}</div>`
            + `<div class="jea-dialog-actions">${cancelLabel ? `<button type="button" class="jea-btn" data-r="0">${esc(cancelLabel)}</button>` : ''}`
            + (otherLabel ? `<button type="button" class="jea-btn" data-r="2">${esc(otherLabel)}</button>` : '')
            + `<button type="button" class="jea-btn ${danger ? 'jea-btn-danger' : 'jea-btn-primary'}" data-r="1">${esc(confirmLabel || 'OK')}</button></div></div>`;
        const done = (value: DialogChoice): void => {
            document.removeEventListener('keydown', onKey, true);
            wrap.remove();
            if (previous instanceof HTMLElement) previous.focus();
            resolve(value);
        };
        // Modal: Escape cancels, and Tab / Shift+Tab stay on the dialog's own buttons.
        const onKey = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') { event.stopPropagation(); done('cancel'); return; }
            if (event.key !== 'Tab') return;
            const stops = Array.from(wrap.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'));
            const first = stops[0];
            const last = stops[stops.length - 1];
            if (!first || !last) return;
            const inside = wrap.contains(document.activeElement);
            if (event.shiftKey && (!inside || document.activeElement === first)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (!inside || document.activeElement === last)) { event.preventDefault(); first.focus(); }
        };
        wrap.addEventListener('click', event => {
            const target = event.target instanceof Element ? event.target : null;
            const button = target ? target.closest<HTMLElement>('[data-r]') : null;
            if (button) done(button.dataset.r === '1' ? 'confirm' : button.dataset.r === '2' ? 'other' : 'cancel');
            else if (target === wrap && !cancelLabel) done('confirm');
        });
        document.addEventListener('keydown', onKey, true);
        (document.getElementById('JellyfinEnhancedPage') || document.body).appendChild(wrap);
        // A confirmation starts on Cancel: every one here changes users, instances or caches, so Enter never confirms by accident.
        wrap.querySelector<HTMLElement>(cancelLabel ? '[data-r="0"]' : '[data-r="1"]')?.focus();
    });
}

export function alertBox(input: string | AlertInput | undefined): Promise<void> {
    const options: AlertInput = typeof input === 'string' ? { message: input } : (input ?? {});
    return dialog({ title: options.title, message: options.message || options.text }).then(() => {
        if (typeof options.callback === 'function') options.callback();
    });
}

export function confirmBox(message: string, title?: string, danger?: boolean): Promise<boolean> {
    return dialog({ title: title || 'Please confirm', message, confirmLabel: 'Confirm', cancelLabel: 'Cancel', danger: !!danger });
}
