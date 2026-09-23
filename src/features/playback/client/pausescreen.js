// /js/enhanced/player/pausescreen.js
// Jellyfin Pause Screen (enhanced)
// Requires pause-screen-data.js and pause-screen-styles.js before initialization.
// This script is a modified version of the original Jellyfin Pause Screen script by BobHasNoSoul.
// Original source: https://github.com/BobHasNoSoul/Jellyfin-PauseScreen

(function (JE) {
  'use strict';

  JE.initializePauseScreen = function() {
    // Only run if the feature is enabled in the user's settings
    if (!JE.currentSettings.pauseScreenEnabled) {
        console.log('🪼 Jellyfin Enhanced: Custom Pause Screen is disabled.');
        return;
    }
      class JellyfinPauseScreen {
        constructor() {
          // State
          this.currentVideo = null;
          this.currentItemId = null;
          this.data = new JE.internals.player.PauseScreenData();
          this.lastItemIdCheck = 0;
          this.cleanupListeners = null;
          this.fetchAbort = null;
          this.observer = null;
          this.prevFocused = null;

          // Pause screen delay state
          this.pauseScreenDelayMs = (JE.currentSettings.pauseScreenDelaySeconds ?? 5) * 1000;
          this.pauseScreenTimer = null;
          this.lastUserInteractionAt = Date.now();
          this.interactionListeners = null;
          this._dismissedThisPause = false;

          // DOM refs
          this.overlay = null;
          this.overlayContent = null;
          this.overlayLogo = null;
          this.overlayPlot = null;
          this.overlayDetails = null;
          this.overlayDisc = null;
          this.overlayBackdrop = null;
          this.progressWrap = null;
          this.progressBar = null;
          this.progressMeta = null;
          this.focusStart = null;
          this.focusEnd = null;

          this.init();
        }

        init() {
          const credentials = this.data.getCredentials();
          if (!credentials) {
            console.error("🪼 Jellyfin Enhanced: Jellyfin credentials not found");
            return;
          }
          this.data.setCredentials(credentials);

          // Credentials are captured once above; without this they would keep
          // serving the PREVIOUS user's token after an SPA user switch. The
          // re-read is deferred a tick because the reset fires before the host
          // finishes writing the new credentials to localStorage.
          JE.session?.onUserChange('pause-screen', () => {
            this.data.clear();
            this.data.setCredentials(null);
            setTimeout(() => {
              const fresh = this.data.getCredentials();
              this.data.setCredentials(fresh);
            }, 0);
          });

          JE.internals.player.injectPauseScreenStyles();
          this.createOverlay();
          this.setupKeyboardAccessibility();
          this.setupVideoObserver();
          this.setupInteractionListeners();
        }

        createOverlay() {
          // Root overlay
          this.overlay = document.createElement("div");
          this.overlay.id = "pause-screen-overlay";
          this.overlay.setAttribute("role", "dialog");
          this.overlay.setAttribute("aria-hidden", "true");
          this.overlay.setAttribute("aria-modal", "true");

          this.focusStart = document.createElement('div');
          this.focusStart.id = 'pause-screen-focus-start';
          this.focusStart.tabIndex = 0;

          this.focusEnd = document.createElement('div');
          this.focusEnd.id = 'pause-screen-focus-end';
          this.focusEnd.tabIndex = 0;

          // Content wrapper
          this.overlayContent = document.createElement("div");
          this.overlayContent.id = "pause-screen-content";
          this.overlayContent.tabIndex = -1;

          // Backdrop layer
          this.overlayBackdrop = document.createElement("div");
          this.overlayBackdrop.id = "pause-screen-backdrop";

          // UI nodes
          this.overlayLogo = document.createElement("img");
          this.overlayLogo.id = "pause-screen-logo";

          this.overlayDetails = document.createElement("div");
          this.overlayDetails.id = "pause-screen-details";

          this.overlayPlot = document.createElement("div");
          this.overlayPlot.id = "pause-screen-plot";

          this.progressWrap = document.createElement("div");
          this.progressWrap.id = "pause-screen-progress-wrap";
          this.progressBar = document.createElement("div");
          this.progressBar.id = "pause-screen-progress-bar";
          const fill = document.createElement("span");
          this.progressBar.appendChild(fill);
          this.progressMeta = document.createElement("div");
          this.progressMeta.id = "pause-screen-progress-meta";
          this.progressMeta.innerHTML = `
              <span class="progress-time"></span>
              <span class="progress-percentage"></span>
              <span class="progress-ends-at"></span>
          `;
          this.progressWrap.appendChild(this.progressBar);
          this.progressWrap.appendChild(this.progressMeta);

          this.overlayDisc = document.createElement("img");
          this.overlayDisc.id = "pause-screen-disc";

          const closeButton = document.createElement("button");
          closeButton.id = "pause-screen-close-btn";
          closeButton.innerHTML = "&times;";
          closeButton.onclick = () => {
              this.hideOverlay(true);
          };

          // Assemble
          this.overlayContent.appendChild(this.overlayBackdrop);
          this.overlayContent.appendChild(this.overlayLogo);
          this.overlayContent.appendChild(this.overlayDetails);
          this.overlayContent.appendChild(this.overlayPlot);
          this.overlayContent.appendChild(this.progressWrap);
          this.overlayContent.appendChild(closeButton);

          this.overlay.appendChild(this.focusStart);
          this.overlay.appendChild(this.overlayContent);
          this.overlay.appendChild(this.overlayDisc);
          this.overlay.appendChild(this.focusEnd);

          document.body.appendChild(this.overlay);

          // Pointer/touch to resume
          const tryResume = (event) => {
            if (event.target === this.overlay || event.target === this.overlayContent) {
                // Introduce a delay to allow for long-press detection
                JE.state.pauseScreenClickTimer = setTimeout(() => {
                    this.hideOverlay();
                    if (this.currentVideo?.paused) this.currentVideo.play();
                }, 500);
            }
          };
          this.overlay.addEventListener('click', tryResume);
          this.overlay.addEventListener('touchstart', tryResume, { passive: true });

          // Focus trap behavior
          const trap = (e) => {
            if (this.overlay.getAttribute('aria-hidden') === 'false') {
              if (e.target === this.focusStart) this.overlayContent.focus();
              if (e.target === this.focusEnd) this.overlayContent.focus();
            }
          };
          this.focusStart.addEventListener('focus', trap);
          this.focusEnd.addEventListener('focus', trap);
        }

        setupKeyboardAccessibility() {
          // Space/Enter resumes when overlay visible
          document.addEventListener('keydown', (e) => {
            if (this.overlay.getAttribute('aria-hidden') === 'false') {
              if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                e.stopPropagation(); // stop Jellyfin binding
                this.hideOverlay();
                if (this.currentVideo && this.currentVideo.paused) {
                    this.currentVideo.play().catch(err => console.warn("🪼 Jellyfin Enhanced: Play() blocked:", err));
                }
              }
              // Keep Tab inside
              if (e.code === 'Tab') {
                // force focus to content if outside
                if (!this.overlay.contains(document.activeElement)) {
                  this.overlayContent.focus();
                  e.preventDefault();
                }
              }
            }
          }, { capture: true });
        }

        setupVideoObserver() {
          this.observer = JE.helpers.onBodyMutation('pausescreen', () => this.checkForVideoChanges());
          this.checkForVideoChanges();
        }

        resetPauseScreenTimer() {
          this.lastUserInteractionAt = Date.now();
          this.schedulePauseOverlayDelay();
        }

        schedulePauseOverlayDelay() {
          if (this.pauseScreenTimer) {
            clearTimeout(this.pauseScreenTimer);
            this.pauseScreenTimer = null;
          }

          if (!this.currentVideo || !this.currentVideo.paused || this.currentVideo.ended) {
            return;
          }

          // User already dismissed the pause screen for this pause — don't show again
          if (this._dismissedThisPause) {
            return;
          }

          const tryShowWhenIdle = () => {
            const video = this.currentVideo;
            if (!video || !video.paused || video.ended) {
              this.pauseScreenTimer = null;
              return;
            }

            const idleFor = Date.now() - this.lastUserInteractionAt;
            if (idleFor >= this.pauseScreenDelayMs) {
              this.showOverlay();
              this.pauseScreenTimer = null;
              return;
            }

            const remainingDelay = Math.max(100, this.pauseScreenDelayMs - idleFor);
            this.pauseScreenTimer = setTimeout(tryShowWhenIdle, remainingDelay);
          };

          this.pauseScreenTimer = setTimeout(tryShowWhenIdle, this.pauseScreenDelayMs);
        }

        setupInteractionListeners() {
          // Track last mouse position for movement threshold
          let lastMouseX = null;
          let lastMouseY = null;
          const MOUSE_MOVE_THRESHOLD = 15; // pixels - only reset if moved more than this

          const resetTimer = () => this.resetPauseScreenTimer();

          // Events that always reset the timer
          const resetEvents = ['mousedown', 'click', 'touchstart', 'touchmove', 'keydown', 'wheel'];

          this.interactionListeners = resetEvents.map(event => {
            const listener = resetTimer;
            document.addEventListener(event, listener, { passive: true });
            return { event, listener };
          });

          // Handle mousemove based on threshold
          const handleMouseMove = (e) => {
            const currentX = e.clientX;
            const currentY = e.clientY;

            if (lastMouseX !== null && lastMouseY !== null) {
              const distanceMoved = Math.sqrt(
                Math.pow(currentX - lastMouseX, 2) + Math.pow(currentY - lastMouseY, 2)
              );
              // Only reset if movement exceeds threshold
              if (distanceMoved > MOUSE_MOVE_THRESHOLD) {
                resetTimer();
              }
            } else {
              // First movement, record position
              lastMouseX = currentX;
              lastMouseY = currentY;
            }

            // Update last position
            lastMouseX = currentX;
            lastMouseY = currentY;
          };

          document.addEventListener('mousemove', handleMouseMove, { passive: true });
          this.interactionListeners.push({ event: 'mousemove', listener: handleMouseMove });
        }

        checkForVideoChanges() {
          const video = document.querySelector(".videoPlayerContainer video");
          if (video && video !== this.currentVideo) {
            this.handleVideoChange(video);
          } else if (!video && this.currentVideo) {
            this.clearState();
          }
        }

        async handleVideoChange(video) {
          this.clearState();
          this.currentVideo = video;
          this.cleanupListeners = this.attachVideoListeners(video);

          // Clear item cache on video change so a new item always fetches fresh data
          this.data.invalidateMetadata();

          const itemId = this.checkForItemId(true);
          if (itemId) {
            this.currentItemId = itemId;
            await this.fetchItemInfo(itemId);
          }
        }

        checkForItemId(force = false) {
          const now = Date.now();
          if (!force && now - this.lastItemIdCheck < 500) return this.currentItemId;
          this.lastItemIdCheck = now;

          // Use the OSD favorite button — it's always updated to the current item
          const el = document.querySelector('.videoOsdBottom .btnUserRating[data-id]');
          return el?.dataset?.id || null;
        }

        attachVideoListeners(video) {
          const handlePause = () => {
            if (video === this.currentVideo && !video.ended) {
              const newItemId = this.checkForItemId(true);
              if (newItemId && newItemId !== this.currentItemId) {
                this.currentItemId = newItemId;
                this.fetchItemInfo(newItemId);
              }
              this.updateProgressStatic();

              // Clear any existing timer
              if (this.pauseScreenTimer) {
                clearTimeout(this.pauseScreenTimer);
                this.pauseScreenTimer = null;
              }

              // Resume colored ratings polling when paused
              if (typeof JE?.resumeRatingsPolling === 'function') {
                JE.resumeRatingsPolling();
              }

              // New pause event — allow the pause screen to show again
              this._dismissedThisPause = false;
              this.lastUserInteractionAt = Date.now();
              this.resetPauseScreenTimer();
            }
          };

          const handlePlay = () => {
            if (video === this.currentVideo) {
              // Clear the timer if video starts playing
              if (this.pauseScreenTimer) {
                clearTimeout(this.pauseScreenTimer);
                this.pauseScreenTimer = null;
              }
              // Pause colored ratings polling when playing
              if (typeof JE?.pauseRatingsPolling === 'function') {
                JE.pauseRatingsPolling();
              }
              this.hideOverlay();
            }
          };

          video.addEventListener("pause", handlePause);
          video.addEventListener("play", handlePlay);
          return () => {
            video.removeEventListener("pause", handlePause);
            video.removeEventListener("play", handlePlay);
          };
        }

        showOverlay() {
            if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                this.overlayDisc.style.animation = 'none';
            } else {
                this.overlayDisc.style.animation = '';
            }
            this.prevFocused = document.activeElement;
            document.documentElement.classList.add('pause-screen-active');
            this.overlay.setAttribute('aria-hidden', 'false');
            this.overlayContent.focus();
            }

        hideOverlay(dismissed = false) {
            document.documentElement.classList.remove('pause-screen-active');
            this.overlay.setAttribute('aria-hidden', 'true');
            if (dismissed) {
                this._dismissedThisPause = true;
            }
            if (this.prevFocused && document.contains(this.prevFocused)) {
                this.prevFocused.focus();
            }
        }
        clearDisplayData() {
          this.overlayPlot.textContent = "";
          this.overlayDetails.innerHTML = "";
          this.overlayLogo.removeAttribute('src');
          this.overlayDisc.removeAttribute('src');
          this.overlayBackdrop.style.backgroundImage = '';
          // reset progress
          this.setProgress(0, 0);
        }

        async fetchItemInfo(itemId) {
            this.clearDisplayData();
            this.fetchAbort?.abort();
            this.fetchAbort = new AbortController();

            try {
                const record = await this.data.getItemRecord(itemId, this.fetchAbort.signal);
                await this.displayItemInfo(record.item, record.domain, itemId);
            } catch (err) {
                if (err.name !== 'AbortError') {
                console.error("🪼 Jellyfin Enhanced: Error fetching item info:", err);
                this.overlayPlot.textContent = JE.t('pausescreen_fetch_error');
                }
            }
            }

        async displayItemInfo(item, domain, itemId) {
          // Details
          const year = item.ProductionYear || "";
          const rating = item.OfficialRating || "";
          const runtime = this.formatRuntime(item.RunTimeTicks);
          this.overlayDetails.innerHTML = [
            year && `<span>${year}</span>`,
            rating && `<span class="mediaInfoOfficialRating" rating="${rating}">${rating}</span>`,
            runtime && `<span>${runtime}</span>`
          ].filter(Boolean).join('');

          this.overlayPlot.textContent = item.Overview || JE.t('pausescreen_no_description');

          // Images: preload to blob URLs (cached)
          const logoUrls = this.data.getLogoUrls(item, domain, itemId);
          const discUrls = this.data.getDiscUrls(item, domain, itemId);
          const backdropUrls = this.data.getBackdropUrls(item, domain, itemId);

          const [logoURL, discURL, backdropURL] = await Promise.all([
            this.data.firstAvailableBlobURL(logoUrls),
            this.data.firstAvailableBlobURL(discUrls),
            this.data.firstAvailableBlobURL(backdropUrls)
          ]);

          if (logoURL) this.overlayLogo.src = logoURL;
          if (discURL) this.overlayDisc.src = discURL;
          if (backdropURL) this.overlayBackdrop.style.backgroundImage = `url("${backdropURL}")`;

          // Set static progress snapshot if paused
          this.updateProgressStatic();
        }

        formatRuntime(runTimeTicks) {
          if (!runTimeTicks) return "";
          const totalMinutes = Math.floor(runTimeTicks / 600000000);
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        }

        // ------- Progress UI -------
        updateProgressStatic() {
          if (!this.currentVideo) return this.setProgress(0, 0);
          const cur = Number.isFinite(this.currentVideo.currentTime) ? this.currentVideo.currentTime : 0;
          const dur = Number.isFinite(this.currentVideo.duration) ? this.currentVideo.duration : 0;
          this.setProgress(cur, dur);
        }
        setProgress(current, duration) {
          const fill = this.progressBar.firstElementChild;
          const pct = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
          fill.style.width = `${pct}%`;

          const timeEl = this.progressMeta.querySelector('.progress-time');
          const endsAtEl = this.progressMeta.querySelector('.progress-ends-at');
          const percentageEl = this.progressMeta.querySelector('.progress-percentage');

          if (timeEl) {
            timeEl.textContent = `${this.formatClock(current)} / ${this.formatClock(duration)}`;
          }

          if (percentageEl) {
            percentageEl.textContent = JE.t('pausescreen_watched_percent', { percent: Math.round(pct) });
          }

          if (endsAtEl) {
            if (duration > 0 && current < duration) {
              const remainingSeconds = duration - current;
              const endTime = new Date(Date.now() + remainingSeconds * 1000);
              const formattedEndTime = endTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              endsAtEl.textContent = JE.t('pausescreen_ends_at', { time: formattedEndTime });
            } else {
              endsAtEl.textContent = ''; // Clear it if video is over
            }
          }
        }
        formatClock(sec) {
          if (!isFinite(sec) || sec <= 0) return "0:00";
          const s = Math.floor(sec % 60).toString().padStart(2, '0');
          const m = Math.floor((sec / 60) % 60).toString().padStart(2, '0');
          const h = Math.floor(sec / 3600);
          return h > 0 ? `${h}:${m}:${s}` : `${Number(m)}:${s}`;
        }

        clearState() {
          this.hideOverlay();
          this.clearDisplayData();

          // Clear pause screen timer
          if (this.pauseScreenTimer) {
            clearTimeout(this.pauseScreenTimer);
            this.pauseScreenTimer = null;
          }

          if (this.cleanupListeners) { this.cleanupListeners(); this.cleanupListeners = null; }
          if (this.fetchAbort) { this.fetchAbort.abort(); this.fetchAbort = null; }
          this.currentItemId = null;
          this.currentVideo = null;
        }

        destroy() {
          this.clearState();
          if (this.observer) { this.observer.unsubscribe(); this.observer = null; }

          // Clean up interaction listeners
          if (this.interactionListeners) {
            this.interactionListeners.forEach(({ event, listener }) => {
              document.removeEventListener(event, listener);
            });
            this.interactionListeners = null;
          }

          // Revoke blob URLs
          this.data.clear();
          if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
          const css = document.getElementById("pause-screen-style");
          if (css) css.remove();
        }
      }
      // Boot
      JE.pauseScreenInstance = new JellyfinPauseScreen();
        console.log('🪼 Jellyfin Enhanced: Custom Pause Screen initialized.');
    };

})(window.JellyfinEnhanced);
