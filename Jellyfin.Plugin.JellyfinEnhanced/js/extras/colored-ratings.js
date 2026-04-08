// /js/extras/colored-ratings.js
// Applies color-coded backgrounds to media ratings on item details page

(function() {
    'use strict';

    // Hoisted so initialize() can register listeners via ctx.listen() and
    // the URL observer can re-subscribe on re-init. Previously the URL
    // observer was set up once at IIFE load and never re-subscribed after
    // teardown, so after one off/on cycle SPA navigations stopped triggering
    // rating refresh.
    var _ctx = window.JellyfinEnhanced?.helpers?.createModuleContext('colored-ratings');

    const CONFIG = {
        targetSelector: '.mediaInfoOfficialRating',
        attributeName: 'rating',
        fallbackInterval: 1000,
        debounceDelay: 100,
        maxRetries: 3,
        cssUrl: 'https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Enhanced@main/css/ratings.css',
        cssId: 'jellyfin-ratings-style'
    };

    let observer = null;
    let urlObserverHandle = null;
    let fallbackTimer = null;
    let debounceTimer = null;
    let processedElements = new WeakSet();

    function isFeatureEnabled() {
        return Boolean(window?.JellyfinEnhanced?.pluginConfig?.ColoredRatingsEnabled);
    }

    function injectCSS() {
        if (document.getElementById(CONFIG.cssId)) return;

        try {
            const linkElement = document.createElement('link');
            linkElement.id = CONFIG.cssId;
            linkElement.rel = 'stylesheet';
            linkElement.type = 'text/css';
            linkElement.href = CONFIG.cssUrl;
            document.head.appendChild(linkElement);
        } catch (error) {
            console.error('🪼 Jellyfin Enhanced: Failed to inject ratings CSS', error);
        }
    }


    function processRatingElements() {
        try {
            const elements = document.querySelectorAll(CONFIG.targetSelector);
            let processedCount = 0;

            elements.forEach((element, index) => {
                if (processedElements.has(element)) {
                    const currentRating = element.textContent?.trim();
                    const existingRating = element.getAttribute(CONFIG.attributeName);
                    if (currentRating === existingRating) {
                        return;
                    }
                }

                const ratingText = element.textContent?.trim();
                if (ratingText && ratingText.length > 0) {
                    const normalizedRating = normalizeRating(ratingText);

                    if (element.getAttribute(CONFIG.attributeName) !== normalizedRating) {
                        element.setAttribute(CONFIG.attributeName, normalizedRating);
                        processedElements.add(element);
                        processedCount++;

                        if (!element.getAttribute('aria-label')) {
                            element.setAttribute('aria-label', `Content rated ${normalizedRating}`);
                        }
                        if (!element.getAttribute('title')) {
                            element.setAttribute('title', `Rating: ${normalizedRating}`);
                        }
                    }
                }
            });

        } catch (error) {
            console.error('🪼 Jellyfin Enhanced: Error processing rating elements', error);
        }
    }

    function normalizeRating(rating) {
        if (!rating) return '';

        let normalized = rating.replace(/\s+/g, ' ').trim().toUpperCase();

        const ratingMappings = {
            'NOT RATED': 'NR',
            'NOT-RATED': 'NR',
            'UNRATED': 'NR',
            'NO RATING': 'NR',
            'APPROVED': 'APPROVED',
            'PASSED': 'PASSED'
        };

        return ratingMappings[normalized] || rating.trim();
    }

    function debouncedProcess() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(processRatingElements, CONFIG.debounceDelay);
    }

    function setupMutationObserver() {
        if (!window.MutationObserver) return false;

        try {
            const JE = window.JellyfinEnhanced;
            const callback = (mutations) => {
                let shouldProcess = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                if (node.matches && node.matches(CONFIG.targetSelector)) {
                                    shouldProcess = true;
                                } else if (node.querySelector && node.querySelector(CONFIG.targetSelector)) {
                                    shouldProcess = true;
                                }
                            }
                        });
                    }

                    if (mutation.type === 'characterData' || mutation.type === 'childList') {
                        const target = mutation.target;
                        if (target.nodeType === Node.ELEMENT_NODE &&
                            (target.matches(CONFIG.targetSelector) || target.closest(CONFIG.targetSelector))) {
                            shouldProcess = true;
                        }
                    }
                });

                if (shouldProcess) {
                    debouncedProcess();
                }
            };

            // Uses characterData so needs a dedicated observer via createObserver
            if (JE?.helpers?.createObserver) {
                observer = JE.helpers.createObserver(
                    'colored-ratings',
                    callback,
                    document.body,
                    { childList: true, subtree: true, characterData: true, characterDataOldValue: false }
                );
            } else {
                observer = new MutationObserver(callback);
                observer.observe(document.body, {
                    childList: true,
                    subtree: true,
                    characterData: true,
                    characterDataOldValue: false
                });
            }

            return true;

        } catch (error) {
            console.error('🪼 Jellyfin Enhanced: Failed to setup ratings observer', error);
            return false;
        }
    }

    function setupFallbackPolling() {
        // Don't start polling if we're actively playing video
        if (isVideoPlaying()) {
            return;
        }
        fallbackTimer = setInterval(processRatingElements, CONFIG.fallbackInterval);
    }

    function isOnVideoPage() {
        // Check if we're on the video player page
        if (typeof window.JellyfinEnhanced?.isVideoPage === 'function') {
            return window.JellyfinEnhanced.isVideoPage();
        }
        // Fallback check
        return window.location.hash.startsWith('#/video') || !!document.querySelector('.videoPlayerContainer');
    }

    function isVideoPlaying() {
        // Check if we're on the video player page AND the video is actively playing
        if (!isOnVideoPage()) {
            return false;
        }

        // Check if pause screen is visible (pause screen has osdInfo visible)
        const pauseScreen = document.querySelector('.videoOsdBottom');
        if (pauseScreen && getComputedStyle(pauseScreen).display !== 'none' && getComputedStyle(pauseScreen).opacity !== '0') {
            // Pause screen is visible - allow polling
            return false;
        }

        // Check if video element exists and is playing
        const video = document.querySelector('video');
        if (!video) {
            return false;
        }

        return !video.paused;
    }

    function pausePolling() {
        if (fallbackTimer) {
            clearInterval(fallbackTimer);
            fallbackTimer = null;
        }
    }

    function resumePolling() {
        if (!fallbackTimer && isFeatureEnabled() && !isVideoPlaying()) {
            fallbackTimer = setInterval(processRatingElements, CONFIG.fallbackInterval);
        }
    }

    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (urlObserverHandle) {
            urlObserverHandle.unsubscribe();
            urlObserverHandle = null;
        }
        if (fallbackTimer) {
            clearInterval(fallbackTimer);
            fallbackTimer = null;
        }
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
        }
        processedElements = new WeakSet();
    }

    let lastUrl = location.href;
    const JE = window.JellyfinEnhanced;

    function initialize() {
        if (!isFeatureEnabled()) {
            cleanup();
            return;
        }
        cleanup();
        injectCSS();
        processRatingElements();
        setupMutationObserver();
        setupFallbackPolling();

        // Register the SPA URL-change watcher INSIDE initialize() so re-init
        // after a teardown re-subscribes it. Re-calling onBodyMutation with
        // the same id is a safe replace (helpers.js dedups by id), so this
        // doesn't accumulate observers on re-init.
        if (JE?.helpers?.onBodyMutation) {
            urlObserverHandle = JE.helpers.onBodyMutation('colored-ratings-url-watcher', () => {
                const url = location.href;
                if (url !== lastUrl) {
                    lastUrl = url;
                    if (isFeatureEnabled()) {
                        setTimeout(initialize, 500);
                    }
                }
            });
        }
    }

    // [R1] visibilitychange listener is registered ONCE at module load via
    // raw addEventListener — NOT via _ctx.listen(). Reasoning:
    //   - Registering inside initialize() would stack listeners on every
    //     SPA re-init (URL watcher calls initialize() on every navigation).
    //   - Using _ctx.listen() at IIFE scope (what CF4 tried) breaks on
    //     teardown: ctx.teardown() clears listeners and re-init doesn't
    //     re-add them because the IIFE runs once.
    //   - Raw addEventListener at IIFE scope is always-on, but the handler
    //     gates on isFeatureEnabled() so it's inert when the feature is
    //     disabled. Cost is ~1 no-op function call per tab refocus — fine.
    if (typeof document.visibilityState !== 'undefined') {
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible' && isFeatureEnabled()) {
                setTimeout(processRatingElements, 100);
            }
        });
    }

    if (_ctx) {
        _ctx.dom('#' + CONFIG.cssId);
        _ctx.onTeardown(function() {
            cleanup();
            document.querySelectorAll('[' + CONFIG.attributeName + ']').forEach(function(el) {
                el.removeAttribute(CONFIG.attributeName);
                el.removeAttribute('aria-label');
            });
        });
    }

    if (window.JellyfinEnhanced) {
        window.JellyfinEnhanced.initializeColoredRatings = initialize;
        // Expose pause/resume functions for pausescreen.js to control
        window.JellyfinEnhanced.pauseRatingsPolling = pausePolling;
        window.JellyfinEnhanced.resumeRatingsPolling = resumePolling;
    }

    // Register with module lifecycle system
    if (window.JellyfinEnhanced?.moduleRegistry) {
        window.JellyfinEnhanced.moduleRegistry.register('colored-ratings', {
            configKeys: ['ColoredRatingsEnabled'],
            init: initialize,
            teardown: _ctx ? _ctx.teardown : function() { cleanup(); }
        });
    }

})();