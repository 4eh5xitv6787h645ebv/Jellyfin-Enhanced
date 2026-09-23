// /js/elsewhere/reviews.js
(function (JE) {
    'use strict';

    JE.initializeReviewsScript = function () {
        const tmdbReviewsEnabled = JE.pluginConfig.ShowReviews && JE.pluginConfig.TmdbEnabled;
        const userReviewsEnabled = JE.pluginConfig.ShowUserReviews;
        if (!tmdbReviewsEnabled && !userReviewsEnabled) {
            console.log('🪼 Jellyfin Enhanced: Reviews feature disabled.');
            return;
        }

        const logPrefix = '🪼 Jellyfin Enhanced: Reviews:';

        // Suppress the reviews panel when the item has Spoiler Guard enabled by the
        // user AND the admin has SpoilerStripReviews on — TMDB and user reviews
        // routinely contain plot spoilers. Async because Spoiler Guard loads its
        // state lazily; whenLoaded() gives an authoritative answer even on a cold
        // page load before the state XHR completes.
        async function shouldSuppressForSpoilerMode(item, mediaType) {
            try {
                // Season / Episode pages also render reviews (keyed by parent series
                // TMDB id), so they must be suppressible too or a guarded series
                // leaks reviews on its per-season / per-episode pages.
                if (mediaType !== 'Series' && mediaType !== 'Movie'
                    && mediaType !== 'Season' && mediaType !== 'Episode') return false;
                if (!JE.pluginConfig?.SpoilerBlurEnabled) return false;
                // Default-on if the field is missing (older plugin XML
                // without the key — server returns the C# default true).
                var stripReviews = JE.pluginConfig?.SpoilerStripReviews;
                if (stripReviews === false) return false;
                if (!JE.spoilerBlur) return false;
                if (typeof JE.spoilerBlur.whenLoaded === 'function') {
                    await JE.spoilerBlur.whenLoaded();
                }
                // Fail-CLOSED when the initial state load failed — the enabled sets
                // and userPrefs are unreliable, so we can't tell if THIS item is
                // guarded. Without it, a transient blip on /spoiler-blur/series leaks
                // reviews for every guarded item until the next navigation.
                if (typeof JE.spoilerBlur.isLoadOk === 'function' && !JE.spoilerBlur.isLoadOk()) {
                    console.warn(`${logPrefix} Spoiler Guard state load failed; suppressing reviews fail-closed.`);
                    return true;
                }
                // Honor the user-side opt-out: admin policy is the cap (handled
                // above), but a user with HideReviews=false has explicitly asked to
                // see reviews on their guarded items.
                if (typeof JE.spoilerBlur.getUserPrefs === 'function') {
                    var userPrefs = JE.spoilerBlur.getUserPrefs() || {};
                    if (userPrefs.HideReviews === false) return false;
                }
                if (mediaType === 'Movie') {
                    return !!(JE.spoilerBlur.isMovieEnabledFor && JE.spoilerBlur.isMovieEnabledFor(item?.Id || ''));
                }
                // Series → own id; Season / Episode → parent series id (item.SeriesId),
                // so the whole series' guarded state governs its child pages.
                var seriesKey = (mediaType === 'Series') ? (item?.Id || '') : (item?.SeriesId || '');
                return !!(JE.spoilerBlur.isEnabledFor && JE.spoilerBlur.isEnabledFor(seriesKey));
            } catch (e) {
                // Fail-CLOSED: "show reviews" is the spoiler-leaking path, so if any
                // check above throws, suppress the panel rather than render it.
                console.warn(`${logPrefix} Spoiler Guard check failed; suppressing reviews:`, e);
                return true;
            }
        }

        // If suppression flips on between two visits to the same page (e.g. user
        // just enabled Spoiler Guard this session), an existing reviews section may
        // already be in the DOM. Strip it on suppress.
        function removeReviewsSection(page) {
            try {
                const root = page || document.querySelector('#itemDetailPage:not(.hide)') || document;
                const sec = root.querySelector('.tmdb-reviews-section');
                if (sec && sec.parentNode) sec.parentNode.removeChild(sec);
            } catch (e) {
                console.warn(`${logPrefix} removeReviewsSection failed:`, e);
            }
        }

        const {
            fetchReviews, fetchUserReviews, saveUserReview,
            deleteUserReview, adminDeleteUserReview, resolveReviewTarget
        } = JE.reviewApi.create();

        const escapeHtml = JE.escapeHtml;
        const {
            jeConfirm, jeAlert, tWithFallback, parseMarkdown,
            createReviewElement, createUserReviewElement, createReviewForm
        } = JE.reviewRendering.create();

        function addReviewsToPage(reviews, userReviews, contextPage, tmdbId, tmdbMediaType, currentUser) {
            const existingSection = contextPage.querySelector('.tmdb-reviews-section');
            if (existingSection) {
                existingSection.remove();
            }

            // Inject average user rating chip next to the TMDB/RT rating chips
            if (userReviewsEnabled && userReviews.length > 0) {
                const ratingsWithValue = userReviews.filter(r => r.rating);
                if (ratingsWithValue.length > 0) {
                    const avg = ratingsWithValue.reduce((sum, r) => sum + r.rating, 0) / ratingsWithValue.length;
                    const raw = avg * 2; // convert 1-5 → raw out of 10
                    const avgDisplay = Number.isInteger(raw) ? `${raw}` : `${raw.toFixed(1)}`;

                    // Remove any existing chip first
                    contextPage.querySelector('.je-avg-user-rating-chip')?.remove();

                    const chip = document.createElement('div');
                    chip.className = 'mediaInfoCriticRating mediaInfoItem je-avg-user-rating-chip';
                    chip.title = tWithFallback('reviews_avg_rating_tooltip',
                        'Average rating from {count} user(s)', { count: ratingsWithValue.length });
                    chip.innerHTML = `<span class="material-symbols-rounded starIcon" aria-hidden="true" style="color:#e91e8c;">person_heart</span>${avgDisplay}`;

                    // Insert after starRatingContainer, or after mediaInfoCriticRating if present,
                    // falling back to appending to the mediaInfoItems container
                    const criticRating = contextPage.querySelector('.mediaInfoCriticRating');
                    const starRating = contextPage.querySelector('.starRatingContainer');
                    const anchor = criticRating || starRating;
                    if (anchor && anchor.parentNode) {
                        anchor.parentNode.insertBefore(chip, anchor.nextSibling);
                    } else {
                        const container = contextPage.querySelector('.mediaInfoItems');
                        if (container) container.appendChild(chip);
                    }
                }
            }

            // `currentUser` is resolved fresh by the caller (processPage /
            // refreshReviews) via a live ApiClient.getCurrentUser() call so an
            // in-session login switch (Jellyfin's SPA router doesn't re-init
            // the plugin) can't show phantom admin controls to a non-admin who
            // logged in after an admin. The backend still blocks the actual
            // delete with 403 regardless.
            const currentUserId = (currentUser?.Id) || ApiClient.getCurrentUserId() || '';
            const viewerIsAdmin = currentUser?.Policy?.IsAdministrator === true;
            const ownReview = userReviews.find(r => r.userId.replace(/-/g, '') === currentUserId.replace(/-/g, ''));
            let reviewsSection;

            // Always build the section, even with zero reviews, so users can add their own.
            {
                reviewsSection = document.createElement('details');
                reviewsSection.className = 'detailSection tmdb-reviews-section';
                if (JE.currentSettings?.reviewsExpandedByDefault) {
                    reviewsSection.setAttribute('open', '');
                }

                const totalCount = (reviews ? reviews.length : 0) + userReviews.length;
                const summary = document.createElement('summary');
                summary.className = 'sectionTitle';
                summary.innerHTML = `${JE.t('reviews_title', { count: totalCount })} <i class="material-icons expand-icon">expand_more</i>`;
                reviewsSection.appendChild(summary);

                // ── "Write a Review" / "Edit Review" button bar ──────────────
                const actionBar = document.createElement('div');
                actionBar.className = 'je-review-action-bar';
                let writeBtn = null;

                if (userReviewsEnabled && !ownReview) {
                    writeBtn = document.createElement('button');
                    writeBtn.className = 'je-review-btn je-review-write-btn';
                    writeBtn.textContent = JE.t('reviews_add');
                    actionBar.appendChild(writeBtn);
                }
                reviewsSection.appendChild(actionBar);

                // ── Inline form placeholder (hidden until button clicked) ──────────
                const formPlaceholder = document.createElement('div');
                formPlaceholder.className = 'je-review-form-placeholder';
                reviewsSection.appendChild(formPlaceholder);

                const swipeContainer = document.createElement('div');
                swipeContainer.className = 'tmdb-review-swipe-container';

                // Render user reviews first (distinct border colour)
                userReviews.forEach(userReview => {
                    const card = createUserReviewElement(
                        userReview,
                        currentUserId,
                        viewerIsAdmin,
                        // Edit callback (own reviews only)
                        (r) => openForm(r),
                        // Delete callback — routes to self-delete for own reviews,
                        // admin moderation delete for others (admin viewers only).
                        async (r) => {
                            const isOwn = r.userId.replace(/-/g, '') === currentUserId.replace(/-/g, '');
                            const userName = r.userName || 'user';
                            const title = isOwn
                                ? tWithFallback('reviews_delete_title', 'Delete review')
                                : tWithFallback('reviews_admin_delete_title', 'Delete review (admin)');
                            const body = isOwn
                                ? tWithFallback('reviews_delete_confirm',
                                    'Delete your review for this item?')
                                : tWithFallback('reviews_admin_delete_confirm',
                                    'Delete this review by {user}? This cannot be undone.',
                                    { user: userName });
                            if (!(await jeConfirm(body, title))) return;
                            try {
                                if (isOwn) {
                                    await deleteUserReview(tmdbId, tmdbMediaType);
                                } else {
                                    await adminDeleteUserReview(r.userId, tmdbId, tmdbMediaType);
                                }
                                refreshReviews(contextPage);
                            } catch (e) {
                                // Surface the failure to the admin instead of
                                // silently failing: without this, a 403/404/500
                                // on the delete call would leave the review on
                                // screen with no feedback, making the admin
                                // believe the content was moderated when it
                                // wasn't.
                                console.error(`${logPrefix} Delete failed`, e);
                                const errTitle = tWithFallback('reviews_delete_error_title',
                                    'Delete failed');
                                const errBody = tWithFallback('reviews_delete_error_body',
                                    'Could not delete the review: {err}',
                                    { err: (e && e.message) ? e.message : 'Unknown error' });
                                jeAlert(errBody, errTitle);
                                // Re-fetch so the admin sees the real current state
                                // (in case the review was actually removed but the
                                // response was 500 on the way back, or a concurrent
                                // admin deleted it first).
                                refreshReviews(contextPage);
                            }
                        }
                    );
                    swipeContainer.appendChild(card);
                });

                // Render TMDB reviews after
                if (reviews && reviews.length > 0) {
                    reviews.slice(0, 10).forEach(review => {
                        swipeContainer.appendChild(createReviewElement(review));
                    });
                }

                reviewsSection.appendChild(swipeContainer);

                // ── Form open/close helpers ──────────────────────────────────────
                function openForm(existingReview) {
                    formPlaceholder.innerHTML = '';
                    const form = createReviewForm(
                        existingReview || null,
                        async (content, rating) => {
                            await saveUserReview(tmdbId, tmdbMediaType, content, rating);
                            refreshReviews(contextPage);
                        },
                        () => { formPlaceholder.innerHTML = ''; }
                    );
                    formPlaceholder.appendChild(form);
                    // Automatically open the details section so the form is visible
                    reviewsSection.setAttribute('open', '');
                    form.querySelector('.je-review-textarea').focus();
                }

                if (writeBtn) {
                    writeBtn.addEventListener('click', () => {
                        if (formPlaceholder.querySelector('.je-review-form')) {
                            formPlaceholder.innerHTML = '';
                        } else {
                            openForm(ownReview || null);
                        }
                    });
                }

                // ── Read-more toggle for TMDB reviews ─────────────────────────────
                swipeContainer.addEventListener('click', function (e) {
                    if (e.target.classList.contains('tmdb-review-toggle')) {
                        const textElement = e.target.parentElement;
                        const card = textElement.closest('.tmdb-review-card');
                        // Skip user review cards (they use dataset.fullContent)
                        if (card.classList.contains('je-user-review-card')) {
                            const full = card.dataset.fullContent || '';
                            if (textElement.classList.toggle('expanded')) {
                                textElement.innerHTML = parseMarkdown(full) + `<span class="tmdb-review-toggle">${JE.t('reviews_read_less')}</span>`;
                            } else {
                                textElement.innerHTML = parseMarkdown(full.substring(0, 350)) + `<span class="tmdb-review-toggle">${JE.t('reviews_read_more')}</span>`;
                            }
                            return;
                        }
                        const review = reviews.find(r => escapeHtml(r.author) === card.querySelector('.tmdb-review-author').textContent);
                        if (!review) return;
                        if (textElement.classList.toggle('expanded')) {
                            textElement.innerHTML = parseMarkdown(review.content) + `<span class="tmdb-review-toggle">${JE.t('reviews_read_less')}</span>`;
                        } else {
                            const previewContent = review.content.substring(0, 350);
                            textElement.innerHTML = parseMarkdown(previewContent) + `<span class="tmdb-review-toggle">${JE.t('reviews_read_more')}</span>`;
                        }
                    }
                });

                // Persist user's expand/collapse choice for future pages
                reviewsSection.addEventListener('toggle', function () {
                    try {
                        if (!window.JellyfinEnhanced) return;
                        const JE = window.JellyfinEnhanced;
                        JE.currentSettings = JE.currentSettings || JE.loadSettings?.() || {};
                        if (JE.currentSettings.reviewsExpandedByDefault !== reviewsSection.open) {
                            JE.currentSettings.reviewsExpandedByDefault = reviewsSection.open;
                            if (typeof JE.saveUserSettings === 'function') {
                                JE.saveUserSettings('settings.json', JE.currentSettings);
                            }
                        }
                    } catch (err) {
                        console.error(`${logPrefix} Failed to persist reviews expanded state`, err);
                    }
                });
            }

            const insertionAnchor =
                contextPage.querySelector('.streaming-lookup-container') ||
                contextPage.querySelector('.itemExternalLinks') ||
                contextPage.querySelector('.tagline');

            if (insertionAnchor && insertionAnchor.parentNode) {
                insertionAnchor.parentNode.insertBefore(reviewsSection, insertionAnchor.nextSibling);
            } else {
                console.error(`${logPrefix} Could not find a suitable anchor to insert reviews.`);
            }
        }

        /**
         * Re-fetches and re-renders the review section for the current page.
         */
        async function refreshReviews(contextPage) {
            try {
                const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                const userId = ApiClient.getCurrentUserId();
                if (!itemId || !userId) return;

                const item = JE.helpers?.getItemCached
                    ? await JE.helpers.getItemCached(itemId, { userId })
                    : await ApiClient.getItem(userId, itemId);
                const mediaType = item?.Type;

                if (await shouldSuppressForSpoilerMode(item, mediaType)) {
                    removeReviewsSection(contextPage);
                    return;
                }

                const target = await resolveReviewTarget(item, userId);
                if (!target) return;
                const { tmdbKey, apiMediaType } = target;

                if (!tmdbKey) return;

                // Fetch the current user fresh alongside the review data so
                // admin status reflects the actual live session.
                const [tmdbReviews, userReviews, currentUser] = await Promise.all([
                    (tmdbReviewsEnabled && (mediaType === 'Movie' || mediaType === 'Series'))
                        ? fetchReviews(tmdbKey.split(':')[0], mediaType)
                        : Promise.resolve(null),
                    userReviewsEnabled ? fetchUserReviews(tmdbKey, apiMediaType) : Promise.resolve([]),
                    ApiClient.getCurrentUser().catch(() => null),
                ]);

                const page = document.querySelector('#itemDetailPage:not(.hide)') || contextPage;
                addReviewsToPage(tmdbReviews, userReviews, page, tmdbKey, apiMediaType, currentUser);

                // Bust the poster tag cache for this item so the overlay updates
                if (typeof JE.invalidateUserReviewTagCache === 'function') {
                    JE.invalidateUserReviewTagCache(tmdbKey);
                }
            } catch (err) {
                console.error(`${logPrefix} Failed to refresh reviews:`, err);
            }
        }

        async function processPage(visiblePage) {
            if (!visiblePage || visiblePage.querySelector('.tmdb-reviews-section')) {
                return;
            }

            try {
                const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                const userId = ApiClient.getCurrentUserId();

                if (itemId && userId) {
                    const item = JE.helpers?.getItemCached
                        ? await JE.helpers.getItemCached(itemId, { userId })
                        : await ApiClient.getItem(userId, itemId);
                    const mediaType = item?.Type;

                    if (await shouldSuppressForSpoilerMode(item, mediaType)) {
                        removeReviewsSection(visiblePage);
                        return;
                    }

                    const target = await resolveReviewTarget(item, userId);
                    if (!target) return;
                    const { tmdbKey, apiMediaType } = target;

                    if (tmdbKey) {
                        // See refreshReviews for why currentUser is resolved fresh here.
                        const [tmdbReviews, userReviews, currentUser] = await Promise.all([
                            // TMDB reviews only available for top-level movie/tv, not seasons/episodes
                            (tmdbReviewsEnabled && (mediaType === 'Movie' || mediaType === 'Series'))
                                ? fetchReviews(tmdbKey.split(':')[0], mediaType)
                                : Promise.resolve(null),
                            userReviewsEnabled ? fetchUserReviews(tmdbKey, apiMediaType) : Promise.resolve([]),
                            ApiClient.getCurrentUser().catch(() => null),
                        ]);
                        addReviewsToPage(tmdbReviews, userReviews, visiblePage, tmdbKey, apiMediaType, currentUser);
                    }
                }
            } catch (error) {
                console.error(`${logPrefix} Error processing page:`, error);
            }
        }

        JE.injectReviewStyles();

        // Use Emby.Page.onViewShow hook for reliable page navigation detection
        const unregister = JE.helpers.onViewPage(async (view, element, hash, itemPromise) => {
            // Check if feature is still enabled
            if (!JE?.pluginConfig?.ShowReviews && !JE?.pluginConfig?.ShowUserReviews) {
                unregister();
                return;
            }

            // Check if this might be an item detail page by looking at current URL or element
            const currentHash = window.location.hash;
            const hasItemId = currentHash.includes('id=') || (hash && hash.includes('id='));
            const isItemDetailElement = element && (
                element.id === 'itemDetailPage' ||
                element.classList?.contains('itemDetailPage')
            );

            if (!hasItemId && !isItemDetailElement) {
                return;
            }

            // Wait for the page to be visible
            await new Promise(resolve => setTimeout(resolve, 150));

            const visiblePage = document.querySelector('#itemDetailPage:not(.hide)');
            if (visiblePage) {
                processPage(visiblePage);
            }
        }, {
            pages: null, // Trigger on all pages, we'll filter by hash
            fetchItem: false,
            immediate: true // Process current page immediately on load
        });
    };
})(window.JellyfinEnhanced);

