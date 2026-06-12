// /js/elsewhere/reviews.js
//
// Native-parity timing: review fetches start synchronously at viewshow
// (JE.viewRouter.onViewShow) using the persistent identity LRU, the section
// shell is injected at the exact native detail render moment
// (JE.viewRouter.onNativeDetailRender), and the cards fill in when the data
// promise resolves (synchronously on warm caches). The horizontal review row
// rides jellyfin-web's own emby-scroller component (transform paging + ‹ ›
// buttons on desktop, native overflow on mobile) instead of a custom
// overflow-x container.
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

        function fetchReviews(tmdbId, mediaType, signal) {
            const apiMediaType = mediaType === 'Series' ? 'tv' : 'movie';
            const url = `${ApiClient.getUrl(`/JellyfinEnhanced/tmdb/${apiMediaType}/${tmdbId}/reviews`)}?language=en-US&page=1`;
            return fetch(url, {
                headers: {
                    "X-Emby-Token": ApiClient.accessToken()
                },
                signal
            })
                .then(response => response.ok ? response.json() : Promise.reject(`API Error: ${response.status}`))
                .then(data => data.results || [])
                .catch(error => {
                    if (error?.name === 'AbortError') return null;
                    console.error(`${logPrefix} Failed to fetch reviews.`, error);
                    return null;
                });
        }

        /**
         * Fetches all user-written reviews for a TMDB item (aggregated across all users).
         * (Server-side filtering — HideReviewsFromHiddenUsers / HideReviewsFromDisabledUsers
         * — is applied by this endpoint.)
         */
        function fetchUserReviews(tmdbId, mediaType, signal) {
            // mediaType is already in API format ('movie' or 'tv') — no conversion needed
            const url = ApiClient.getUrl(`/JellyfinEnhanced/reviews/${mediaType}/${tmdbId}`);
            return fetch(url, {
                headers: { "X-Emby-Token": ApiClient.accessToken() },
                signal
            })
                .then(r => r.ok ? r.json() : Promise.reject(`API Error: ${r.status}`))
                .then(data => data.reviews || [])
                .catch(err => {
                    if (err?.name !== 'AbortError') {
                        console.error(`${logPrefix} Failed to fetch user reviews.`, err);
                    }
                    return [];
                });
        }

        /**
         * Saves (creates or updates) the current user's review for a TMDB item.
         */
        async function saveUserReview(tmdbId, mediaType, content, rating) {
            const url = ApiClient.getUrl(`/JellyfinEnhanced/reviews/${mediaType}/${tmdbId}`);
            const body = { content, rating: rating || null };
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    "X-Emby-Token": ApiClient.accessToken(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || `HTTP ${response.status}`);
            }
            return response.json();
        }

        /**
         * Deletes the current user's review for a TMDB item.
         */
        async function deleteUserReview(tmdbId, mediaType) {
            const url = ApiClient.getUrl(`/JellyfinEnhanced/reviews/${mediaType}/${tmdbId}`);
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { "X-Emby-Token": ApiClient.accessToken() }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }

        /**
         * Admin moderation: deletes another user's review for a TMDB item.
         * Backed by DELETE /JellyfinEnhanced/reviews/admin/{userIdN}/{mediaType}/{tmdbId},
         * which is gated on IsAdministrator server-side. A 404 from the
         * server now means "no matching review to delete" (race with a
         * concurrent admin, already-deleted review, wrong target) — we
         * translate that into a human-readable Error so the caller can
         * show a sensible message.
         */
        async function adminDeleteUserReview(targetUserId, tmdbId, mediaType) {
            const userIdN = (targetUserId || '').replace(/-/g, '');
            const url = ApiClient.getUrl(`/JellyfinEnhanced/reviews/admin/${userIdN}/${mediaType}/${tmdbId}`);
            const response = await fetch(url, {
                method: 'DELETE',
                headers: { "X-Emby-Token": ApiClient.accessToken() }
            });
            if (response.status === 404) {
                throw new Error('No matching review to delete (it may have already been removed).');
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
        }

        const escapeHtml = JE.escapeHtml;

        /**
         * Shows a Jellyfin-native confirm dialog and returns a Promise<boolean>.
         * Prefers window.Dashboard.confirm (the built-in Jellyfin modal, which
         * auto-themes and handles keyboard nav). Falls back to window.confirm
         * on unusual clients where Dashboard is not exposed, so the feature
         * still works even if the platform surface changes.
         *
         * The native-confirm fallback prepends the title to the text because
         * window.confirm() has no title parameter — without this, an admin
         * deleting someone else's review would lose the "(admin)" context.
         */
        function jeConfirm(text, title) {
            return new Promise(resolve => {
                if (window.Dashboard && typeof window.Dashboard.confirm === 'function') {
                    try {
                        window.Dashboard.confirm(text, title, resolve);
                        return;
                    } catch (err) {
                        console.warn(`${logPrefix} Dashboard.confirm threw, falling back:`, err);
                    }
                }
                const combined = title ? `${title}\n\n${text}` : text;
                resolve(window.confirm(combined));
            });
        }

        /**
         * Shows a Jellyfin-native alert dialog. Falls back to window.alert on
         * clients without Dashboard. Used to surface delete failures so admins
         * get visible feedback instead of a silent console.error.
         */
        function jeAlert(text, title) {
            if (window.Dashboard && typeof window.Dashboard.alert === 'function') {
                try {
                    window.Dashboard.alert({ title: title || '', message: text || '' });
                    return;
                } catch (err) {
                    console.warn(`${logPrefix} Dashboard.alert threw, falling back:`, err);
                }
            }
            window.alert(title ? `${title}\n\n${text}` : text);
        }

        // Track which translation keys we've already warned about falling
        // back on, so a broken i18n system is visible in the console once per
        // key instead of spamming on every render.
        const _tFallbackWarned = new Set();

        /**
         * JE.t with an inline English fallback. Needed because the translation
         * loader prefers remote en.json over the bundled copy, which means a
         * brand-new key can return its literal name for one release cycle
         * until the remote catches up.
         *
         * Uses String.prototype.replace with a replacement *function* rather
         * than a string literal, because a raw replacement string treats `$&`,
         * `$'`, `` $` ``, `$1`-`$99`, and `$$` as backreferences. Jellyfin's
         * username regex doesn't allow `$`, so today's only param (a username)
         * is safe — but if a future caller interpolates a free-form string
         * into the fallback, the function form avoids the footgun.
         */
        function tWithFallback(key, fallback, params) {
            let result;
            try {
                result = JE.t(key, params);
            } catch (err) {
                console.warn(`${logPrefix} JE.t('${key}') threw, using fallback:`, err);
                result = null;
            }
            if (!result || result === key) {
                if (!_tFallbackWarned.has(key)) {
                    _tFallbackWarned.add(key);
                    console.warn(`${logPrefix} Missing translation key '${key}', using inline fallback.`);
                }
                let out = fallback;
                if (params) {
                    for (const [k, v] of Object.entries(params)) {
                        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), () => String(v));
                    }
                }
                return out;
            }
            return result;
        }

        /**
         * Converts markdown text to safe HTML. Escapes raw HTML before applying
         * markdown transforms so that API-sourced review content cannot inject tags.
         * @param {string} text - Raw markdown text from TMDB reviews.
         * @returns {string} HTML string safe for innerHTML assignment.
         */
        function parseMarkdown(text) {
            if (!text) return '';

            // Escape HTML first
            let html = escapeHtml(text);

            // Parse markdown elements
            // Bold (**text** or __text__)
            html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

            // Italic (*text* or _text_)
            html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
            html = html.replace(/_(.+?)_/g, '<em>$1</em>');

            // Strikethrough (~~text~~)
            html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

            // Inline code (`code`)
            html = html.replace(/`(.+?)`/g, '<code>$1</code>');

            // Links [text](url) - only allow http(s) schemes
            html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, '<a is="emby-linkbutton" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

            // Auto-link plain URLs (http:// or https://)
            // Match URLs that aren't already inside href attributes
            html = html.replace(/(^|[^"'>])(https?:\/\/[^\s<]+[^\s<.,;!?)])/gi, function(match, prefix, url) {
                // Don't linkify if already part of an anchor tag
                return prefix + '<a is="emby-linkbutton" href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
            });

            // Process line by line for block elements
            const lines = html.split(/\r?\n/);
            const processed = [];
            let inBlockquote = false;
            let blockquoteLines = [];
            let inList = false;
            let listItems = [];

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const trimmedLine = line.trim();

                // Blockquotes (> text)
                if (trimmedLine.startsWith('&gt; ')) {
                    if (!inBlockquote) {
                        inBlockquote = true;
                        blockquoteLines = [];
                    }
                    blockquoteLines.push(trimmedLine.substring(5));
                    continue;
                } else if (inBlockquote) {
                    processed.push('<blockquote>' + blockquoteLines.join('<br>') + '</blockquote>');
                    inBlockquote = false;
                    blockquoteLines = [];
                }

                // Unordered lists (- item or * item)
                if (trimmedLine.match(/^[-*]\s+/)) {
                    if (!inList) {
                        inList = true;
                        listItems = [];
                    }
                    listItems.push('<li>' + trimmedLine.substring(2) + '</li>');
                    continue;
                } else if (inList) {
                    processed.push('<ul>' + listItems.join('') + '</ul>');
                    inList = false;
                    listItems = [];
                }

                // Headings (### text)
                if (trimmedLine.match(/^#{1,6}\s/)) {
                    const level = trimmedLine.match(/^#+/)[0].length;
                    const text = trimmedLine.substring(level + 1);
                    processed.push(`<h${level}>${text}</h${level}>`);
                    continue;
                }

                // Horizontal rule (--- or ***)
                if (trimmedLine.match(/^([-*]){3,}$/)) {
                    processed.push('<hr>');
                    continue;
                }

                // Regular line
                if (trimmedLine) {
                    processed.push(line);
                } else {
                    processed.push('<br>');
                }
            }

            // Close any open blocks
            if (inBlockquote) {
                processed.push('<blockquote>' + blockquoteLines.join('<br>') + '</blockquote>');
            }
            if (inList) {
                processed.push('<ul>' + listItems.join('') + '</ul>');
            }

            return processed.join('');
        }

        function createReviewElement(review) {
            const REVIEW_PREVIEW_LENGTH = 350;
            const reviewCard = document.createElement('div');
            reviewCard.className = 'tmdb-review-card';

            const content = review.content || 'No content available';
            const isLongReview = content.length > REVIEW_PREVIEW_LENGTH;
            const previewContent = isLongReview ? content.substring(0, REVIEW_PREVIEW_LENGTH) : content;

            const reviewDate = review.created_at ? new Date(review.created_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            }) : '';

            const rating = review.author_details?.rating;
            const ratingDisplay = rating ? `<span class="tmdb-review-rating">${JE.icon(JE.IconName.STAR)} ${rating}</span>` : '';

            reviewCard.innerHTML = `
                <div class="tmdb-review-header">
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${escapeHtml(review.author || 'Anonymous')}</strong>
                        <span class="tmdb-review-date">${reviewDate}</span>
                    </div>
                    ${ratingDisplay}
                </div>
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>
            `;

            const textElement = reviewCard.querySelector('.tmdb-review-text');
            textElement.innerHTML = parseMarkdown(previewContent) +
                (isLongReview ? `<span class="tmdb-review-toggle">${JE.t('reviews_read_more')}</span>` : '');

            return reviewCard;
        }

        /**
         * Builds the star display HTML for a 1–5 rating.
         * @param {number} rating - Integer 1 to 5.
         */
        function renderUserStarRating(rating) {
            if (!rating) return '';

            const stars = Array.from({ length: 5 }, (_, index) => {
                const filled = index < rating;
                return `<span class="je-user-star${filled ? ' je-user-star-filled' : ''}" aria-hidden="true">★</span>`;
            }).join('');

            return `<span class="je-user-star-rating">${stars}</span>`;
        }

        /**
         * Creates a review card for a user-written review (different border colour).
         * Own reviews get edit + delete. Non-own reviews get an admin delete button
         * when the viewer is an admin (for moderation).
         */
        function createUserReviewElement(review, currentUserId, viewerIsAdmin, onEditCallback, onDeleteCallback) {
            const REVIEW_PREVIEW_LENGTH = 350;
            const reviewCard = document.createElement('div');
            reviewCard.className = 'tmdb-review-card je-user-review-card';

            const content = review.content || '';
            const hasContent = content.length > 0;
            const isLongReview = content.length > REVIEW_PREVIEW_LENGTH;
            const previewContent = isLongReview ? content.substring(0, REVIEW_PREVIEW_LENGTH) : content;

            const reviewDate = review.updatedAt
                ? new Date(review.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
                : (review.createdAt ? new Date(review.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '');

            const ratingDisplay = review.rating
                ? `<span class="tmdb-review-rating je-user-review-rating">${renderUserStarRating(review.rating)}</span>`
                : '';

            // Avatar URL — Jellyfin serves user images at /Users/{id}/Images/Primary
            // userId stored in "N" format (no dashes); Jellyfin accepts both formats
            const avatarSrc = ApiClient.getUrl(`/Users/${review.userId}/Images/Primary`) + '?width=48&quality=90';

            const isOwn = review.userId.replace(/-/g, '') === currentUserId.replace(/-/g, '');
            const showModerationDelete = !isOwn && viewerIsAdmin;
            // Tooltips route through tWithFallback because JE.t returns the
            // raw key on miss (which is truthy), so a plain `JE.t(key) || 'X'`
            // would show literal `reviews_edit` until the remote en.json
            // catches up.
            const editTitle = tWithFallback('reviews_edit', 'Edit');
            const deleteTitle = tWithFallback('reviews_delete', 'Delete');
            const adminDeleteTitle = tWithFallback('reviews_admin_delete', 'Delete as admin');
            let actionButtons = '';
            if (isOwn) {
                actionButtons = `
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-edit-btn" title="${escapeHtml(editTitle)}"><span class="material-icons" aria-hidden="true">edit</span></button>
                    <button class="je-review-btn je-review-delete-btn" title="${escapeHtml(deleteTitle)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`;
            } else if (showModerationDelete) {
                actionButtons = `
                <div class="je-user-review-actions">
                    <button class="je-review-btn je-review-delete-btn je-review-admin-delete-btn" title="${escapeHtml(adminDeleteTitle)}"><span class="material-icons" aria-hidden="true">delete</span></button>
                </div>`;
            }

            reviewCard.innerHTML = `
                <div class="tmdb-review-header je-user-review-header">
                    <div class="je-user-review-avatar-wrapper">
                        <img class="je-user-avatar" src="${escapeHtml(avatarSrc)}" alt="" onerror="this.style.display='none'">
                    </div>
                    <div class="tmdb-review-author-info">
                        <strong class="tmdb-review-author">${escapeHtml(review.userName || 'User')}</strong>
                        <span class="tmdb-review-date">${reviewDate}</span>
                    </div>
                    ${ratingDisplay}
                    ${actionButtons}
                </div>
                ${hasContent ? `
                <div class="tmdb-review-content-wrapper">
                    <p class="tmdb-review-text"></p>
                </div>` : ''}
            `;

            const textElement = reviewCard.querySelector('.tmdb-review-text');
            if (textElement) {
                textElement.innerHTML = parseMarkdown(previewContent) +
                    (isLongReview ? `<span class="tmdb-review-toggle">${JE.t('reviews_read_more')}</span>` : '');
            }

            // Store full content for toggling
            reviewCard.dataset.fullContent = content;

            if (isOwn) {
                reviewCard.querySelector('.je-review-edit-btn').addEventListener('click', () => onEditCallback(review));
                reviewCard.querySelector('.je-review-delete-btn').addEventListener('click', () => onDeleteCallback(review));
            } else if (showModerationDelete) {
                reviewCard.querySelector('.je-review-admin-delete-btn').addEventListener('click', () => onDeleteCallback(review));
            }

            return reviewCard;
        }

        /**
         * Creates and injects the inline review form (add / edit).
         * @param {object|null} existingReview - Existing review data when editing, null when adding.
         * @param {function} onSave - Called with (content, rating) when the user submits.
         * @param {function} onCancel - Called when the user cancels.
         */
        function createReviewForm(existingReview, onSave, onCancel) {
            const form = document.createElement('div');
            form.className = 'je-review-form';
            let currentRating = existingReview?.rating || 0;

            form.innerHTML = `
                ${existingReview ? '' : `<h4 class="je-review-form-title">${JE.t('reviews_add')}</h4>`}
                <div class="je-review-star-picker" role="radiogroup">
                    ${[1,2,3,4,5].map(n => `<button class="je-star-btn${currentRating >= n ? ' je-star-selected' : ''}" data-value="${n}" type="button">★</button>`).join('')}
                    <button class="je-star-clear-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                    <span class="je-star-label"></span>
                </div>
                <textarea class="je-review-textarea" maxlength="2000">${escapeHtml(existingReview?.content || '')}</textarea>
                <div class="je-review-char-counter"><span class="je-review-char-count">${existingReview?.content?.length || 0}</span>/2000</div>
                <div class="je-review-form-btns">
                    <button class="je-review-btn je-review-submit-btn" type="button"><span class="material-icons" aria-hidden="true">save</span></button>
                    <button class="je-review-btn je-review-cancel-btn" type="button"><span class="material-icons" aria-hidden="true">close</span></button>
                </div>
                <div class="je-review-form-error" aria-live="polite"></div>
            `;

            const starBtns = form.querySelectorAll('.je-star-btn');
            const clearBtn = form.querySelector('.je-star-clear-btn');
            const starLabel = form.querySelector('.je-star-label');
            const textarea = form.querySelector('.je-review-textarea');
            const charCount = form.querySelector('.je-review-char-count');
            const submitBtn = form.querySelector('.je-review-submit-btn');
            const cancelBtn = form.querySelector('.je-review-cancel-btn');
            const errorEl = form.querySelector('.je-review-form-error');

            function updateStars(value) {
                currentRating = value;
                starBtns.forEach(btn => {
                    const v = parseInt(btn.dataset.value, 10);
                    btn.classList.toggle('je-star-selected', v <= currentRating);
                });
                starLabel.textContent = currentRating > 0 ? `${currentRating}/5` : '';
            }

            updateStars(currentRating);

            starBtns.forEach(btn => {
                btn.addEventListener('click', () => updateStars(parseInt(btn.dataset.value, 10)));
                btn.addEventListener('mouseenter', () => starBtns.forEach(b => b.classList.toggle('je-star-hover', parseInt(b.dataset.value, 10) <= parseInt(btn.dataset.value, 10))));
                btn.addEventListener('mouseleave', () => starBtns.forEach(b => b.classList.remove('je-star-hover')));
            });

            clearBtn.addEventListener('click', () => updateStars(0));

            textarea.addEventListener('input', () => {
                charCount.textContent = textarea.value.length;
            });

            submitBtn.addEventListener('click', async () => {
                const content = textarea.value.trim();
                if (!content && !currentRating) {
                    errorEl.textContent = JE.t('reviews_form_error_empty');
                    return;
                }
                errorEl.textContent = '';
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="material-icons" aria-hidden="true">hourglass_empty</span>';
                try {
                    await onSave(content, currentRating || null);
                } catch (err) {
                    errorEl.textContent = JE.t('reviews_form_error_save');
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span class="material-icons" aria-hidden="true">save</span>';
                }
            });

            cancelBtn.addEventListener('click', onCancel);

            return form;
        }

        // ────────────────────────────────────────────────────────────────────
        // TMDB target resolution
        // ────────────────────────────────────────────────────────────────────

        /**
         * Item DTO via the single-flight item cache (warmed by the native
         * detail controller's own viewshow fetch).
         */
        function getItem(itemId, userId) {
            return JE.helpers && typeof JE.helpers.getItemCached === 'function'
                ? JE.helpers.getItemCached(itemId, { userId })
                : ApiClient.getItem(userId, itemId);
        }

        /**
         * Synchronous target resolution from the router's persistent identity
         * LRU. Only top-level movies/series can resolve here: Episode/Season
         * reviews key off the SERIES tmdb id plus season/episode numbers, and
         * the identity LRU does not store index numbers — those go through
         * the item DTO path.
         * @param {string} itemId
         * @returns {{mediaType: string, tmdbKey: string, apiMediaType: string}|null}
         */
        function resolveTargetFromIdentity(itemId) {
            const identity = JE.viewRouter && typeof JE.viewRouter.getIdentity === 'function'
                ? JE.viewRouter.getIdentity(itemId)
                : null;
            if (!identity || !identity.tmdbId) return null;
            if (identity.type === 'Movie') {
                return { mediaType: 'Movie', tmdbKey: String(identity.tmdbId), apiMediaType: 'movie' };
            }
            if (identity.type === 'Series') {
                return { mediaType: 'Series', tmdbKey: String(identity.tmdbId), apiMediaType: 'tv' };
            }
            return null;
        }

        /**
         * Resolves the SERIES tmdb id for a Season/Episode item:
         * 1. the DTO's own SeriesProviderIds,
         * 2. the persistent identity LRU for the series (no network),
         * 3. a series DTO fetch (existing fallback).
         * @param {object} item - Season/Episode DTO
         * @param {string} userId
         * @param {AbortSignal|null} signal
         * @returns {Promise<string|null>}
         */
        async function resolveSeriesTmdbId(item, userId, signal) {
            const direct = item?.SeriesProviderIds?.Tmdb;
            if (direct) return direct;
            if (!item?.SeriesId) return null;

            const seriesIdentity = JE.viewRouter && typeof JE.viewRouter.getIdentity === 'function'
                ? JE.viewRouter.getIdentity(item.SeriesId)
                : null;
            if (seriesIdentity?.tmdbId) return seriesIdentity.tmdbId;

            try {
                const series = await getItem(item.SeriesId, userId);
                if (signal && signal.aborted) return null;
                return series?.ProviderIds?.Tmdb || null;
            } catch (_) {
                return null;
            }
        }

        /**
         * Full target resolution from the item DTO (cold identity cache, or
         * Season/Episode items that need index numbers). Returns null when
         * the item is not review-eligible.
         * @param {string} itemId
         * @param {AbortSignal|null} signal
         * @returns {Promise<{mediaType: string, tmdbKey: string, apiMediaType: string}|null>}
         */
        async function resolveTargetFromDto(itemId, signal) {
            const userId = ApiClient.getCurrentUserId();
            if (!itemId || !userId) return null;

            const item = await getItem(itemId, userId);
            if ((signal && signal.aborted) || !item) return null;

            const mediaType = item.Type;

            if (mediaType === 'Movie' || mediaType === 'Series') {
                const tmdbId = item?.ProviderIds?.Tmdb;
                if (!tmdbId) return null;
                return {
                    mediaType,
                    tmdbKey: String(tmdbId),
                    apiMediaType: mediaType === 'Series' ? 'tv' : 'movie'
                };
            }

            if (mediaType === 'Season') {
                const seriesTmdbId = await resolveSeriesTmdbId(item, userId, signal);
                if ((signal && signal.aborted) || !seriesTmdbId || item?.IndexNumber == null) return null;
                return { mediaType, tmdbKey: `${seriesTmdbId}:s${item.IndexNumber}`, apiMediaType: 'tv' };
            }

            if (mediaType === 'Episode') {
                const seriesTmdbId = await resolveSeriesTmdbId(item, userId, signal);
                if ((signal && signal.aborted) || !seriesTmdbId
                    || item?.ParentIndexNumber == null || item?.IndexNumber == null) return null;
                return {
                    mediaType,
                    tmdbKey: `${seriesTmdbId}:s${item.ParentIndexNumber}:e${item.IndexNumber}`,
                    apiMediaType: 'tv'
                };
            }

            return null;
        }

        // ────────────────────────────────────────────────────────────────────
        // Per-item reviews TTL cache (revisits render synchronously)
        // ────────────────────────────────────────────────────────────────────

        const REVIEWS_CACHE_TTL_MS = 60 * 1000;
        const REVIEWS_CACHE_LIMIT = 40;
        const reviewsCache = new Map(); // key -> { tmdbReviews, userReviews, ts }

        function reviewsCacheKey(target) {
            // apiMediaType prefix: a movie and a tv show can share a raw TMDB id.
            return `${target.apiMediaType}:${target.tmdbKey}`;
        }

        function getCachedReviews(key) {
            const entry = reviewsCache.get(key);
            if (!entry) return null;
            if ((Date.now() - entry.ts) >= REVIEWS_CACHE_TTL_MS) {
                reviewsCache.delete(key);
                return null;
            }
            return entry;
        }

        function putCachedReviews(key, tmdbReviews, userReviews) {
            if (reviewsCache.size >= REVIEWS_CACHE_LIMIT) {
                let oldestKey = null;
                let oldestTs = Infinity;
                for (const [k, v] of reviewsCache) {
                    if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
                }
                if (oldestKey !== null) reviewsCache.delete(oldestKey);
            }
            reviewsCache.set(key, { tmdbReviews, userReviews, ts: Date.now() });
        }

        /**
         * Loads everything fillSection needs: both review sets (TMDB + user,
         * fetched in parallel, TTL-cached per item) plus the live current
         * user. Returns null only when aborted.
         * @param {{mediaType: string, tmdbKey: string, apiMediaType: string}} target
         * @param {AbortSignal|null} signal
         */
        async function loadReviewData(target, signal) {
            const cacheKey = reviewsCacheKey(target);
            const cached = getCachedReviews(cacheKey);
            // TMDB reviews only available for top-level movie/tv, not seasons/episodes
            const tmdbAttempted = !cached && tmdbReviewsEnabled
                && (target.mediaType === 'Movie' || target.mediaType === 'Series');

            // `currentUser` is resolved fresh on every load instead of read
            // from the cached `JE.currentUser` set once at plugin init. This
            // matters for:
            //   1. Admin viewers on first render (race: JE.currentUser promise
            //      may not have resolved yet, so admin would briefly see no
            //      moderation buttons).
            //   2. In-session login switches (Jellyfin's SPA router doesn't
            //      re-init the plugin, so JE.currentUser stays stale as the
            //      previous user — a non-admin who logged in after an admin
            //      would see phantom admin controls, while the backend still
            //      blocks the actual delete with 403).
            // Using the live ApiClient session fixes both.
            const [tmdbReviews, userReviews, currentUser] = await Promise.all([
                cached
                    ? Promise.resolve(cached.tmdbReviews)
                    : (tmdbAttempted
                        ? fetchReviews(target.tmdbKey.split(':')[0], target.mediaType, signal)
                        : Promise.resolve(null)),
                cached
                    ? Promise.resolve(cached.userReviews)
                    : (userReviewsEnabled
                        ? fetchUserReviews(target.tmdbKey, target.apiMediaType, signal)
                        : Promise.resolve([])),
                ApiClient.getCurrentUser().catch(() => null)
            ]);
            if (signal && signal.aborted) return null;

            // Don't cache a transient TMDB fetch failure (null result when a
            // fetch was actually attempted) — retry on the next visit instead.
            if (!cached && !(tmdbAttempted && tmdbReviews === null)) {
                putCachedReviews(cacheKey, tmdbReviews, userReviews);
            }
            return { target, tmdbReviews, userReviews, currentUser };
        }

        // ────────────────────────────────────────────────────────────────────
        // Rendering: section shell (native emby-scroller) + async fill
        // ────────────────────────────────────────────────────────────────────

        /**
         * Injects the average user rating chip next to the TMDB/RT rating
         * chips. Must run at/after the native detail render — the
         * .mediaInfoCriticRating / .starRatingContainer anchors only exist
         * once jellyfin-web's own detail content is rendered.
         */
        function injectAvgRatingChip(contextPage, userReviews) {
            if (!userReviewsEnabled || !userReviews || userReviews.length === 0) return;

            const ratingsWithValue = userReviews.filter(r => r.rating);
            if (ratingsWithValue.length === 0) return;

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

        /**
         * Builds the empty reviews section: header + action bar + form
         * placeholder + a NATIVE jellyfin-web emby-scroller (empty slider).
         * Everything that needs review data is added later by fillSection.
         *
         * Structure (and why):
         *   <details .tmdb-reviews-section>            position:relative + overflow:hidden
         *     <summary .sectionTitle>                  header row (scroll buttons anchor here)
         *     <div .je-review-scroller-container>      forced position:static in CSS
         *       <div .je-review-action-bar>
         *       <div .je-review-form-placeholder>
         *       [emby-scrollbuttons inserted here by the scroller lib]
         *       <div is="emby-scroller">
         *         <div .scrollSlider>                  cards (in .je-review-slot wrappers)
         *
         * The scroller lib stamps .emby-scroller-container (position:relative)
         * onto the scroller's PARENT and anchors its ‹ › buttons absolutely
         * (top:0, right:0) against the nearest positioned ancestor. Forcing
         * the intermediate container static re-anchors the buttons to the
         * section root, i.e. the header row, instead of overlapping cards.
         */
        /** True when a loadReviewData result contains at least one review. */
        function reviewDataHasContent(data) {
            if (!data) return false;
            const tmdbCount = data.tmdbReviews ? data.tmdbReviews.length : 0;
            const userCount = data.userReviews ? data.userReviews.length : 0;
            return (tmdbCount + userCount) > 0;
        }

        function buildSectionShell(expectReviews) {
            const reviewsSection = document.createElement('details');
            reviewsSection.className = 'detailSection tmdb-reviews-section';
            // Height reservation (CLS guard) only when reviews are predicted:
            // an empty section keeps its natural small height so the
            // "Write a Review" entry point never sits above dead space.
            if (expectReviews) {
                reviewsSection.classList.add('je-reviews-reserved');
            }
            if (JE.currentSettings?.reviewsExpandedByDefault) {
                reviewsSection.setAttribute('open', '');
            }

            const summary = document.createElement('summary');
            summary.className = 'sectionTitle';
            summary.innerHTML = `${JE.t('reviews_title', { count: '…' })} <i class="material-icons expand-icon">expand_more</i>`;
            reviewsSection.appendChild(summary);

            const scrollerContainer = document.createElement('div');
            scrollerContainer.className = 'je-review-scroller-container';

            const actionBar = document.createElement('div');
            actionBar.className = 'je-review-action-bar';
            scrollerContainer.appendChild(actionBar);

            const formPlaceholder = document.createElement('div');
            formPlaceholder.className = 'je-review-form-placeholder';
            scrollerContainer.appendChild(formPlaceholder);

            // Native horizontal scroller. The .scrollSlider child MUST exist
            // before the scroller is attached to the DOM: the v0
            // registerElement polyfill upgrades on attach, and emby-scroller's
            // attachedCallback requires .scrollSlider at that moment.
            const scroller = document.createElement('div');
            scroller.setAttribute('is', 'emby-scroller');
            scroller.setAttribute('data-horizontal', 'true');
            scroller.setAttribute('data-centerfocus', 'true');
            scroller.className = 'emby-scroller padded-top-focusscale padded-bottom-focusscale no-padding';

            const slider = document.createElement('div');
            slider.className = 'scrollSlider';
            scroller.appendChild(slider);
            scrollerContainer.appendChild(scroller);

            reviewsSection.appendChild(scrollerContainer);

            // Persist user's expand/collapse choice for future pages. (The
            // scroller self-heals when the collapsed section expands — it
            // attaches a ResizeObserver to its frame — so no reload needed.)
            reviewsSection.addEventListener('toggle', function () {
                try {
                    if (!window.JellyfinEnhanced) return;
                    const JE = window.JellyfinEnhanced;
                    JE.currentSettings = JE.currentSettings || JE.loadSettings?.() || {};
                    JE.currentSettings.reviewsExpandedByDefault = reviewsSection.open;
                    if (typeof JE.saveUserSettings === 'function') {
                        JE.saveUserSettings('settings.json', JE.currentSettings);
                    }
                } catch (err) {
                    console.error(`${logPrefix} Failed to persist reviews expanded state`, err);
                }
            });

            return { section: reviewsSection, summary, actionBar, formPlaceholder, slider };
        }

        /**
         * Removes any previous reviews section and inserts a fresh shell at
         * the existing insertion point. The emby-scroller upgrades (and, on
         * desktop, inserts its ‹ › buttons) at this attach.
         * @param {HTMLElement} contextPage
         * @returns {object|null} shell refs from buildSectionShell, or null
         */
        function injectSectionShell(contextPage, expectReviews) {
            contextPage.querySelectorAll('.tmdb-reviews-section').forEach(el => el.remove());

            const insertionAnchor =
                contextPage.querySelector('.streaming-lookup-container') ||
                contextPage.querySelector('.itemExternalLinks') ||
                contextPage.querySelector('.tagline');

            if (!insertionAnchor || !insertionAnchor.parentNode) {
                console.error(`${logPrefix} Could not find a suitable anchor to insert reviews.`);
                return null;
            }

            const shell = buildSectionShell(expectReviews);
            insertionAnchor.parentNode.insertBefore(shell.section, insertionAnchor.nextSibling);
            return shell;
        }

        /**
         * Fills a shell with everything that needs data: title count, write
         * button, rating chip, and the review cards (built into a
         * DocumentFragment, inserted into the native scroller's slider in a
         * single operation).
         * @param {object} shell - From buildSectionShell/injectSectionShell
         * @param {{target: object, tmdbReviews: Array|null, userReviews: Array, currentUser: object|null}} data
         * @param {HTMLElement} contextPage
         */
        function fillSection(shell, data, contextPage) {
            const { section: reviewsSection, summary, actionBar, formPlaceholder, slider } = shell;
            const reviews = data.tmdbReviews;
            const userReviews = data.userReviews || [];
            const currentUser = data.currentUser;
            const tmdbId = data.target.tmdbKey;
            const tmdbMediaType = data.target.apiMediaType;

            // Stamp identity + completion so a restored view of the same item
            // can skip the rebuild entirely (see handleNativeDetailRender).
            reviewsSection.setAttribute('data-je-target', tmdbId);
            reviewsSection.setAttribute('data-je-filled', '1');

            // Inject average user rating chip next to the TMDB/RT rating chips
            injectAvgRatingChip(contextPage, userReviews);

            const currentUserId = (currentUser?.Id) || ApiClient.getCurrentUserId() || '';
            const viewerIsAdmin = currentUser?.Policy?.IsAdministrator === true;
            const ownReview = userReviews.find(r => r.userId.replace(/-/g, '') === currentUserId.replace(/-/g, ''));

            const totalCount = (reviews ? reviews.length : 0) + userReviews.length;

            // Keep the section even with zero reviews — it carries the
            // "Write a Review" entry point. Just make sure no height
            // reservation lingers (and add it when reviews exist, so the
            // reserved and filled heights match on future renders).
            reviewsSection.classList.toggle('je-reviews-reserved', totalCount > 0);

            summary.innerHTML = `${JE.t('reviews_title', { count: totalCount })} <i class="material-icons expand-icon">expand_more</i>`;

            // ── "Write a Review" / "Edit Review" button bar ──────────────
            let writeBtn = null;
            if (userReviewsEnabled && !ownReview) {
                writeBtn = document.createElement('button');
                writeBtn.className = 'je-review-btn je-review-write-btn';
                writeBtn.textContent = JE.t('reviews_add');
                actionBar.appendChild(writeBtn);
            }

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

            // ── Cards: sync head batch + chunked off-screen remainder ────────
            // Each card sits in a .je-review-slot wrapper that owns the
            // inter-card spacing — the native paging math measures
            // slider.children[0].offsetWidth for both index and target
            // position, so spacing must live INSIDE each child box.
            const addCard = (fragment, card) => {
                const slot = document.createElement('div');
                slot.className = 'je-review-slot';
                slot.appendChild(card);
                fragment.appendChild(slot);
            };

            const buildUserReviewCard = (userReview) => createUserReviewElement(
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

            // Card builders in display order: user reviews first (distinct
            // border colour), TMDB reviews after. Building is deferred into
            // thunks so the off-screen tail can run in cooperative chunks.
            const cardBuilders = userReviews.map(userReview => () => buildUserReviewCard(userReview));
            if (reviews && reviews.length > 0) {
                reviews.slice(0, 10).forEach(review => {
                    cardBuilders.push(() => createReviewElement(review));
                });
            }

            // Head batch (one visible row width) builds synchronously into a
            // single DocumentFragment inserted in one operation, so the row
            // paints complete in the same frame as the fill.
            const SYNC_CARD_COUNT = 4;
            const headFragment = document.createDocumentFragment();
            cardBuilders.slice(0, SYNC_CARD_COUNT).forEach(build => addCard(headFragment, build()));
            slider.appendChild(headFragment);

            // Off-screen remainder builds cooperatively (≤ ~8ms slices) so a
            // long review list can't produce one long task at fill time.
            // Cards accumulate in a detached fragment that attaches once at
            // the end — building into the detached fragment is always safe,
            // and the isConnected + stale-nav guards keep a navigation
            // mid-build from ever touching a dead DOM at the final append.
            const restBuilders = cardBuilders.slice(SYNC_CARD_COUNT);
            if (restBuilders.length > 0 && typeof JE.helpers?.scheduleChunked === 'function') {
                const buildNav = navState; // navigation current at fill time (null on the legacy path)
                const restFragment = document.createDocumentFragment();
                JE.helpers.scheduleChunked(
                    restBuilders,
                    build => addCard(restFragment, build()),
                    { budgetMs: 8 }
                ).then(() => {
                    if (!reviewsSection.isConnected) return;
                    if (buildNav && isStaleNav(buildNav)) return;
                    slider.appendChild(restFragment);
                }).catch(err => {
                    console.error(`${logPrefix} Failed to build deferred review cards:`, err);
                });
            } else if (restBuilders.length > 0) {
                // scheduleChunked unavailable: keep the old single-pass build.
                const restFragment = document.createDocumentFragment();
                restBuilders.forEach(build => addCard(restFragment, build()));
                slider.appendChild(restFragment);
            }

            // ── Read-more toggle for TMDB reviews ─────────────────────────────
            slider.addEventListener('click', function (e) {
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
        }

        /**
         * Re-fetches and re-renders the review section for the current page
         * (after a save/delete mutation).
         */
        async function refreshReviews(contextPage) {
            try {
                const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                if (!itemId) return;

                const target = resolveTargetFromIdentity(itemId) || await resolveTargetFromDto(itemId, null);
                if (!target) return;

                // Drop the TTL cache entry so the rebuild reflects the mutation.
                reviewsCache.delete(reviewsCacheKey(target));

                const data = await loadReviewData(target, null);
                if (!data) return;

                const page = document.querySelector('#itemDetailPage:not(.hide)') || contextPage;
                const shell = injectSectionShell(page, reviewDataHasContent(data));
                if (shell) fillSection(shell, data, page);

                // Bust the poster tag cache for this item so the overlay updates
                if (typeof JE.invalidateUserReviewTagCache === 'function') {
                    JE.invalidateUserReviewTagCache(target.tmdbKey);
                }
            } catch (err) {
                console.error(`${logPrefix} Failed to refresh reviews:`, err);
            }
        }

        function injectCss() {
            const styleId = 'tmdb-reviews-enhanced-styles';
            if (document.getElementById(styleId)) return;

            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                @font-face {
                    font-family: 'Material Symbols Rounded';
                    font-style: normal;
                    font-weight: 100 700;
                    font-display: block;
                    src: url(https://fonts.gstatic.com/s/materialsymbolsrounded/v258/syl0-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjpZIvDmUSVOK7BDB_Qb9vUSzq3wzLK-P0J-V_Zs-QtQth3-jOcbTCVpeRL2w5rwZu2rIelXxc.woff2) format('woff2');
                }
                .material-symbols-rounded {
                    font-family: 'Material Symbols Rounded';
                    font-weight: normal;
                    font-style: normal;
                    line-height: 1;
                    letter-spacing: normal;
                    text-transform: none;
                    display: inline-block;
                    white-space: nowrap;
                    word-wrap: normal;
                    direction: ltr;
                    -webkit-font-feature-settings: 'liga';
                    font-feature-settings: 'liga';
                    -webkit-font-smoothing: antialiased;
                }
                /* Section root: positioned ancestor for the scroller's ‹ › buttons
                   AND the clip box for desktop transform-mode scrolling (translated
                   cards visibly escape the row without overflow:hidden here). */
                .tmdb-reviews-section { margin: 2em 0 1em 0; display: flex !important; flex-direction: column; position: relative; overflow: hidden; }
                .tmdb-reviews-section summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; -webkit-tap-highlight-color: transparent;}
                .tmdb-reviews-section summary .expand-icon { color: rgba(255, 255, 255,.8);transition: transform 0.2s ease-in-out;}
                .tmdb-reviews-section[open] summary .expand-icon { transform: rotate(180deg);}

                /* ── Native emby-scroller integration ────────────────────────
                   The scroller lib stamps .emby-scroller-container
                   (position:relative) onto the scroller's PARENT and anchors
                   its buttons absolutely against the nearest positioned
                   ancestor. Forcing this intermediate container static
                   re-anchors the buttons to the section root header row. */
                .tmdb-reviews-section .je-review-scroller-container { position: static !important; }
                /* Keep the ‹ › buttons clear of the summary's expand icon. */
                [dir="ltr"] .tmdb-reviews-section .emby-scrollbuttons { right: 2.5em; }
                [dir="rtl"] .tmdb-reviews-section .emby-scrollbuttons { left: 2.5em; }
                /* Fallback if the registerElement polyfill never upgrades the
                   scroller: the lib stamps data-scroll-mode-x="custom" on init
                   (and removes it on destroy), so its absence means inert. */
                .tmdb-reviews-section .emby-scroller:not([data-scroll-mode-x]) { overflow-x: auto; }
                /* CLS guard: reserve exactly one card row on the scroller
                   frame from the moment the (open) shell is injected, so
                   cards that fill in later can't grow the section and shift
                   the page below. 20em = 18em .je-review-slot height + 2×1em
                   .scrollSlider vertical padding, i.e. the reservation equals
                   the filled height, so no shift in either direction.
                   box-sizing is pinned to content-box so the reserved value
                   always measures the slider's box even under themes that
                   force border-box, and regardless of the TV layout's
                   focus-scale frame padding (which is net-zero: padding
                   cancelled by negative margins). Inside a closed <details>
                   the reservation is inert (collapsed default unaffected).
                   Gated by .je-reviews-reserved: applied only when reviews
                   are predicted/known to exist, so an empty section (kept as
                   the Write-a-Review entry point) reserves nothing. */
                .tmdb-reviews-section.je-reviews-reserved .emby-scroller {
                    box-sizing: content-box;
                    min-height: 20em;
                }
                /* Below the fold on detail pages: let the browser skip the
                   cards' layout/paint until scrolled near. The intrinsic-size
                   placeholder mirrors the reserved row height so revealing it
                   shifts nothing. */
                .tmdb-reviews-section .je-review-scroller-container {
                    content-visibility: auto;
                    contain-intrinsic-size: auto 22em;
                }
                /* Flex (no gap!) reproduces the old equal-height card row; the
                   lib's inline white-space:nowrap on the slider is moot under
                   flex layout. */
                .tmdb-reviews-section .scrollSlider {
                    display: flex;
                    align-items: stretch;
                    padding: 1em 0;
                }
                /* Slot wrappers own the inter-card spacing: the native paging
                   math uses slider.children[0].offsetWidth for both index and
                   target position, so spacing must live INSIDE each child box
                   (flex gap would make paging drift cumulatively).
                   Widths = old card outer width (basis + 2×1.5em padding +
                   4px border) + the old 1.2em gap, so cards keep their exact
                   previous size.
                   Height is explicit so the row height is deterministic and
                   the scroller frame's min-height reservation above exactly
                   matches the filled row (cards used to be content-sized,
                   which let late-filled cards grow the section → CLS).
                   18em ≈ what a full 350-char-preview card rendered at:
                   2×1.5em card padding + ~3.7em header block + ~7 preview
                   lines × (0.95em × 1.7 line-height). The card stretches to
                   fill the slot, and taller content scrolls inside it via the
                   existing overflow-y:auto on .tmdb-review-content-wrapper. */
                .tmdb-reviews-section .je-review-slot {
                    flex: 0 0 auto;
                    display: flex;
                    height: 18em;
                    width: calc(85% + 3em + 4px + 1.2em);
                    max-width: calc(500px + 3em + 4px + 1.2em);
                    padding-right: 1.2em;
                    box-sizing: border-box;
                }
                [dir="rtl"] .tmdb-reviews-section .je-review-slot { padding-right: 0; padding-left: 1.2em; }
                @media (min-width: 768px) { .tmdb-reviews-section .je-review-slot { width: calc(400px + 3em + 4px + 1.2em); } }
                .tmdb-review-card {
                    width: 100%;
                    box-sizing: border-box;
                    white-space: normal; /* scroller lib sets inline white-space:nowrap on .scrollSlider */
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 8px;
                    border-left: 4px solid rgb(1, 180, 228);
                    padding: 1.5em;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    display: flex;
                    flex-direction: column;
                }
                .je-user-review-card {
                    border-left-color: rgb(94, 213, 95);
                    background: rgba(10, 26, 10, 0.52);
                }
                .tmdb-review-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1em; }
                .je-user-review-header { align-items: center; gap: 0.75em; }
                .tmdb-review-author-info { display: flex; flex-direction: column; gap: 0.3em; flex: 1; }
                .tmdb-review-author { color: #fff; font-size: 1.1em; font-weight: 600; }
                .tmdb-review-date { color: #aaa; font-size: 0.9em; }
                .tmdb-review-rating { color: #ffd700; background: rgba(255, 215, 0, 0.1); padding: 0.2em 0.5em; border-radius: 4px; }
                .je-user-review-rating {
                    white-space: nowrap;
                    background: rgba(94, 213, 95, 0.12);
                    color: #ffd700;
                }
                .je-user-star-rating { display: inline-flex; align-items: center; gap: 0.08em; }
                .je-user-star { color: rgba(255, 255, 255, 0.28); font-size: 0.95em; }
                .je-user-star-filled { color: #ffd700; }
                .tmdb-review-content-wrapper { flex-grow: 1; line-height: 1.7; overflow-y: auto; color: #ddd; font-size: 0.95em; }
                .tmdb-review-text { word-wrap: break-word; }
                .tmdb-review-text strong { color: #fff; font-weight: 600; }
                .tmdb-review-text em { font-style: italic; color: #e0e0e0; }
                .tmdb-review-text del { text-decoration: line-through; opacity: 0.7; }
                .tmdb-review-text code { background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; font-family: monospace; font-size: 0.9em; color: #ffa500; }
                .tmdb-review-text blockquote { border-left: 3px solid rgb(1, 180, 228); padding-left: 1em; margin: 0.8em 0; color: #aaa; font-style: italic; }
                .tmdb-review-text h1, .tmdb-review-text h2, .tmdb-review-text h3, .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { color: #fff; margin: 0.8em 0 0.4em 0; font-weight: 600; }
                .tmdb-review-text h1 { font-size: 1.5em; }
                .tmdb-review-text h2 { font-size: 1.3em; }
                .tmdb-review-text h3 { font-size: 1.15em; }
                .tmdb-review-text h4, .tmdb-review-text h5, .tmdb-review-text h6 { font-size: 1.05em; }
                .tmdb-review-text ul, .tmdb-review-text ol { margin: 0.5em 0; padding-left: 1.5em; }
                .tmdb-review-text li { margin: 0.3em 0; }
                .tmdb-review-text hr { border: none; border-top: 1px solid rgba(255, 255, 255, 0.2); margin: 1em 0; }
                .tmdb-review-text a { color: rgb(1, 180, 228); text-decoration: underline; }
                .tmdb-review-text a:hover { color: rgb(50, 200, 250); }
                .tmdb-review-toggle { color: rgb(1, 180, 228); font-weight: bold; cursor: pointer; text-decoration: underline; margin-left: 0.3em; }

                /* User avatar */
                .je-user-avatar-wrapper { flex-shrink: 0; }
                .je-user-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgb(94, 213, 95); display: block; }

                /* Action bar */
                .je-review-action-bar { padding: 0.5em 0.5em 0; display: flex; gap: 0.75em; }
                .je-user-review-actions { display: flex; gap: 0.5em; flex-shrink: 0; }

                /* Shared button style */
                .je-review-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 0.85em;
                    padding: 0.35em 0.9em;
                    transition: background 0.15s;
                }
                .je-review-btn:hover { background: rgba(255,255,255,0.15); }
                .je-review-write-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-write-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-edit-btn, .je-review-delete-btn, .je-review-submit-btn, .je-review-cancel-btn {
                    width: 2.4em;
                    height: 2.4em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-review-edit-btn .material-icons, .je-review-delete-btn .material-icons, .je-review-submit-btn .material-icons, .je-review-cancel-btn .material-icons, .je-star-clear-btn .material-icons { font-size: 18px; }
                .je-review-edit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-delete-btn { border-color: rgb(244, 67, 54); color: rgb(244, 67, 54); }
                .je-review-delete-btn:hover { background: rgba(244, 67, 54, 0.15); }

                /* Inline review form */
                .je-review-form-placeholder { padding: 0 0.5em; }
                .je-review-form {
                    background: rgba(0,0,0,0.4);
                    border: 1px solid rgba(94, 213, 95, 0.4);
                    border-radius: 8px;
                    padding: 1.2em;
                    margin: 0.75em 0;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75em;
                }
                .je-review-form-title { margin: 0; font-size: 1em; color: #fff; font-weight: 600; }
                .je-review-star-picker { display: flex; align-items: center; gap: 0.3em; }
                .je-star-btn {
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 1.6em;
                    color: rgba(255,255,255,0.2);
                    padding: 0;
                    line-height: 1;
                    transition: color 0.1s, transform 0.1s;
                }
                .je-star-btn:hover, .je-star-btn.je-star-hover, .je-star-btn.je-star-selected { color: #ffd700; }
                .je-star-btn:hover { transform: scale(1.2); }
                .je-star-clear-btn {
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    cursor: pointer;
                    color: rgba(255,255,255,0.7);
                    width: 2.2em;
                    height: 2.2em;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0;
                }
                .je-star-clear-btn:hover { background: rgba(255,255,255,0.15); }
                .je-star-label { color: #ffd700; font-size: 0.9em; margin-left: 0.25em; min-width: 2.5em; }
                .je-review-textarea {
                    width: 100%;
                    min-height: 100px;
                    resize: vertical;
                    background: rgba(255,255,255,0.06);
                    border: 1px solid rgba(255,255,255,0.15);
                    border-radius: 6px;
                    color: #fff;
                    font-size: 0.95em;
                    padding: 0.6em 0.8em;
                    box-sizing: border-box;
                    font-family: inherit;
                    line-height: 1.5;
                }
                .je-review-textarea:focus { outline: none; border-color: rgb(94, 213, 95); }
                .je-review-char-counter { font-size: 0.8em; color: rgba(255,255,255,0.4); text-align: right; }
                .je-review-form-btns { display: flex; gap: 0.75em; }
                .je-review-submit-btn { border-color: rgb(94, 213, 95); color: rgb(94, 213, 95); }
                .je-review-submit-btn:hover { background: rgba(94, 213, 95, 0.15); }
                .je-review-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .je-review-form-error { color: rgb(244, 67, 54); font-size: 0.85em; min-height: 1em; }

                /* Average user rating chip in item details */
                .je-avg-user-rating-chip .starIcon { color: #e91e8c !important; }
                /* Remove the padding coming from using critic rating container */
                .je-avg-user-rating-chip { padding-left: 0 !important; }
                /* Remove the % added by ElegantFin Theme */
                .mediaInfoCriticRating.mediaInfoItem.je-avg-user-rating-chip::after {
                    content: "";
                }
            `;
            document.head.appendChild(style);
        }

        /**
         * Legacy driver — only used by the onViewPage fallback path when
         * JE.viewRouter is unavailable. Renders shell + cards in one go.
         */
        async function processPage(visiblePage) {
            if (!visiblePage || visiblePage.querySelector('.tmdb-reviews-section')) {
                return;
            }

            try {
                const itemId = new URLSearchParams(window.location.hash.split('?')[1]).get('id');
                if (!itemId) return;

                const target = resolveTargetFromIdentity(itemId) || await resolveTargetFromDto(itemId, null);
                if (!target) return;

                const data = await loadReviewData(target, null);
                if (!data) return;

                const page = document.querySelector('#itemDetailPage:not(.hide)') || visiblePage;
                const shell = injectSectionShell(page, reviewDataHasContent(data));
                if (shell) fillSection(shell, data, page);
            } catch (error) {
                console.error(`${logPrefix} Error processing page:`, error);
            }
        }

        injectCss();

        // ────────────────────────────────────────────────────────────────────
        // Router-driven timing (primary path)
        //
        //   onViewShow         → resolve TMDB target (synchronously from the
        //                        identity LRU on warm navs) and start both
        //                        review fetches in parallel, abort-aware
        //   onNativeDetailRender → inject the section shell in the same frame
        //                        the native detail buttons become visible;
        //                        fill the cards when the data promise resolves
        //                        (synchronously on warm caches)
        // ────────────────────────────────────────────────────────────────────

        let navState = null;

        /** True when the navigation that produced `state` is no longer current. */
        function isStaleNav(state) {
            return state.signal.aborted || navState !== state;
        }

        function handleViewShow(ctx) {
            // Check if feature is still enabled
            if (!JE?.pluginConfig?.ShowReviews && !JE?.pluginConfig?.ShowUserReviews) {
                unregisterRouterHooks();
                navState = null;
                return;
            }
            if (!ctx.itemId) {
                navState = null;
                return;
            }

            const state = {
                token: ctx.token,
                itemId: ctx.itemId,
                signal: ctx.signal,
                target: undefined,      // undefined = resolving, null = not review-eligible
                targetPromise: null,
                dataPromise: null,
                dataResolved: undefined // undefined = pending, object = ready for sync fill
            };
            navState = state;
            ctx.signal.addEventListener('abort', () => {
                if (navState === state) navState = null;
            }, { once: true });

            // Resolve the TMDB target synchronously from the persistent
            // identity LRU when possible (warm navigations, no item DTO
            // needed) so both review fetches are dispatched inside this
            // synchronous viewshow call.
            const syncTarget = resolveTargetFromIdentity(ctx.itemId);
            if (syncTarget) {
                state.target = syncTarget;
                state.targetPromise = Promise.resolve(syncTarget);
                state.dataPromise = loadReviewData(syncTarget, ctx.signal)
                    .then(data => {
                        if (data) state.dataResolved = data;
                        return data;
                    })
                    .catch(err => {
                        if (err?.name !== 'AbortError') console.error(`${logPrefix} Failed to load reviews:`, err);
                        return null;
                    });
                return;
            }

            // Cold identity cache (or Season/Episode): the item DTO resolves
            // via the single-flight cache warmed by the native controller's
            // own viewshow fetch, then the review fetches start.
            state.targetPromise = resolveTargetFromDto(ctx.itemId, ctx.signal)
                .catch(err => {
                    if (err?.name !== 'AbortError') console.error(`${logPrefix} Failed to resolve TMDB id:`, err);
                    return null;
                })
                .then(target => {
                    state.target = target || null;
                    return state.target;
                });
            state.dataPromise = state.targetPromise
                .then(target => (target && !ctx.signal.aborted) ? loadReviewData(target, ctx.signal) : null)
                .then(data => {
                    if (data) state.dataResolved = data;
                    return data;
                })
                .catch(err => {
                    if (err?.name !== 'AbortError') console.error(`${logPrefix} Failed to load reviews:`, err);
                    return null;
                });
        }

        async function handleNativeDetailRender(ctx) {
            // Stale-nav guard: only act for the navigation we prepared.
            const state = navState;
            if (!state || state.token !== ctx.token || !state.dataPromise) return;

            // The visible detail page for this navigation (view cycling keeps
            // hidden cached pages in the DOM).
            const view = ctx.view;
            const page = (view && (view.id === 'itemDetailPage' || (view.classList && view.classList.contains('itemDetailPage'))))
                ? view
                : ((view && view.querySelector && view.querySelector('#itemDetailPage'))
                    || document.querySelector('#itemDetailPage:not(.hide)'));
            if (!page) return;

            // Wait for target resolution when the identity cache was cold; by
            // the native render moment the item DTO is already in the
            // single-flight cache (the native controller just fetched it), so
            // this settles within the same frame.
            let target = state.target;
            if (target === undefined) {
                target = await state.targetPromise;
                if (isStaleNav(state)) return;
            }
            if (!target) return; // not review-eligible (no TMDB id / unsupported type)

            // Restored views keep the previous visit's DOM: if the existing
            // section already belongs to this exact target and finished
            // filling, rebuilding it is pure waste — keep it.
            const existingSection = page.querySelector('.tmdb-reviews-section');
            if (existingSection
                && existingSection.getAttribute('data-je-target') === target.tmdbKey
                && existingSection.getAttribute('data-je-filled') === '1') {
                return;
            }

            // Below-fold section: yield one frame so the native render batch
            // (and above-the-fold JE elements) paint without us in it.
            await new Promise(requestAnimationFrame);
            if (isStaleNav(state)) return;

            // Inject the shell (header + collapsed/empty body) in the native
            // render frame; previous sections are removed here. Reserve the
            // card-row height only when reviews are known (resolved data) or
            // predicted (TTL cache) — cold first visits grow on fill instead,
            // which the below-fold position largely hides.
            let expectReviews = false;
            if (state.dataResolved !== undefined) {
                expectReviews = reviewDataHasContent(state.dataResolved);
            } else {
                const cached = getCachedReviews(reviewsCacheKey(target));
                expectReviews = !!cached
                    && (((cached.tmdbReviews ? cached.tmdbReviews.length : 0) + (cached.userReviews ? cached.userReviews.length : 0)) > 0);
            }
            const shell = injectSectionShell(page, expectReviews);
            if (!shell) return;

            // Warm cache / already-settled fetch: build everything in one go.
            if (state.dataResolved !== undefined) {
                fillSection(shell, state.dataResolved, page);
                return;
            }

            const data = await state.dataPromise;
            if (!data || isStaleNav(state)) {
                shell.section.remove();
                return;
            }
            fillSection(shell, data, page);
        }

        let unregisterViewShow = null;
        let unregisterDetailRender = null;
        function unregisterRouterHooks() {
            if (unregisterViewShow) { unregisterViewShow(); unregisterViewShow = null; }
            if (unregisterDetailRender) { unregisterDetailRender(); unregisterDetailRender = null; }
        }

        if (JE.viewRouter && typeof JE.viewRouter.onViewShow === 'function') {
            unregisterViewShow = JE.viewRouter.onViewShow(handleViewShow, { viewTypes: ['detail'] });
            unregisterDetailRender = JE.viewRouter.onNativeDetailRender(handleNativeDetailRender);
        } else {
            // Legacy fallback when the view router is unavailable: Emby.Page
            // onViewShow hook + settle delay (old behavior).
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
        }
    };
})(window.JellyfinEnhanced);
