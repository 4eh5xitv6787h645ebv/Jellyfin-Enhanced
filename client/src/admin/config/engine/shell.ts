import { setHash, slugOf } from './address';
import type { MountLifecycle } from './lifecycle';
import { syncMirrors } from './mirrors';

/** Sidebar groups. Tabs not listed (e.g. ones added by Custom Tabs) stay at the end, ungrouped. */
const NAV_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['Appearance', ['display', 'media-tags', 'elsewhere']],
    ['Behaviour', ['playback', 'pages', 'extras', 'keyboard']],
    ['Connections', ['services', 'seerr', 'arr']],
    ['Server', ['admin']],
    ['About', ['about', 'docs']],
];

const textOf = (element: Element): string => Array.from(element.childNodes).filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim();

function sectionTitle(fieldset: Element): string {
    const legend = fieldset.querySelector(':scope > legend');
    return legend ? textOf(legend) : '';
}

/** Focus mode: picking a card (or a group inside it) in the sidebar shows only that on screen; picking the tab itself shows everything. */
function showAll(tab: Element | null): void {
    if (!tab) return;
    const button = document.querySelector('.jellyfin-tab-button[data-tab="' + tab.id + '"]');
    if (button && button.nextElementSibling) button.nextElementSibling.querySelectorAll('.jea-nav-leaf.on').forEach(leaf => { leaf.classList.remove('on'); leaf.removeAttribute('aria-current'); });
    tab.querySelectorAll(':scope > .jea-crumb').forEach(crumb => crumb.remove());
    tab.classList.remove('jea-focused');
    setHash('card', null);
    tab.querySelectorAll(':scope > fieldset.jea-focus').forEach(fieldset => fieldset.classList.remove('jea-focus'));
}

/** Focus mode says what is shown and how to get the rest back: "Display › Spoiler Guard · Show all". */
function crumbFor(tab: Element, card: Element, group?: HTMLDetailsElement): void {
    tab.querySelectorAll(':scope > .jea-crumb').forEach(crumb => crumb.remove());
    const button = document.querySelector('.jellyfin-tab-button[data-tab="' + tab.id + '"]');
    const crumb = document.createElement('nav');
    crumb.className = 'jea-crumb';
    crumb.setAttribute('aria-label', 'Shown on this tab');
    const parts = [button ? textOf(button.querySelector('.je-tab-label') ?? button) : tab.id, sectionTitle(card)];
    if (group) parts.push((group.querySelector(':scope > summary')?.textContent ?? '').trim());
    const trail = document.createElement('span');
    trail.className = 'jea-crumb-trail';
    trail.textContent = parts.filter(Boolean).join(' \u203a ');
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'jea-btn jea-crumb-all';
    all.textContent = 'Show all';
    all.addEventListener('click', () => {
        if (button instanceof HTMLElement) button.click(); else showAll(tab);
        (button instanceof HTMLElement ? button : null)?.focus();
    });
    crumb.append(trail, all);
    tab.prepend(crumb);
}

