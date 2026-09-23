// Seerr status: registered before api.js and composed with its shared transport.
(function(JE) {
    'use strict';

    JE.jellyseerrApiModules = JE.jellyseerrApiModules || {};
    JE.jellyseerrApiModules.status = function({ api, get, logPrefix }) {
        // Cache for user status (shared across all modules).
        // caching the failure result with no TTL caused discovery
        // sections to disappear for the entire SPA session after a single transient
        // error. Now we keep success results for the SPA session but only cache
        // negatives for 60 seconds so transient blips recover automatically.
        let cachedUserStatus = null;
        let cachedUserStatusAt = 0;
        const NEGATIVE_USER_STATUS_TTL_MS = 60 * 1000;

        /**
         * Checks if the Seerr server is active and if the current user is linked.
         * Caches the result to avoid repeated API calls.
         * @returns {Promise<{active: boolean, userFound: boolean}>}
         */
        api.checkUserStatus = async function() {
            if (cachedUserStatus !== null) {
                // Successful result is sticky for the SPA session.
                if (cachedUserStatus.active && cachedUserStatus.userFound) {
                    return cachedUserStatus;
                }
                // Negative result expires after 60s so a transient outage doesn't
                // permanently hide discovery.
                if (Date.now() - cachedUserStatusAt < NEGATIVE_USER_STATUS_TTL_MS) {
                    return cachedUserStatus;
                }
            }

            // A status resolved after a user switch belongs to the previous user
            // — return it to the caller that asked, but never cache it.
            const requestEpoch = JE.session ? JE.session.getEpoch() : 0;
            const isCurrent = () => !JE.session || JE.session.isCurrent(requestEpoch);
            try {
                const status = await get('/user-status', { skipCache: true });
                if (isCurrent()) {
                    cachedUserStatus = status;
                    cachedUserStatusAt = Date.now();
                    // Surface the typed reason as a banner so users aren't left staring
                    // at silently-hidden discovery sections.
                    api.surfaceUserStatusBanner(status);
                }
                return status;
            } catch (error) {
                console.warn(`${logPrefix} Status check failed:`, error);
                const fallback = {
                    active: false,
                    userFound: false,
                    reason: error?.responseJSON?.code || 'unreachable',
                    message: error?.responseJSON?.message
                };
                if (isCurrent()) {
                    cachedUserStatus = fallback;
                    cachedUserStatusAt = Date.now();
                    api.surfaceUserStatusBanner(fallback);
                }
                return fallback;
            }
        };

        /**
         * Surfaces a one-time banner toast describing why Seerr discovery is not
         * available. Skipped on success and on the "disabled" reason (no Seerr
         * configured, nothing to surface).
         */
        api.surfaceUserStatusBanner = function(status) {
            try {
                if (!status || (status.active && status.userFound)) return;
                if (status.reason === 'disabled') return;
                // Don't double-surface within a single session.
                if (window.__JE_userStatusBannerShown === status.reason) return;
                window.__JE_userStatusBannerShown = status.reason;

                const reasons = {
                    blocked: 'Your administrator has disabled Seerr for your account.',
                    unlinked: 'Your Seerr account isn\'t linked yet. Sign in to Seerr once to enable requests.',
                    unreachable: 'Can\'t reach Seerr right now. Please try again in a moment.',
                    no_user: 'Couldn\'t load your account. Try signing out and back in.'
                };
                // JE.toast renders via innerHTML. status.message comes
                // from SeerrHttpHelper.ToResponseShape, which uses UserMessage
                // (plain English, no URLs / cf-ray / proxy product names). Still
                // HTML-escape it before insertion as defence-in-depth.
                const rawMsg = status.message || reasons[status.reason] || 'Seerr is unavailable right now.';
                const msg = (typeof JE !== 'undefined' && typeof JE.escapeHtml === 'function')
                    ? JE.escapeHtml(rawMsg)
                    : String(rawMsg).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c];});
                if (typeof JE !== 'undefined' && typeof JE.toast === 'function') {
                    JE.toast(`Seerr: ${msg}`, 6000);
                } else {
                    console.warn(`${logPrefix} ${rawMsg}`);
                }
            } catch (e) {
                // Banner is best-effort; never break callers.
                console.debug(`${logPrefix} surfaceUserStatusBanner threw:`, e);
            }
        };

        /**
         * Clears the cached user status (called when user logs out or on page refresh).
         * Now also wired to navigation/hashchange so transient SPA-session blips
         * don't outlive the page they happened on.
         */
        api.clearUserStatusCache = function() {
            cachedUserStatus = null;
            cachedUserStatusAt = 0;
        };

        /**
         * Gets the current Seerr user ID from the user status.
         * @returns {Promise<string|null>} - Seerr user ID or null if not found.
         */
        api.getCurrentJellyseerrUserId = async function() {
            try {
                const status = await api.checkUserStatus();
                return (status && status.jellyseerrUserId) ? String(status.jellyseerrUserId) : null;
            } catch (error) {
                console.warn(`${logPrefix} Failed to get current Seerr user ID:`, error);
                return null;
            }
        };

        // Identity state belongs to the current Jellyfin user only.
        JE.session?.onUserChange('jellyseerr-api-status', () => {
            api.clearUserStatusCache();
            window.__JE_userStatusBannerShown = null;
        });
    };
})(window.JellyfinEnhanced);
