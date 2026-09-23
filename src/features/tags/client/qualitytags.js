// /js/tags/qualitytags.js
// Jellyfin Quality Tags
// This is a modified version of the Jellyfin Quality Tags script by by BobHasNoSoul. - https://github.com/BobHasNoSoul/Jellyfin-Qualitytags/
//
// A spec over the core tag-renderer factory (js/core/tag-renderer-base.js),
// which owns the cache/ignore/tagged/CSS/reinitialize plumbing. The quality
// analysis and presentation policy live in quality-analysis.js and quality-policy.js.
// This adapter owns only DOM rendering and the quality-specific cache integration.
(function (JE) {
    'use strict';

    const logPrefix = '🪼 Jellyfin Enhanced: Quality Tags:';
    const overlayClass = 'quality-overlay-label';
    const containerClass = 'quality-overlay-container';

    const { getEnhancedQuality } = JE.tags.qualityAnalysis;
    const { normalizeQualityLabel, selectLabels, classForLabel, qualityColors } = JE.tags.qualityPolicy;

    // Computed quality labels derived from server cache entries
    const serverQualityCache = new Map();

    /**
     * Creates a single quality tag element.
     * @param {string} label The text for the tag (e.g., "4K", "HDR").
     * @returns {HTMLElement} The created div element for the tag.
     */
    function createResponsiveLabel(label) {
        const normalizedLabel = normalizeQualityLabel(label);
        const badge = document.createElement('div');
        badge.textContent = label;
        badge.className = overlayClass;

        badge.classList.add(classForLabel(normalizedLabel));
        badge.dataset.quality = normalizedLabel;
        return badge;
    }

    /**
     * Renders the quality tag overlay onto a poster card
     * @param {Object} ctx - Factory context (tagged/overlay helpers).
     * @param {HTMLElement} container - The card element to receive the overlay
     * @param {Array<string>} qualities - Detected quality tags, unfiltered
     */
    function insertOverlay(ctx, container, qualities) {
        if (!container) return;

        // Remove any old tags before adding new ones
        ctx.removeExistingOverlay(container);

        const labels = selectLabels(qualities, JE.currentSettings || {});
        if (labels.length === 0) {
            // Allow a future settings change to rebuild an empty overlay.
            const card = container.closest('.card');
            if (card?.dataset) delete card.dataset[ctx.taggedAttr];
            return;
        }

        // Ensure container is positioned (avoids forced reflow from getComputedStyle)
        container.style.position = 'relative';

        const qualityContainer = document.createElement('div');
        qualityContainer.className = containerClass;

        for (const label of labels) {
            qualityContainer.appendChild(createResponsiveLabel(label));
        }

        ctx.commitOverlay(container, qualityContainer);
    }

    /** @type {Object} Factory spec — quality-specific config and renderers. */
    const spec = {
        logPrefix,
        settingKey: 'qualityTagsEnabled',
        containerClass,
        taggedAttr: 'jeQualityTagged',
        styleId: 'quality-tag-enhanced-style',
        position: { userKey: 'qualityTagsPosition', pluginKey: 'QualityTagsPosition', fallback: 'top-left' },
        cache: {
            // Static cache key (not version-based) to persist across plugin updates
            key: 'JellyfinEnhanced-qualityTagsCache',
            legacyPrefix: 'qualityOverlayCache',
            hotBucket: 'quality',
            pruneOnSave: true,
        },
        buildCss() {
            // Generate CSS rules from the color configuration
            const rules = Object.entries(qualityColors).map(([k, v]) => {
                return `.${containerClass} .${overlayClass}[data-quality="${k}"] {
                    background: ${v.bg} !important;
                    color: ${v.text} !important;
                }`;
            }).join("\n");

            const pos = JE.core.tagRenderer.resolvePosition('qualityTagsPosition', 'QualityTagsPosition', 'top-left');

            return `
                .${containerClass} {
                    position: absolute;
                    top: ${pos.topVal};
                    right: ${pos.rightVal};
                    bottom: ${pos.bottomVal};
                    left: ${pos.leftVal};
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    align-items: ${pos.isLeft ? 'flex-start' : 'flex-end'};
                    z-index: 100;
                    max-width: calc(100% - 12px);
                    max-height: 90%;
                    overflow: hidden;
                    pointer-events: none;
                }
                ${pos.needsTopRightOffset ? `.cardImageContainer .cardIndicators ~ .${containerClass} { margin-top: clamp(20px, 3vw, 30px); }` : ''}
                .${overlayClass} {
                    font-weight: bold;
                    border-radius: 5px;
                    padding: 2px 10px;
                    font-size: clamp(0.65rem, 2vw, 0.85rem);
                    user-select: none;
                    pointer-events: none;
                    font-variant-caps: small-caps;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                    border: 1px solid rgba(255,255,255,0.15);
                    /* backdrop-filter removed — blur causes jank during hover animations */
                    opacity: 1;
                    transform: translateY(0);
                    white-space: nowrap;
                    flex-shrink: 0;
                    line-height: 1.2;
                }
                .layout-mobile .${overlayClass} {
                    padding: 0px 6px;
                    font-size: 0.65rem;
                    border-radius: 3px;
                }
                .layout-mobile .${containerClass} {
                    gap: 2px;
                }
                @media (min-width: 1440px) {
                    .${overlayClass} {
                        padding: 3px 12px;
                        font-size: 0.9rem;
                        border-radius: 6px;
                    }
                    .${containerClass} {
                        gap: 6px;
                    }
                }
                @media (max-width: 768px) {
                    .${overlayClass} {
                        padding: 0px 6px;
                        font-size: 0.65rem;
                        border-radius: 3px;
                    }
                    .${containerClass} {
                        gap: 1px;
                    }
                }
                @media (max-width: 480px) {
                    .${overlayClass} {
                        padding: 0px 5px;
                        font-size: 0.6rem;
                        border-radius: 2px;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    }
                    .${containerClass} {
                        gap: 1px;
                        max-height: 85%;
                    }
                }
                /* Generic style for low resolution content */
                .${containerClass} .${overlayClass}[data-quality="LOW-RES"] {
                    background: rgba(128, 128, 128, 0.8) !important;
                    color: #ffffff !important;
                }
                ${rules}
            `;
        },
        pipeline: {
            needsFirstEpisode: true,
            needsParentSeries: false,
            render(ctx, el, item, extras) {
                if (ctx.shouldIgnore(el)) return;
                if (ctx.isTagged(el)) return;
                // Skip cards hidden by hidden-content module
                if (el.closest('.je-hidden')) return;

                const itemId = item.Id;
                // Check hot cache first
                const hot = ctx.hot?.get(itemId);
                if (hot && (Date.now() - hot.timestamp) < ctx.cacheTtl) {
                    insertOverlay(ctx, el, hot.qualities);
                    return;
                }

                let qualities = [];
                if (item.Type === 'Series' || item.Type === 'Season') {
                    if (extras.firstEpisode) {
                        qualities = getEnhancedQuality(extras.firstEpisode.MediaStreams, extras.firstEpisode.MediaSources, extras.firstEpisode);
                    }
                } else {
                    qualities = getEnhancedQuality(item.MediaStreams, item.MediaSources, item);
                }

                if (qualities.length > 0) {
                    ctx.setPersistent(itemId, { qualities, timestamp: Date.now() });
                    ctx.hot?.set(itemId, { qualities, timestamp: Date.now() });
                    insertOverlay(ctx, el, qualities);
                }
            },
            renderFromCache(ctx, el, itemId) {
                if (ctx.isTagged(el)) return true;
                if (ctx.shouldIgnore(el)) return true;
                if (el.closest('.je-hidden')) return true;
                const hot = ctx.hot?.get(itemId);
                const cached = hot || ctx.getPersistent(itemId);
                if (cached && cached.qualities && cached.qualities.length > 0) {
                    insertOverlay(ctx, el, cached.qualities);
                    return true;
                }
                return false;
            },
            renderFromServerCache(ctx, el, entry, itemId) {
                if (ctx.isTagged(el)) return;
                if (ctx.shouldIgnore(el)) return;
                // Check local computed cache first (avoids re-running quality detection)
                const cached = serverQualityCache.get(itemId);
                if (cached !== undefined) {
                    if (cached.length > 0) insertOverlay(ctx, el, cached);
                    return;
                }
                const sd = entry.StreamData;
                if (!sd || !sd.Streams) { serverQualityCache.set(itemId, []); return; }
                const qualities = getEnhancedQuality(sd.Streams, sd.Sources, { Name: sd.ItemName, Path: sd.ItemPath });
                serverQualityCache.set(itemId, qualities);
                if (qualities.length > 0) insertOverlay(ctx, el, qualities);
            },
            onServerCacheRefresh(ctx, updatedIds) {
                if (!updatedIds) { serverQualityCache.clear(); return; }
                updatedIds.forEach(function(id) { serverQualityCache.delete(id); });
            },
        },
    };

    /**
     * Initializes the Quality Tags feature.
     */
    JE.initializeQualityTags = function() {
        JE.core.tagRenderer.register('quality', spec);
    };

    /**
     * Re-initializes the Quality Tags feature
     * Cleans up existing state and re-applies tags.
     */
    JE.reinitializeQualityTags = function() {
        JE.core.tagRenderer.reinitialize('quality', spec);
    };

})(window.JellyfinEnhanced);
