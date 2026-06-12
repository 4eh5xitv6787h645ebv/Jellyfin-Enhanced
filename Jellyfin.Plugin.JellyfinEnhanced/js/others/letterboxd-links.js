// /js/others/letterboxd-links.js
(function (JE) {
    'use strict';

    JE.initializeLetterboxdLinksScript = async function () {
        const logPrefix = '🪼 Jellyfin Enhanced: Letterboxd Links:';

        if (!JE?.pluginConfig?.LetterboxdEnabled) {
            console.log(`${logPrefix} Integration disabled in plugin settings.`);
            return;
        }

        console.log(`${logPrefix} Initializing...`);

        let isAddingLinks = false; // Lock to prevent concurrent runs
        let processedItemIds = new Set(); // Cache of items we've already processed
        let lastVisibleItemId = null; // Track the currently visible item

        const LETTERBOXD_ICON_URL = 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg/letterboxd.svg';

        // Safe fallback for helpers.js Stage-3 load-order races.
        const extLink = JE.helpers?.createExternalLink || ((u, o) => {
            const a = document.createElement('a');
            a.setAttribute('is', 'emby-linkbutton');
            a.href = u;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            if (o?.text) a.textContent = o.text;
            if (o?.title) a.title = o.title;
            if (o?.className) a.className = o.className;
            return a;
        });

        const styleId = 'letterboxd-links-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .letterboxd-link-icon::before {
                    content: "";
                    display: inline-block;
                    width: 25px;
                    height: 25px;
                    background-image: url(${LETTERBOXD_ICON_URL});
                    background-size: contain;
                    background-repeat: no-repeat;
                    vertical-align: middle;
                    margin-right: 5px;
                }
            `;
            document.head.appendChild(style);
        }

        function getImdbId(context) {
            const links = context.querySelectorAll('.itemExternalLinks a, .externalIdLinks a');
            for (const link of links) {
                const href = link.href;
                if (href.includes('imdb.com/title/')) {
                    const match = href.match(/\/title\/(tt\d+)/);
                    if (match) {
                        return match[1];
                    }
                }
            }
            return null;
        }

        async function addLetterboxdLinks() {
            if (isAddingLinks) {
                return;
            }

            const visiblePage = document.querySelector('#itemDetailPage:not(.hide)');
            if (!visiblePage) return;

            const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
            if (!itemId) return;

            // If we've already processed this item, skip it
            if (processedItemIds.has(itemId)) {
                return;
            }

            // If item changed, clear the processed set to allow reprocessing on new item
            if (lastVisibleItemId && lastVisibleItemId !== itemId) {
                processedItemIds.clear();
            }
            lastVisibleItemId = itemId;

            const anchorElement = visiblePage.querySelector('.itemExternalLinks');

            // Cleanup stale links from any non-visible pages to prevent future conflicts
            document.querySelectorAll('#itemDetailPage.hide .letterboxd-link').forEach(staleLink => {
                if (staleLink.previousSibling && staleLink.previousSibling.nodeType === Node.TEXT_NODE) {
                   staleLink.previousSibling.remove();
                }
                staleLink.remove();
            });

            if (!anchorElement || anchorElement.querySelector('.letterboxd-link')) {
                return;
            }

            isAddingLinks = true;
            try {
                const item = JE.helpers?.getItemCached
                    ? await JE.helpers.getItemCached(itemId)
                    : await ApiClient.getItem(ApiClient.getCurrentUserId(), itemId);
                if (!item?.Type) {
                    processedItemIds.add(itemId);
                    return;
                }

                if (!['Movie', 'Series'].includes(item.Type)) {
                    console.log(`${logPrefix} Skipping ${item.Type} - Letterboxd links not supported.`);
                    processedItemIds.add(itemId);
                    return;
                }

                const imdbId = getImdbId(visiblePage);
                if (!imdbId) {
                    console.log(`${logPrefix} No IMDb ID found for ${item.Type}.`);
                    processedItemIds.add(itemId);
                    return;
                }

                // Create Letterboxd link using IMDb ID
                const letterboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
                anchorElement.appendChild(document.createTextNode(' '));
                anchorElement.appendChild(createLinkButton("Letterboxd", letterboxdUrl, "letterboxd-link-icon"));
                processedItemIds.add(itemId);
            } catch (err) {
                console.error(`${logPrefix} Error adding Letterboxd link:`, err);
                processedItemIds.add(itemId);
            } finally {
                isAddingLinks = false;
            }
        }

        function createLinkButton(text, url, className) {
            const button = extLink(url, { title: text });
            if (JE.pluginConfig.ShowLetterboxdLinkAsText) {
                button.textContent = text;
                button.className = 'button-link emby-button letterboxd-link';
            } else {
                button.className = 'button-link emby-button letterboxd-link letterboxd-link-icon';
            }
            return button;
        }

        // ---------------------------------------------------------------- wiring
        // Router-driven primary path: the item type resolution STARTS at viewshow
        // (identity LRU when warm, single-flight item DTO when cold) and the link
        // is INSERTED at the native detail render moment — no observer churn and
        // no delayed initial check. navState/token guards keep stale async
        // results from ever touching the DOM of a newer navigation.
        let navState = null;

        function onNav(ctx) {
            if (!JE?.pluginConfig?.LetterboxdEnabled || !ctx.itemId) {
                navState = null;
                return;
            }
            const state = { token: ctx.token, itemId: ctx.itemId, typePromise: null };
            navState = state;

            // Resolve the item type without a fetch when the identity LRU already
            // knows it; otherwise start the (cache-warmed) item fetch at viewshow.
            const identity = JE.viewRouter.getIdentity(ctx.itemId);
            if (identity && identity.type) {
                state.typePromise = Promise.resolve(identity.type);
            } else {
                state.typePromise = (JE.helpers?.getItemCached
                    ? JE.helpers.getItemCached(ctx.itemId)
                    : ApiClient.getItem(ApiClient.getCurrentUserId(), ctx.itemId)
                ).then(item => item?.Type || null)
                    .catch(err => {
                        console.error(`${logPrefix} Error fetching item:`, err);
                        return null;
                    });
            }
        }

        async function onDetailRender(ctx) {
            if (!JE?.pluginConfig?.LetterboxdEnabled) return;
            const state = navState;
            if (!state || state.token !== ctx.token || ctx.signal.aborted) return;

            const visiblePage = (ctx.view && ctx.view.querySelector)
                ? ctx.view
                : document.querySelector('#itemDetailPage:not(.hide)');
            if (!visiblePage) return;
            const anchorElement = visiblePage.querySelector('.itemExternalLinks');

            // Cleanup stale links from any non-visible pages to prevent future conflicts
            document.querySelectorAll('#itemDetailPage.hide .letterboxd-link').forEach(staleLink => {
                if (staleLink.previousSibling && staleLink.previousSibling.nodeType === Node.TEXT_NODE) {
                   staleLink.previousSibling.remove();
                }
                staleLink.remove();
            });

            // Idempotency: restored views keep their previous DOM, link included.
            if (!anchorElement || anchorElement.querySelector('.letterboxd-link')) {
                return;
            }

            try {
                // Warm navigations resolve instantly here; cold ones await the
                // viewshow-started fetch (link inserts as soon as the type lands).
                const itemType = await state.typePromise;
                if (!itemType || navState !== state || ctx.signal.aborted) return;
                if (!document.contains(anchorElement) || anchorElement.querySelector('.letterboxd-link')) return;

                if (!['Movie', 'Series'].includes(itemType)) {
                    console.log(`${logPrefix} Skipping ${itemType} - Letterboxd links not supported.`);
                    return;
                }

                const imdbId = getImdbId(visiblePage);
                if (!imdbId) {
                    console.log(`${logPrefix} No IMDb ID found for ${itemType}.`);
                    return;
                }

                // Create Letterboxd link using IMDb ID
                const letterboxdUrl = `https://letterboxd.com/imdb/${imdbId}`;
                anchorElement.appendChild(document.createTextNode(' '));
                anchorElement.appendChild(createLinkButton("Letterboxd", letterboxdUrl, "letterboxd-link-icon"));
            } catch (err) {
                console.error(`${logPrefix} Error adding Letterboxd link:`, err);
            }
        }

        if (JE.viewRouter) {
            JE.viewRouter.onViewShow(onNav, { viewTypes: ['detail'] });
            JE.viewRouter.onNativeDetailRender(ctx => { onDetailRender(ctx); });

            console.log(`${logPrefix} Letterboxd links integration initialized successfully (router-driven).`);
        } else {
            // Legacy fallback (view router unavailable): body observer + idle
            // callback + delayed initial check drive addLetterboxdLinks, exactly
            // as before.
            let processingLetterboxd = false;
            const letterboxdObserver = JE.helpers.createObserver('letterboxd-links', () => {
                if (!JE?.pluginConfig?.LetterboxdEnabled) {
                    letterboxdObserver.disconnect();
                    console.log(`${logPrefix} Stopped - feature disabled`);
                    return;
                }

                if (!processingLetterboxd) {
                    processingLetterboxd = true;
                    if (typeof requestIdleCallback !== 'undefined') {
                        requestIdleCallback(() => {
                            addLetterboxdLinks();
                            processingLetterboxd = false;
                        }, { timeout: 500 });
                    } else {
                        setTimeout(() => {
                            addLetterboxdLinks();
                            processingLetterboxd = false;
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
                requestIdleCallback(() => addLetterboxdLinks(), { timeout: 1000 });
            } else {
                setTimeout(addLetterboxdLinks, 500);
            }

            console.log(`${logPrefix} Letterboxd links integration initialized successfully (legacy observer).`);
        }
    };
})(window.JellyfinEnhanced);