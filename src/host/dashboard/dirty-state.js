/** Dashboard dirty state boundary. */
function createDashboardDirtyState({ lifecycle, form, getShortcutOverrides }) {
    // Unsaved-changes indicator: diffs a snapshot of every form control against the last saved snapshot.
    const saveDock = document.querySelector('.je-save-dock');

    let _jeSavedSnapshot = null;

    function jeSnapshotFormState() {
        const parts = [];
        form.querySelectorAll('input, select, textarea').forEach((el, i) => {
            if (el.type === 'file') return; // can't be read back, and not part of the saved config shape
            if (el.closest('.je-arr-seerr-import-picker')) return; // transient browsing state, not a form change until actually imported
            const key = el.id || el.name || '#' + i;
            parts.push(key + '=' + (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value));
        });
        // getShortcutOverrides() is JS state, not bound to persistent <input> elements.
        parts.push('shortcuts=' + JSON.stringify(getShortcutOverrides()));
        return parts.join('');
    }

    /** Call once the form reflects a known-saved state. */
    function jeMarkSaved() {
        _jeSavedSnapshot = jeSnapshotFormState();
        jeUpdateDirtyIndicator();
    }

    function jeUpdateDirtyIndicator() {
        const dirty = _jeSavedSnapshot !== null && jeSnapshotFormState() !== _jeSavedSnapshot;
        if (saveDock) saveDock.classList.toggle('je-dirty', dirty);
    }

    let initialized = false;
    function initialize() {
        if (initialized) return;
        initialized = true;
        lifecycle.listen(form, 'input', jeUpdateDirtyIndicator);

        lifecycle.listen(form, 'change', jeUpdateDirtyIndicator);

        // Fallback poll for structural changes that don't fire input/change (adding/removing a row).
        lifecycle.setInterval(jeUpdateDirtyIndicator, 1000);

        lifecycle.listen(window, 'beforeunload', (e) => {
            if (!saveDock || !saveDock.classList.contains('je-dirty')) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }
    return { jeMarkSaved, initialize, dispose: () => lifecycle.dispose() };
}
