// src/enhanced/pages/reorder.ts
//
// A small drag-and-drop reorder list for the navigation pages, used by the
// Enhanced Panel so each user can set their own page order. Rows are built from
// the registered pages (real labels + icons); dragging reorders them and calls
// back with the new id order. Kept dependency-free and self-styled so it drops
// into the panel without new markup plumbing.

import { JE } from '../../globals';
import { getPage, getRegisteredPages, pageLabel } from './registry';
import { resolveOrder } from './order';

const CSS_ID = 'je-pages-reorder-css';

function ensureCss(): void {
    JE.core.ui!.injectCss(CSS_ID, `
        .je-pages-reorder { display: flex; flex-direction: column; gap: 6px; }
        .je-pages-reorder-row {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 12px; border-radius: 8px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
            cursor: default; user-select: none;
        }
        .je-pages-reorder-row.je-dragging { opacity: 0.5; }
        .je-pages-reorder-row.je-drag-over { border-color: rgba(255,255,255,0.35); }
        .je-pages-reorder-handle {
            cursor: grab; color: rgba(255,255,255,0.5);
            display: flex; align-items: center;
        }
        .je-pages-reorder-handle:active { cursor: grabbing; }
        .je-pages-reorder-icon { color: rgba(255,255,255,0.75); font-size: 20px; }
        .je-pages-reorder-label { font-size: 14px; }
    `);
}

/** Current id order of the rows in a list container. */
function readOrder(list: HTMLElement): string[] {
    return Array.from(list.querySelectorAll<HTMLElement>('.je-pages-reorder-row'))
        .map((row) => row.dataset.pageId || '')
        .filter(Boolean);
}

function buildRow(id: string, list: HTMLElement, onChange: (ids: string[]) => void): HTMLElement | null {
    const def = getPage(id);
    if (!def) return null;

    const row = document.createElement('div');
    row.className = 'je-pages-reorder-row';
    row.dataset.pageId = id;
    row.draggable = true;

    const handle = document.createElement('span');
    handle.className = 'je-pages-reorder-handle material-icons';
    handle.setAttribute('aria-hidden', 'true');
    handle.textContent = 'drag_indicator';

    const icon = document.createElement('span');
    icon.className = 'je-pages-reorder-icon material-icons';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = def.icon;

    const label = document.createElement('span');
    label.className = 'je-pages-reorder-label';
    label.textContent = pageLabel(def);

    row.append(handle, icon, label);

    row.addEventListener('dragstart', (e) => {
        row.classList.add('je-dragging');
        e.dataTransfer?.setData('text/plain', id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragend', () => {
        row.classList.remove('je-dragging');
        list.querySelectorAll('.je-drag-over').forEach((el) => el.classList.remove('je-drag-over'));
        onChange(readOrder(list));
    });
    row.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = list.querySelector<HTMLElement>('.je-dragging');
        if (!dragging || dragging === row) return;
        const rect = row.getBoundingClientRect();
        const after = e.clientY > rect.top + rect.height / 2;
        list.insertBefore(dragging, after ? row.nextSibling : row);
    });
    row.addEventListener('dragenter', () => row.classList.add('je-drag-over'));
    row.addEventListener('dragleave', () => row.classList.remove('je-drag-over'));

    return row;
}

/**
 * Render the reorder list into `container` for the given resolved order and wire
 * drag reordering. `onChange` receives the new id order on every drop.
 * @returns The number of rows rendered (0 = no pages registered — hide the UI).
 */
export function buildPagesReorderList(
    container: HTMLElement,
    order: string[],
    onChange: (ids: string[]) => void
): number {
    ensureCss();
    container.textContent = '';
    container.classList.add('je-pages-reorder');

    const registered = new Set(getRegisteredPages().map((p) => p.id));
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of order) {
        if (registered.has(id) && !seen.has(id)) { seen.add(id); ids.push(id); }
    }
    for (const p of getRegisteredPages()) {
        if (!seen.has(p.id)) { seen.add(p.id); ids.push(p.id); }
    }

    let count = 0;
    for (const id of ids) {
        const row = buildRow(id, container, onChange);
        if (row) { container.appendChild(row); count++; }
    }
    return count;
}

/** The resolved order to seed the list with (user override → admin → registration). */
export function currentResolvedOrder(): string[] {
    return resolveOrder();
}
