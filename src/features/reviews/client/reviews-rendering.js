// Review cards, authoring controls, and safe text rendering.
// The coordinator supplies callbacks; rendering never fetches or mutates reviews.
(function (JE) {
    'use strict';

    function createReviewRendering() {
        const logPrefix = '🪼 Jellyfin Enhanced: Reviews:';

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

        const STAR_POLYGON = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>';

        /**
         * Builds a single star icon: an outline star with a filled star on
         * top, clipped to `fillFraction` (0-1) of its width — 0 is empty,
         * 1 is full, 0.5 is a half-star.
         */
        function starIconHtml(fillFraction) {
            const pct = Math.round(Math.max(0, Math.min(1, fillFraction)) * 100);
            return `<span class="je-star-icon" aria-hidden="true">
                <svg class="je-star-icon-base" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAR_POLYGON}</svg>
                <svg class="je-star-icon-fill" style="clip-path: inset(0 ${100 - pct}% 0 0);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${STAR_POLYGON}</svg>
            </span>`;
        }

        /**
         * Builds the star display HTML for a 1–5 rating.
         * @param {number} rating - 1 to 5, in 0.5 increments.
         */
        function renderUserStarRating(rating) {
            if (!rating) return '';

            const stars = Array.from({ length: 5 }, (_, index) => {
                const fillFraction = Math.max(0, Math.min(1, rating - index));
                return starIconHtml(fillFraction);
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
                    ${[1,2,3,4,5].map(n => `<button class="je-star-btn" data-value="${n}" type="button" aria-label="${n} stars">${starIconHtml(0)}</button>`).join('')}
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

            // Used for both the committed rating and the live hover preview.
            function setFill(value) {
                starBtns.forEach(btn => {
                    const n = parseInt(btn.dataset.value, 10);
                    const fillFraction = Math.max(0, Math.min(1, value - (n - 1)));
                    const pct = Math.round(fillFraction * 100);
                    const fillSvg = btn.querySelector('.je-star-icon-fill');
                    if (fillSvg) fillSvg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
                });
            }

            function updateStars(value) {
                currentRating = value;
                setFill(value);
                starLabel.textContent = currentRating > 0 ? `${currentRating}/5` : '';
            }

            // Left half of a star button = n - 0.5, right half = n.
            function valueForPointer(btn, clientX) {
                const n = parseInt(btn.dataset.value, 10);
                const rect = btn.getBoundingClientRect();
                const isLeftHalf = (clientX - rect.left) < rect.width / 2;
                return isLeftHalf ? n - 0.5 : n;
            }

            updateStars(currentRating);

            starBtns.forEach(btn => {
                btn.addEventListener('click', (e) => updateStars(valueForPointer(btn, e.clientX)));
                btn.addEventListener('mousemove', (e) => setFill(valueForPointer(btn, e.clientX)));
                btn.addEventListener('mouseleave', () => setFill(currentRating));
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

        return { jeConfirm, jeAlert, tWithFallback, parseMarkdown, createReviewElement, createUserReviewElement, createReviewForm, renderUserStarRating };
    }

    JE.reviewRendering = { create: createReviewRendering };
})(window.JellyfinEnhanced);
