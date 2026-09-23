// /js/elsewhere/elsewhere.js
/**
 * @file Manages the "Jellyfin Elsewhere" feature to find streaming providers.
 */
(function(JE) {
    'use strict';

    /**
     * Initializes the Jellyfin Elsewhere script.
     * It will only run if the server reports TMDB is configured.
     */
    JE.initializeElsewhereScript = function() {
        if (!JE.pluginConfig.ElsewhereEnabled) {
            console.log('🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere: Feature is disabled in plugin settings.');
            return;
        }
        // --- Configuration ---
        const TmdbEnabled = !!JE.pluginConfig.TmdbEnabled;
        const DEFAULT_REGION = JE.pluginConfig.DEFAULT_REGION || 'US';

        if (!TmdbEnabled) {
            console.log('🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere: TMDB is not configured, skipping initialization');
            return;
        }

        const settings = JE.elsewhereSettings.create(DEFAULT_REGION);
        const { createSettingsModal } = settings;

        console.log('🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere starting...');

        const { fetchStreamingData } = JE.elsewhereApi.create();
        const { autoLoadStreamingData } = JE.elsewherePanel.create(settings, fetchStreamingData);

        // Add buttons to detail pages
        function addStreamingLookup() {
            const detailSections = document.querySelectorAll('.detailSectionContent');

            detailSections.forEach(section => {
                // Skip if already processed
                if (section.querySelector('.streaming-lookup-container')) return;

                // Look for TMDB link to get ID and media type
                const tmdbLinks = section.querySelectorAll('a[href*="themoviedb.org"]');
                if (tmdbLinks.length === 0) return;

                const tmdbLink = tmdbLinks[0];
                const match = tmdbLink.href.match(/themoviedb\.org\/(movie|tv)\/(\d+)/);
                if (!match) return;

                const mediaType = match[1];
                const tmdbId = match[2];

                // Create container
                const container = document.createElement('div');
                container.className = 'streaming-lookup-container';
                container.style.cssText = 'margin: 16px 0;';

                // Auto-load streaming data for default region
                autoLoadStreamingData(tmdbId, mediaType, container);

                // Insert after external links or at the end
                const externalLinks = section.querySelector('.itemExternalLinks');
                if (externalLinks) {
                    externalLinks.parentNode.insertBefore(container, externalLinks.nextSibling);
                } else {
                    section.appendChild(container);
                }
            });
        }
        // --- Initialization ---
        settings.initialize();

        // Use deferred initialization with requestIdleCallback
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => createSettingsModal(), { timeout: 2000 });
        } else {
            setTimeout(createSettingsModal, 2000);
        }

        // Replace polling with MutationObserver for better performance
        let processingElsewhere = false;
        JE.helpers.createObserver('elsewhere', () => {
            if (!processingElsewhere) {
                processingElsewhere = true;
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => {
                        addStreamingLookup();
                        processingElsewhere = false;
                    }, { timeout: 500 });
                } else {
                    setTimeout(() => {
                        addStreamingLookup();
                        processingElsewhere = false;
                    }, 100);
                }
            }
        }, document.body, {
            childList: true,
            subtree: true,
            attributeFilter: ['class']
        });

        // Initial check
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => addStreamingLookup(), { timeout: 1000 });
        } else {
            setTimeout(addStreamingLookup, 1000);
        }

        console.log('🪼 Jellyfin Enhanced: 🎬 Jellyfin Elsewhere loaded!');
    };

})(window.JellyfinEnhanced);
