import type { PageModules } from './modules';
import { formControls, isCheckable } from './dom';
import { asHtml } from './dom';

/** The parts of the Navigation API (window.navigation) this module uses; absent in some browsers. */
interface NavigationLike extends EventTarget { traverseTo(key: string): unknown }
interface NavigateEventLike extends Event { navigationType: string; hashChange: boolean; destination: { url: string; key: string } }

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type DirtyDeps = Pick<PageModules, 'context' | 'save' | 'shortcuts'>;

export function createDirty(m: DirtyDeps) {
    const { form, lifecycle, JEAdmin } = m.context;

            // Unsaved-changes indicator: diffs a snapshot of every form control against the last saved snapshot.
            const saveDock = asHtml(document.querySelector('.je-save-dock'));

            let _jeSavedSnapshot: string | null = null;

            function jeSnapshotFormState() : string {
                const parts = [];
                formControls(form).forEach((el, i) => {
                    if (el.type === 'file') return; // can't be read back, and not part of the saved config shape
                    if (el.closest('.je-arr-seerr-import-picker')) return; // transient browsing state, not a form change until actually imported
                    if (el.closest('.je-spoiler-apply-existing')) return; // per-run option of an action, not a saved setting
                    const key = el.id || el.name || ('#' + i);
                    parts.push(key + '=' + (isCheckable(el) ? el.checked : el.value));
                });
                // shortcutOverrides is JS state, not bound to persistent <input> elements.
                parts.push('shortcuts=' + JSON.stringify(m.shortcuts.shortcutOverrides));
                return parts.join('');
            }

            /** Call once the form reflects a known-saved state. */
            function jeMarkSaved() : void {
                _jeSavedSnapshot = jeSnapshotFormState();
                leaving = false;
                jeUpdateDirtyIndicator();
            }

            function jeUpdateDirtyIndicator() : void {
                const dirty = _jeSavedSnapshot !== null && jeSnapshotFormState() !== _jeSavedSnapshot;
                if (saveDock) saveDock.classList.toggle('je-dirty', dirty);
            }

            function isDirty() : boolean {
                jeUpdateDirtyIndicator();
                return !!saveDock && saveDock.classList.contains('je-dirty');
            }

            // ── Leaving inside Jellyfin with unsaved changes ──────────────────────────
            // Jellyfin cannot be asked to wait (its viewbeforehide comes after the route changed), so a link out of
            // this page is held at the click, before Jellyfin's router sees it. Back, Forward and a changed address
            // reach the router by popstate, whose listener on window runs before any the page can add; where the
            // browser has the Navigation API they are held at its cancelable navigate event, which comes first.
            /** The page's route (hash path and its name parameter), read when the page started. */
            let pageRoute: { path: string; name: string | null } | null = null;
            /** The administrator chose to leave: the navigation that follows is let through. */
            let leaving = false;

            function routeOf(url: URL): { path: string; name: string | null } {
                const hash = url.hash.replace(/^#!?/, '');
                const q = hash.indexOf('?');
                return { path: q < 0 ? hash : hash.slice(0, q), name: q < 0 ? null : new URLSearchParams(hash.slice(q + 1)).get('name') };
            }

            /** True for an address in this web client that is not this page (another document unloads: beforeunload asks). */
            function leavesInApp(href: string) : boolean {
                if (!pageRoute) return false;
                let url: URL;
                try { url = new URL(href, location.href); } catch { return false; }
                if (url.origin !== location.origin || url.pathname !== location.pathname) return false;
                const to = routeOf(url);
                return to.path !== pageRoute.path || to.name !== pageRoute.name;
            }

            /** Save, Discard or Stay. Resolves true to go on; a save that failed or was refused keeps the page (it says why). */
            async function askToLeave() : Promise<boolean> {
                const choice = await JEAdmin.choose({ title: 'Unsaved changes', message: 'Your changes on this page are not saved.', confirmLabel: 'Save', otherLabel: 'Discard', cancelLabel: 'Stay' });
                if (choice !== 'confirm') return choice === 'other';
                return m.save.saveConfig(new Event('submit')).catch(() => false);
            }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {
            form.addEventListener('input', jeUpdateDirtyIndicator);

            form.addEventListener('change', jeUpdateDirtyIndicator);

            // Fallback poll for structural changes that don't fire input/change (adding/removing a row).
            lifecycle.interval(jeUpdateDirtyIndicator, 1000);

            window.addEventListener('beforeunload', (e) => {
                if (!saveDock || !saveDock.classList.contains('je-dirty')) return;
                e.preventDefault();
                e.returnValue = '';
            }, { signal: lifecycle.signal });

            pageRoute = routeOf(new URL(location.href));
            // Links (Jellyfin's drawer and header, the What's new links): capture runs before the router's own handler.
            document.addEventListener('click', (e) => {
                if (leaving || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                const link = e.target instanceof Element ? e.target.closest('a[href]') : null;
                if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || !leavesInApp(link.href) || !isDirty()) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                void askToLeave().then((go) => { if (go) { leaving = true; link.click(); } });
            }, { capture: true, signal: lifecycle.signal });
            // Back, Forward and a changed address (not the router's own pushState: its state has moved on by then).
            const navigation = (window as { navigation?: NavigationLike }).navigation;
            navigation?.addEventListener('navigate', (event) => {
                const e = event as NavigateEventLike;
                if (leaving || !e.cancelable || !(e.navigationType === 'traverse' || e.hashChange) || !leavesInApp(e.destination.url) || !isDirty()) return;
                e.preventDefault();
                void askToLeave().then((go) => {
                    if (!go) return;
                    leaving = true;
                    if (e.navigationType === 'traverse') navigation.traverseTo(e.destination.key);
                    else location.href = e.destination.url;
                });
            }, { signal: lifecycle.signal });
    }

    return {
        wire,
        jeMarkSaved,
    };
}