function focusCard(tab: Element, card: Element, group?: HTMLDetailsElement): void {
    crumbFor(tab, card, group);
    tab.classList.add('jea-focused');
    tab.querySelectorAll(':scope > fieldset').forEach(fieldset => fieldset.classList.toggle('jea-focus', fieldset === card));
    if (group) {
        card.querySelectorAll<HTMLDetailsElement>('.jea-group').forEach(other => { other.open = other === group; });
        group.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function topGroups(card: Element): HTMLDetailsElement[] {
    return Array.from(card.querySelectorAll<HTMLDetailsElement>('.jea-group')).filter(group => !group.parentElement?.closest('.jea-group'));
}

/** Sidebar tree: under the active tab, one link per card on that tab. Clicking jumps to the card; the one in view is highlighted. */
function buildTree(bar: Element, lifecycle: MountLifecycle): void {
    const { signal } = lifecycle;
    bar.querySelectorAll<HTMLElement>('.jellyfin-tab-button').forEach(button => {
        const tab = document.getElementById(button.dataset.tab ?? '');
        if (!tab) return;
        button.addEventListener('click', () => showAll(tab), { signal });
        const cards = Array.from(tab.querySelectorAll(':scope > fieldset')).filter(card => sectionTitle(card));
        if (cards.length < 2) return;
        const tree = document.createElement('div');
        tree.className = 'jea-nav-tree';
        const open = (action: () => void): void => {
            if (button.classList.contains('active')) action();
            else { button.click(); lifecycle.timeout(action, 350); }
        };
        const mark = (leaf: Element, sub?: Element): void => {
            tree.querySelectorAll('.jea-nav-leaf').forEach(other => {
                const on = other === leaf || other === sub;
                other.classList.toggle('on', on);
                if (on && other === (sub ?? leaf)) other.setAttribute('aria-current', 'location'); else other.removeAttribute('aria-current');
            });
        };
        cards.forEach(card => {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'jea-nav-leaf';
            link.textContent = sectionTitle(card);
            link.addEventListener('click', event => {
                event.preventDefault();
                open(() => { focusCard(tab, card); mark(link); setHash('card', slugOf(link.textContent)); });
            }, { signal });
            tree.appendChild(link);
            const groups = topGroups(card);
            if (groups.length >= 2) {
                const sub = document.createElement('div');
                sub.className = 'jea-nav-subtree';
                groups.forEach(group => {
                    const subLink = document.createElement('a');
                    subLink.href = '#';
                    subLink.className = 'jea-nav-leaf jea-nav-sub';
                    subLink.textContent = (group.querySelector(':scope > summary')?.textContent ?? '').trim();
                    subLink.addEventListener('click', event => {
                        event.preventDefault();
                        open(() => { focusCard(tab, card, group); mark(link, subLink); setHash('card', slugOf(link.textContent)); });
                    }, { signal });
                    sub.appendChild(subLink);
                });
                tree.appendChild(sub);
            }
        });
        button.after(tree);
    });
    const search = document.getElementById('settingsSearchInput');
    if (search instanceof HTMLInputElement) {
        search.addEventListener('input', () => {
            if (search.value) document.querySelectorAll('.jellyfin-tab-content.jea-focused').forEach(showAll);
        }, { signal });
    }
}

/**
 * Show the card an address names (by slugOf its title) on the tab of the given sidebar button, as its sidebar entry
 * does. Only that tab's cards are looked at, so a card named for another tab opens nothing.
 */
export function openCard(button: Element | null | undefined, slug: string | null | undefined): void {
    const tree = button?.nextElementSibling;
    if (!slug || !tree || !tree.classList.contains('jea-nav-tree')) return;
    Array.from(tree.querySelectorAll<HTMLElement>(':scope > .jea-nav-leaf')).find(leaf => slugOf(leaf.textContent) === slug)?.click();
}

/**
 * Turn the horizontal tab strip into a grouped sidebar (a menu on phones). Moves existing nodes, so the
 * page's own tab, drag and search handlers keep working; they all look elements up by selector.
 */
export function mountShell(lifecycle: MountLifecycle): void {
    const { signal } = lifecycle;
    const bar = document.querySelector<HTMLElement>('.je-tab-bar');
    const header = document.querySelector('.je-sticky-header');
    const form = document.getElementById('JellyfinEnhancedForm');
    const parent = header?.parentNode;
    if (!bar || !header || !parent || !form || document.querySelector('.jea-layout')) return;
    const layout = document.createElement('div');
    layout.className = 'jea-layout';
    const nav = document.createElement('nav');
    nav.className = 'jea-nav';
    nav.setAttribute('aria-label', 'Settings sections');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'jea-nav-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-haspopup', 'dialog');
    // Not a second hamburger: it names the section shown and opens the list of sections.
    toggle.innerHTML = '<span class="jea-nav-kicker">Section</span><span class="jea-nav-current"></span><i class="material-icons jea-nav-chev" aria-hidden="true">unfold_more</i>';
    const main = document.createElement('div');
    main.className = 'jea-main';
    const version = document.querySelector('script[plugin="Jellyfin Enhanced"]')?.getAttribute('version');
    const title = header.querySelector('h2.sectionTitle');
    if (version && title && !title.querySelector('.jea-ver')) {
        const chip = document.createElement('span');
        chip.className = 'jea-ver';
        chip.textContent = 'v' + version.split('-')[0];
        title.appendChild(chip);
    }
    parent.insertBefore(layout, header.nextSibling);
    layout.append(nav, main);
    nav.append(toggle, bar);
    while (layout.nextSibling) main.appendChild(layout.nextSibling);

    // Insert a heading before each group's first tab and gather the group's other tabs after it, in listed order.
    NAV_GROUPS.forEach(([name, ids]) => {
        const buttons = ids.flatMap(id => {
            const button = bar.querySelector('[data-tab="' + id + '"]');
            return button ? [button] : [];
        });
        if (!buttons.length) return;
        const heading = document.createElement('div');
        heading.className = 'jea-nav-group';
        heading.textContent = name;
        bar.appendChild(heading);
        buttons.forEach(button => bar.appendChild(button));
    });
    // Overview (and anything unlisted) goes first.
    const grouped = new Set(NAV_GROUPS.flatMap(group => group[1]));
    Array.from(bar.querySelectorAll<HTMLElement>('.jellyfin-tab-button')).reverse().forEach(button => {
        if (!grouped.has(button.dataset.tab ?? '')) bar.prepend(button);
    });

    buildTree(bar, lifecycle);

    // Phone drawer: dimmed backdrop, a header with a close button, and the page behind is locked while it is open.
    const backdrop = document.createElement('div');
    backdrop.className = 'jea-nav-backdrop';
    nav.appendChild(backdrop);
    const head = document.createElement('div');
    head.className = 'jea-drawer-head';
    head.innerHTML = '<span>Settings sections</span><button type="button" class="jea-drawer-close" aria-label="Close sections"><i class="material-icons" aria-hidden="true">close</i></button>';
    bar.prepend(head);

    const locked: Array<{ element: HTMLElement; previous: string }> = [];
    const scrollParent = (): Element | null => {
        for (let node = nav.parentElement; node; node = node.parentElement) {
            const overflow = getComputedStyle(node).overflowY;
            if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
        }
        return document.scrollingElement;
    };
    const lock = (on: boolean): void => {
        if (on) {
            [scrollParent(), document.documentElement, document.body].forEach(element => {
                if (element instanceof HTMLElement && !locked.some(entry => entry.element === element)) {
                    locked.push({ element, previous: element.style.overflow });
                    element.style.overflow = 'hidden';
                }
            });
        } else {
            for (let entry = locked.pop(); entry; entry = locked.pop()) entry.element.style.overflow = entry.previous;
        }
    };
    // While the drawer is open the rest of the page is inert, so focus and screen readers stay in it.
    const inertTargets = (): HTMLElement[] => [main, header instanceof HTMLElement ? header : null].filter((el): el is HTMLElement => !!el);
    const setOpen = (open: boolean, restoreFocus = true): void => {
        const was = nav.classList.contains('jea-open');
        nav.classList.toggle('jea-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) bar.setAttribute('role', 'dialog'); else bar.removeAttribute('role');
        if (open) bar.setAttribute('aria-modal', 'true'); else bar.removeAttribute('aria-modal');
        if (open) bar.setAttribute('aria-label', 'Settings sections'); else bar.removeAttribute('aria-label');
        inertTargets().forEach(el => { el.inert = open; });
        lock(open);
        if (open && !was) (bar.querySelector<HTMLElement>('.jellyfin-tab-button.active') ?? head.querySelector<HTMLElement>('.jea-drawer-close'))?.focus();
        if (!open && was && restoreFocus) toggle.focus();
    };
    // Tab and Shift+Tab cycle inside the open drawer.
    bar.addEventListener('keydown', event => {
        if (event.key !== 'Tab' || !nav.classList.contains('jea-open')) return;
        const stops = Array.from(bar.querySelectorAll<HTMLElement>('button, a[href]')).filter(el => el.getClientRects().length > 0);
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }, { signal });
    // A view dropped with the drawer open must not leave the document scroll-locked.
    lifecycle.onDispose(() => { lock(false); inertTargets().forEach(el => { el.inert = false; }); });
    backdrop.addEventListener('click', () => setOpen(false), { signal });
    head.querySelector('.jea-drawer-close')?.addEventListener('click', () => setOpen(false), { signal });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && nav.classList.contains('jea-open')) setOpen(false);
    }, { signal });
    // Leaving the phone layout (rotate, resize) must not leave the page locked.
    window.addEventListener('resize', () => {
        if (nav.classList.contains('jea-open') && getComputedStyle(toggle).display === 'none') setOpen(false, false);
    }, { signal });

    // The sidebar scrolls inside itself: fade its bottom edge while there is more below, and its top once scrolled.
    const cue = (): void => {
        nav.classList.toggle('jea-more-below', nav.scrollHeight - nav.scrollTop - nav.clientHeight > 2);
        nav.classList.toggle('jea-more-above', nav.scrollTop > 2);
    };
    nav.addEventListener('scroll', cue, { passive: true, signal });
    window.addEventListener('resize', cue, { signal });
    if (typeof ResizeObserver !== 'undefined') lifecycle.track(new ResizeObserver(cue)).observe(bar);
    lifecycle.timeout(cue, 0);

    const label = (): void => {
        const active = bar.querySelector('.jellyfin-tab-button.active .je-tab-label');
        const current = toggle.querySelector('.jea-nav-current');
        if (current) current.textContent = active ? textOf(active) : 'Settings';
        toggle.setAttribute('aria-label', 'Settings sections, showing ' + (active ? textOf(active) : 'Settings'));
    };
    label();
    // A tab shown without a click (restored from the session, opened by an address or a link) relabels the phone menu too.
    lifecycle.track(new MutationObserver(label)).observe(bar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    toggle.addEventListener('click', () => setOpen(!nav.classList.contains('jea-open')), { signal });
    // Tab clicks are handled by the page; close the phone menu after the active class has moved.
    bar.addEventListener('click', event => {
        if (event.target instanceof Element && event.target.closest('.jea-drawer-head')) return;
        lifecycle.timeout(() => { label(); setOpen(false); syncMirrors(); cue(); }, 0);
    }, { signal });
}
