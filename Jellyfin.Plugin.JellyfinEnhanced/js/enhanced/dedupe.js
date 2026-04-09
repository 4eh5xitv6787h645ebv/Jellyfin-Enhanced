// /js/enhanced/dedupe.js
// Phase 3: Generic request deduplication helper.
// Prevents multiple concurrent fetches for the same resource by coalescing
// callers behind a single in-flight promise. Optional TTL cache for the
// resolved value so subsequent calls in a short window skip the network
// entirely.
//
// Usage:
//   const data = await JE.dedupe('tmdb-movie-603', () => fetchTmdb(603));
//   // Second call within TTL returns the cached value without fetching.
//   // Second call while the first is still in-flight returns the same promise.
(function(JE) {
    'use strict';

    var inFlight = new Map(); // key → Promise
    var cache = new Map();    // key → { value, ts }
    var DEFAULT_TTL_MS = 30000; // 30s default cache TTL
    var MAX_CACHE_SIZE = 500;  // cap to prevent unbounded growth in long sessions

    // Periodic sweep: every 60s, evict entries older than DEFAULT_TTL_MS.
    // Prevents unbounded memory growth in long-running SPA sessions with
    // diverse keys (e.g. tmdb-movie-{id} per item browsed).
    setInterval(function() {
        var now = Date.now();
        cache.forEach(function(entry, key) {
            if (now - entry.ts >= DEFAULT_TTL_MS) cache.delete(key);
        });
    }, 60000);

    /**
     * Deduplicate an async operation by key.
     *
     * @param {string} key - Unique identifier for this request
     * @param {Function} fn - Async function that performs the actual work.
     *   Called only if no in-flight request or cached value exists for this key.
     * @param {object} [options]
     * @param {number} [options.ttlMs=30000] - How long to cache the resolved
     *   value. Set to 0 to disable caching (dedup only).
     * @param {boolean} [options.forceRefresh=false] - Bypass cache and in-flight
     *   dedup. Use when the caller knows the data is stale.
     * @returns {Promise<any>} The resolved value.
     */
    async function dedupe(key, fn, options) {
        options = options || {};
        var ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_TTL_MS;

        if (!options.forceRefresh) {
            // Check TTL cache first
            if (ttlMs > 0 && cache.has(key)) {
                var entry = cache.get(key);
                if (Date.now() - entry.ts < ttlMs) {
                    return entry.value;
                }
                cache.delete(key);
            }

            // Check in-flight dedup
            if (inFlight.has(key)) {
                return inFlight.get(key);
            }
        }

        var promise = fn().then(function(value) {
            inFlight.delete(key);
            if (ttlMs > 0) {
                // Enforce size cap: evict oldest entry if at limit
                if (cache.size >= MAX_CACHE_SIZE) {
                    var oldestKey = cache.keys().next().value;
                    cache.delete(oldestKey);
                }
                cache.set(key, { value: value, ts: Date.now() });
            }
            return value;
        }).catch(function(err) {
            inFlight.delete(key);
            throw err;
        });

        inFlight.set(key, promise);
        return promise;
    }

    /**
     * Invalidate a cached entry by key.
     * @param {string} key
     */
    function invalidate(key) {
        cache.delete(key);
    }

    /**
     * Clear all cached entries. Useful on config change.
     */
    function clearAll() {
        cache.clear();
    }

    JE.dedupe = dedupe;
    JE.dedupe.invalidate = invalidate;
    JE.dedupe.clearAll = clearAll;

})(window.JellyfinEnhanced);
