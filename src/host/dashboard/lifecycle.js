/** Own the listeners, observers and scheduled work for one dashboard module. */
function createDashboardLifecycle() {
    let disposed = false;
    const listeners = []; // Compatibility fallback for hosts without event signals.
    let bindings = new WeakMap();
    let eventController;
    if (typeof AbortController === 'function' && typeof window.addEventListener === 'function') {
        const controller = new AbortController();
        const probe = () => {};
        let supported = false;
        try {
            window.addEventListener('je-lifecycle-probe', probe, {
                get signal() {
                    supported = true;
                    return controller.signal;
                },
            });
            window.removeEventListener('je-lifecycle-probe', probe);
            if (supported) eventController = controller;
        } catch (_) {
            controller.abort();
        }
    }
    const timeouts = new Set();
    const intervals = new Set();
    const frames = new Set();
    const observers = new Set();
    const cleanups = new Set();

    function listen(target, type, callback, options, binding) {
        if (disposed || !target) return;
        // A load can refresh a handler's config closure. Replace that binding on
        // that element; unrelated handlers for the same event remain intact.
        let targetBindings = bindings.get(target);
        if (!targetBindings) {
            targetBindings = new Map();
            bindings.set(target, targetBindings);
        }
        let eventBindings = targetBindings.get(type);
        if (!eventBindings) {
            eventBindings = new Map();
            targetBindings.set(type, eventBindings);
        }
        const key = binding === undefined ? callback : binding;
        const previous = eventBindings.get(key);
        if (previous) {
            target.removeEventListener(type, previous.callback, previous.options);
            const index = listeners.indexOf(previous);
            if (index !== -1) listeners.splice(index, 1);
        }
        const entry = { target, type, callback, options, binding };
        eventBindings.set(key, entry);
        if (eventController) {
            // Native event ownership and weak target keys avoid retaining rows
            // removed by editors that redraw repeatedly during a page session.
            const eventOptions = typeof options === 'boolean' ? { capture: options } : { ...options };
            target.addEventListener(type, callback, { ...eventOptions, signal: eventController.signal });
        } else {
            target.addEventListener(type, callback, options);
            listeners.push(entry);
        }
    }

    function schedule(callback, delay, args, repeat) {
        if (disposed) return undefined;
        const collection = repeat ? intervals : timeouts;
        const id = (repeat ? window.setInterval : window.setTimeout)(() => {
            if (!repeat) collection.delete(id);
            if (!disposed) callback(...args);
        }, delay);
        collection.add(id);
        return id;
    }

    return {
        get disposed() {
            return disposed;
        },
        listen,
        onDispose(callback) {
            if (disposed) callback();
            else cleanups.add(callback);
        },
        setTimeout: (callback, delay, ...args) => schedule(callback, delay, args, false),
        clearTimeout(id) {
            window.clearTimeout(id);
            timeouts.delete(id);
        },
        setInterval: (callback, delay, ...args) => schedule(callback, delay, args, true),
        clearInterval(id) {
            window.clearInterval(id);
            intervals.delete(id);
        },
        requestAnimationFrame(callback) {
            if (disposed) return undefined;
            const id = window.requestAnimationFrame((time) => {
                frames.delete(id);
                if (!disposed) callback(time);
            });
            frames.add(id);
            return id;
        },
        cancelAnimationFrame(id) {
            window.cancelAnimationFrame(id);
            frames.delete(id);
        },
        createObserver(callback) {
            const observer = new MutationObserver((...args) => {
                if (!disposed) callback(...args);
            });
            observers.add(observer);
            return observer;
        },
        dispose() {
            if (disposed) return;
            disposed = true;
            if (eventController) eventController.abort();
            listeners.forEach(({ target, type, callback, options }) =>
                target.removeEventListener(type, callback, options),
            );
            listeners.length = 0;
            bindings = new WeakMap();
            timeouts.forEach((id) => window.clearTimeout(id));
            intervals.forEach((id) => window.clearInterval(id));
            frames.forEach((id) => window.cancelAnimationFrame(id));
            observers.forEach((observer) => observer.disconnect());
            cleanups.forEach((callback) => {
                try {
                    callback();
                } catch (error) {
                    console.warn('[JE] Dashboard cleanup failed:', error);
                }
            });
            cleanups.clear();
            timeouts.clear();
            intervals.clear();
            frames.clear();
            observers.clear();
        },
    };
}
