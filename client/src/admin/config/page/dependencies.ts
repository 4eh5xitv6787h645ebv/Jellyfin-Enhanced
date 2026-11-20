import type { PageModules } from './modules';
import type { FormControl } from './dom';
import { asControl, asHtml, asInput, asSelect, needControl, needInput } from './dom';
import type { CustomTabsV12Hint, SectionDep, IndividualDep, ParentDep } from './types';

/** Dependencies this module calls; members are resolved lazily, after every module exists. */
export type DependenciesDeps = Pick<PageModules, 'context' | 'plugins'>;

export function createDependencies(m: DependenciesDeps) {
        // ================================
        // SETTING DEPENDENCY SYSTEM
        // ================================

        /**
         * Checks whether a TMDB API key is configured in either input field.
         * @returns {boolean} True if a non-empty TMDB key exists
         */
        function hasTmdbKey() : boolean {
            return needControl(document.querySelector('#TMDB_API_KEY')).value.trim().length > 0
                || needControl(document.querySelector('#jellyseerr_TMDB_API_KEY')).value.trim().length > 0;
        }

        /**
         * Elsewhere and the poster provider icons can use either a TMDB key or
         * the Seerr integration (Seerr exposes the same watch-provider data).
         * @returns {boolean} True if a TMDB key or a fully configured Seerr exists
         */
        function hasTmdbOrSeerr() : boolean {
            return hasTmdbKey() || hasJellyseerrConfigured();
        }

        function isMetadataIconsEnabled() : boolean {
            var el = asInput(document.getElementById('metadataIconsEnabled'));
            return !!(el && el.checked);
        }

        /**
         * Returns true iff at least one configured Seerr URL parses as an
         * http(s) URL. A non-empty textarea full of garbage like "seerr.local"
         * (no scheme) used to evaluate truthy here, so the dependency banner
         * would hide and Seerr feature toggles would unlock — features that
         * could never actually work.          */
        function hasAtLeastOneValidSeerrUrl(value: string) : boolean {
            if (!value) return false;
            const lines = String(value).split('\n').map(s => s.trim()).filter(Boolean);
            for (const line of lines) {
                try {
                    const u = new URL(line);
                    if (u.protocol === 'http:' || u.protocol === 'https:') {
                        return true;
                    }
                } catch (_) {
                    // not a valid URL — try next line
                }
            }
            return false;
        }

        /**
         * Checks whether Jellyseerr is enabled with both a URL and API key configured.
         * @returns {boolean} True if Jellyseerr is fully configured
         */
        function hasJellyseerrConfigured() : boolean {
            return needInput(document.querySelector('#jellyseerrEnabled')).checked
                && hasAtLeastOneValidSeerrUrl(needControl(document.querySelector('#jellyseerrUrls')).value)
                && needControl(document.querySelector('#JellyseerrApiKey')).value.trim().length > 0;
        }

        /**
         * Checks whether at least one ENABLED arr service (Sonarr or Radarr) has a URL and API key.
         * Disabled instances are skipped — they're stored config but the fan-out callers
         * (controller endpoints, scheduled tag sync) skip them, so gating dependent
         * features behind a disabled-only set would be misleading.
         * @returns {boolean} True if any enabled arr service is fully configured
         */
        function hasAnyArrService() : boolean {
            var cards = document.querySelectorAll<HTMLElement>('#sonarrInstancesList .arr-instance-card, #radarrInstancesList .arr-instance-card');
            for (var i = 0; i < cards.length; i++) {
                const card = cards[i];
                if (!card) continue;
                var url = asControl(card.querySelector('.arr-instance-url'));
                var key = asControl(card.querySelector('.arr-instance-apikey'));
                var enabled = asInput(card.querySelector('.arr-instance-enabled'));
                // Treat missing checkbox as enabled (defensive — every card should have one)
                if (enabled && !enabled.checked) continue;
                if (url && url.value.trim() && key && key.value.trim()) return true;
            }
            return false;
        }

        // Setup fieldsets that hold the connection inputs are tagged with
        // `data-dep-setup` directly in the HTML — `updateSectionDep` walks
        // every fieldset and gates only the ones WITHOUT that marker, so
        // admins can always edit Sonarr/Radarr/Bazarr/Seerr setup boxes
        // regardless of what else is configured.
        var SECTION_DEPS: readonly SectionDep[] = [
            {
                tabSelector: '#seerr',
                checkFn: hasJellyseerrConfigured,
                bannerIcon: 'link_off',
                bannerTitle: 'Enable "Seerr integration" to configure',
                bannerHint: 'Provide a Seerr URL and API key in the Setup section above, then enable the integration.',
                lockHint: 'Needs Seerr',
                bannerId: 'dep-banner-jellyseerr'
            },
            {
                tabSelector: '#arr',
                checkFn: hasAnyArrService,
                bannerIcon: 'link_off',
                bannerTitle: 'Enable a *arr service to configure',
                bannerHint: 'Add a URL and API key for Sonarr or Radarr above to enable these features.',
                lockHint: 'Needs a *arr service',
                bannerId: 'dep-banner-arr'
            }
        ];

        var INDIVIDUAL_DEPS: readonly IndividualDep[] = [
            { id: 'elsewhereEnabled',         checkFn: hasTmdbOrSeerr, hint: 'Add a TMDB API Key or enable Seerr to use', missing: 'no TMDB API key is set and Seerr is not set up', icon: 'key' },
            { id: 'ElsewhereUseSeerrRegion',  checkFn: hasJellyseerrConfigured, hint: 'Enable Seerr to use', missing: 'Seerr is not set up', icon: 'link' },
            { id: 'ElsewhereSeasonProviders', checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', missing: 'no TMDB API key is set', icon: 'key' },
            { id: 'showReviews',              checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', missing: 'no TMDB API key is set', icon: 'key' },
            { id: 'showReleaseDate',          checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', missing: 'no TMDB API key is set', icon: 'key' },
            { id: 'showElsewhereOnJellyseerr', checkFn: hasTmdbOrSeerr, hint: 'Add a TMDB API Key or enable Seerr to use', missing: 'no TMDB API key is set and Seerr is not set up', icon: 'key' },
            { id: 'autoMovieRequestEnabled',   checkFn: hasTmdbKey, hint: 'Add a TMDB API Key to enable', missing: 'no TMDB API key is set', icon: 'key' },
            { id: 'autoSkipIntro',                 checkFn: function() { return m.plugins.hasIntroSkipper !== false; }, hint: 'Install Intro Skipper plugin to enable', missing: 'the Intro Skipper plugin is not installed', icon: 'extension' },
            { id: 'autoSkipOutro',                 checkFn: function() { return m.plugins.hasIntroSkipper !== false; }, hint: 'Install Intro Skipper plugin to enable', missing: 'the Intro Skipper plugin is not installed', icon: 'extension' },
            { id: 'bookmarksUsePluginPages',       checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'hiddenContentUsePluginPages',   checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'downloadsUsePluginPages',       checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'calendarUsePluginPages',        checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'recommendationsUsePluginPages', checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'activityFeedUsePluginPages',    checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'leavingSoonPageUsePluginPages',    checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'catchUpUsePluginPages',           checkFn: function() { return m.plugins.hasPluginPages !== false; }, hint: 'Install Plugin Pages plugin to enable', missing: 'the Plugin Pages plugin is not installed', icon: 'extension' },
            { id: 'bookmarksUseCustomTabs',        checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'hiddenContentUseCustomTabs',    checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'downloadsUseCustomTabs',        checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'calendarUseCustomTabs',         checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'recommendationsUseCustomTabs',  checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'activityFeedUseCustomTabs',     checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'leavingSoonPageUseCustomTabs',     checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'catchUpUseCustomTabs',          checkFn: function() { return m.plugins.hasCustomTabs !== false; }, hint: 'Install Custom Tabs plugin to enable', missing: 'the Custom Tabs plugin is not installed', icon: 'extension' },
            { id: 'showLetterboxdLinkAsText', checkFn: function() { return !isMetadataIconsEnabled(); }, hint: 'Forced to icon mode while Metadata Icons (Druidblack) is enabled', missing: 'Metadata Icons (Druidblack) is on, which forces icon mode', icon: 'block' },
            { id: 'showArrLinksAsText',       checkFn: function() { return !isMetadataIconsEnabled(); }, hint: 'Forced to icon mode while Metadata Icons (Druidblack) is enabled', missing: 'Metadata Icons (Druidblack) is on, which forces icon mode', icon: 'block' }
        ];

        // Informational only (unlike INDIVIDUAL_DEPS) — Native Tab is more
        // reliable than Custom Tabs on Jellyfin 12, but Custom Tabs still works.
        var CUSTOM_TABS_V12_HINTS: readonly CustomTabsV12Hint[] = [
            { customId: 'bookmarksUseCustomTabs',       nativeId: 'bookmarksUseNativeTab',       bannerId: 'je-v12-hint-bookmarks' },
            { customId: 'hiddenContentUseCustomTabs',   nativeId: 'hiddenContentUseNativeTab',   bannerId: 'je-v12-hint-hiddenContent' },
            { customId: 'downloadsUseCustomTabs',       nativeId: 'downloadsUseNativeTab',       bannerId: 'je-v12-hint-downloads' },
            { customId: 'calendarUseCustomTabs',        nativeId: 'calendarUseNativeTab',        bannerId: 'je-v12-hint-calendar' },
            { customId: 'recommendationsUseCustomTabs', nativeId: 'recommendationsUseNativeTab', bannerId: 'je-v12-hint-recommendations' },
            { customId: 'activityFeedUseCustomTabs',    nativeId: 'activityFeedUseNativeTab',     bannerId: 'je-v12-hint-activityFeed' },
            { customId: 'leavingSoonPageUseCustomTabs',  nativeId: 'leavingSoonPageUseNativeTab',  bannerId: 'je-v12-hint-leavingSoonPage' },
            { customId: 'catchUpUseCustomTabs',         nativeId: 'catchUpUseNativeTab',         bannerId: 'je-v12-hint-catchUp' }
        ];

        /**
         * Shows the `je-note-banner` under a `*UseCustomTabs` checkbox, on
         * Jellyfin 12, when it's checked and its Native Tab counterpart isn't.
         * @param {Object} dep - Entry from CUSTOM_TABS_V12_HINTS
         */
        function updateCustomTabsV12Hint(dep: CustomTabsV12Hint) : void {
            var checkbox = asInput(document.getElementById(dep.customId));
            var banner = asHtml(document.getElementById(dep.bannerId));
            if (!checkbox || !banner) return;
            var nativeCheckbox = asInput(document.getElementById(dep.nativeId));
            var shouldWarn = m.plugins.isJellyfin12 && checkbox.checked && !(nativeCheckbox && nativeCheckbox.checked);
            banner.style.display = shouldWarn ? '' : 'none';
        }

        /**
         * Shows the warning under "Exclude search items already in library"
         * only while that checkbox is checked.
         */
        function updateSearchExcludeLibraryWarning() : void {
            var checkbox = asInput(document.getElementById('jellyseerrSearchExcludeLibraryItems'));
            var banner = asHtml(document.getElementById('je-search-exclude-library-warning'));
            if (!checkbox || !banner) return;
            banner.style.display = checkbox.checked ? '' : 'none';
        }

        /**
         * Adds a dependency tag to an element's comma-separated data-dep-disabled attribute.
         * @param {HTMLElement} el - The element to tag
         * @param {string} tag - The dependency tag to add
         */
        function addDepTag(el: HTMLElement, tag: string) : void {
            var existing = (el.getAttribute('data-dep-disabled') || '').split(',').filter(Boolean);
            if (existing.indexOf(tag) === -1) existing.push(tag);
            el.setAttribute('data-dep-disabled', existing.join(','));
        }

        /**
         * Removes a dependency tag from an element; returns true if all tags are cleared.
         * @param {HTMLElement} el - The element to update
         * @param {string} tag - The dependency tag to remove
         * @returns {boolean} True if no dependency tags remain on the element
         */
        function removeDepTag(el: HTMLElement, tag: string): boolean {
            var existing = (el.getAttribute('data-dep-disabled') || '').split(',').filter(Boolean);
            var filtered = existing.filter(function(t) { return t !== tag; });
            if (filtered.length) {
                el.setAttribute('data-dep-disabled', filtered.join(','));
                return false;
            }
            el.removeAttribute('data-dep-disabled');
            return true;
        }

        /**
         * A switch that is on stays operable while what it needs is missing, so it can be turned off (#867); one that
         * is off cannot be turned on. Its stored value is kept until the administrator changes it.
         */
        function isOn(el: Element) : boolean {
            return el instanceof HTMLInputElement && el.type === 'checkbox' && el.checked;
        }

        /** Adds or removes `hintId` in the control's aria-describedby, keeping any other description it has. */
        function describeBy(control: Element, hintId: string, on: boolean) : void {
            const ids = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(function(id) { return id && id !== hintId; });
            if (on) ids.push(hintId);
            if (ids.length) control.setAttribute('aria-describedby', ids.join(' ')); else control.removeAttribute('aria-describedby');
        }

        /** What a switch's row says while it is on and what it needs is missing ("On, but not working: …"), else null. */
        function notWorkingText(id: string) : string | null {
            const dep = INDIVIDUAL_DEPS.find(function(d) { return d.id === id; });
            const control = document.getElementById(id);
            return dep && control && isOn(control) && !dep.checkFn() ? 'On, but not working: ' + dep.missing + '.' : null;
        }

        /**
         * Creates an orange warning banner DOM element for a missing section dependency.
         * @param {Object} dep - Dependency rule with bannerIcon, bannerTitle, and bannerHint
         * @returns {HTMLElement} The constructed banner element
         */
        function createDepBanner(dep: SectionDep) : HTMLElement {
            var banner = document.createElement('div');
            banner.id = dep.bannerId;
            banner.className = 'je-dep-banner';
            var icon = document.createElement('i');
            icon.className = 'material-icons je-dep-banner-icon';
            icon.textContent = dep.bannerIcon;
            var textDiv = document.createElement('div');
            textDiv.className = 'je-dep-banner-text';
            var strong = document.createElement('strong');
            strong.textContent = dep.bannerTitle;
            var br = document.createElement('br');
            var span = document.createElement('span');
            span.className = 'je-dep-banner-hint';
            span.textContent = dep.bannerHint;
            textDiv.appendChild(strong);
            textDiv.appendChild(br);
            textDiv.appendChild(span);
            banner.appendChild(icon);
            banner.appendChild(textDiv);
            return banner;
        }

        /**
         * Evaluates one section-level dependency rule, showing/hiding banners and disabling inputs.
         * @param {Object} dep - Section dependency rule with checkFn, tabSelector, and banner config
         */
        function updateSectionDep(dep: SectionDep) : void {
            var isMet = dep.checkFn();
            var tab = asHtml(document.querySelector(dep.tabSelector));
            if (!tab) return;
            // Setup cards (Sonarr/Radarr/Bazarr/Shoko config, Seerr connection) stay editable: they carry data-dep-setup in the HTML.
            const targets = Array.from(tab.querySelectorAll<HTMLElement>(':scope > fieldset')).filter(function(f) { return !f.hasAttribute('data-dep-setup'); });

            // One banner for the whole tab instead of one per card; unavailable cards collapse to their title.
            var tabBannerId = dep.bannerId + '-tab';
            var banner = asHtml(document.getElementById(tabBannerId));
            if (!isMet) {
                if (!banner) {
                    banner = createDepBanner(dep);
                    banner.id = tabBannerId;
                    var intro = asHtml(tab.querySelector(':scope > .je-info-banner'));
                    if (intro) { intro.after(banner); } else { tab.prepend(banner); }
                }
                banner.classList.remove('je-hidden');
                banner.classList.add('je-dep-banner');
            } else if (banner) {
                banner.classList.add('je-hidden');
            }

            targets.forEach(function(fieldset) {
                fieldset.classList.toggle('jea-locked', !isMet);
                var legend = asHtml(fieldset.querySelector(':scope > legend'));
                if (legend) {
                    if (!isMet) { legend.setAttribute('data-lock', dep.lockHint || 'Not set up'); } else { legend.removeAttribute('data-lock'); }
                }
                if (!isMet) {
                    fieldset.querySelectorAll<FormControl>('input, select, textarea, button').forEach(function(el) {
                        el.disabled = !isOn(el);
                        addDepTag(el, dep.bannerId);
                    });
                } else {
                    fieldset.querySelectorAll<HTMLElement>('[data-dep-disabled]').forEach(function(el) {
                        var allClear = removeDepTag(el, dep.bannerId);
                        const lockable = asControl(el);
                        if (allClear && lockable) {
                            lockable.disabled = false;
                        }
                    });
                }
            });
        }

        /**
         * Evaluates one individual setting dependency, disabling checkbox and showing hint when unmet.
         * @param {Object} dep - Individual dependency rule with id, checkFn, hint, and icon
         */
        function updateIndividualDep(dep: IndividualDep) : void {
            var checkbox = asControl(document.getElementById(dep.id));
            if (!checkbox) return;
            var label = checkbox.closest('label');
            if (!label) return;
            var isMet = dep.checkFn();
            var tag = 'ind-' + dep.id;

            if (!isMet) {
                var on = isOn(checkbox);
                var why = on ? 'On, but not working: ' + dep.missing + '.' : dep.hint;
                checkbox.disabled = !on;
                addDepTag(checkbox, tag);
                label.style.opacity = on ? '' : '0.5';
                label.style.cursor = on ? '' : 'not-allowed';
                label.title = why;
                addDepTag(label, tag);
                var span = asHtml(label.querySelector('span'));
                if (span && !asHtml(label.querySelector('.dep-required-icon'))) {
                    var icon = document.createElement('i');
                    icon.className = 'material-icons dep-required-icon';
                    icon.textContent = dep.icon || 'key';
                    icon.style.cssText = 'font-size: 16px; vertical-align: middle; margin-left: 8px; color: #ff9800;';
                    icon.title = why;
                    span.appendChild(icon);
                }
                var hintEl = asHtml(label.querySelector('.dep-hint-text'));
                if (span && !hintEl) {
                    hintEl = document.createElement('span');
                    hintEl.className = 'dep-hint-text';
                    // Inside the label, so hidden from its name: it is read once, as the switch's description.
                    hintEl.id = dep.id + '-dep-hint';
                    hintEl.setAttribute('aria-hidden', 'true');
                    span.appendChild(hintEl);
                }
                if (hintEl) {
                    hintEl.textContent = why;
                    describeBy(checkbox, hintEl.id, true);
                }
            } else {
                var allClear = removeDepTag(checkbox, tag);
                if (allClear) checkbox.disabled = false;
                var labelClear = removeDepTag(label, tag);
                if (labelClear) {
                    label.style.opacity = '';
                    label.style.cursor = '';
                    label.title = '';
                }
                var reqIcon = asHtml(label.querySelector('.dep-required-icon'));
                if (reqIcon) reqIcon.remove();
                var hintText = asHtml(label.querySelector('.dep-hint-text'));
                if (hintText) {
                    describeBy(checkbox, hintText.id, false);
                    hintText.remove();
                }
            }
        }

        var PARENT_DEPS: readonly ParentDep[] = [
            { parent: 'elsewhereEnabled', children: ['DEFAULT_PROVIDERS', 'IGNORE_PROVIDERS', 'ElsewhereUseSeerrRegion', 'ElsewhereSeasonProviders', 'ElsewhereCustomBrandingText', 'ElsewhereCustomBrandingImageUrl'] },
            { parent: 'doesTheDogDieEnabled', children: ['doesTheDogDieApiKey'] },
            { parent: 'mdblistRatingsEnabled', children: ['mdblistApiKey', 'mdblistRatingsShowOnItemDetails', 'mdblistRatingsFetchEnabled', 'mdblistFetchReserve', 'mdblistRatingsAutoSyncEnabled', 'mdblistCommunityRatingSource', 'mdblistCommunityRatingFallbackSource', 'mdblistCriticRatingSource', 'mdblistCriticRatingFallbackSource', 'mdblistRatingsOverwriteExisting', 'mdblistRatingsShowPercentSymbol'] },
            { parent: 'showReviews', anyOf: ['showReviews', 'showUserReviews', 'showAnilistReviews'], children: ['reviewsExpandedByDefault'] },
            { parent: 'reviewTranslationEnabled', children: ['reviewTranslationUrl', 'reviewTranslationApiKey'] },
            { parent: 'showUserReviews', children: ['hideReviewsFromHiddenUsers', 'hideReviewsFromDisabledUsers', 'mirrorReviewRatingsToJellyfin', 'showUserRatingDash', 'showUserRatingOnPosters'] },
            { parent: 'randomButtonEnabled', children: ['randomUnwatchedOnly', 'randomIncludeMovies', 'randomIncludeShows', 'randomScopeCurrentContainer'] },
            { parent: 'showWatchProgress', children: ['watchProgressDefaultMode', 'watchProgressTimeFormat'] },
            { parent: 'useIcons', children: ['iconStyle'] },
            { parent: 'letterboxdEnabled', children: ['showLetterboxdLinkAsText'] },
            { parent: 'enableCustomSplashScreen', children: ['splashScreenImageUrl'] },
            { parent: 'jellyseerrShowSearchResults', children: ['showCollectionsInSearch'] },
            { parent: 'jellyseerrShowReportButton', children: ['jellyseerrShowIssueIndicator'] },
            { parent: 'jellyseerrShowDetailPageLink', children: ['jellyseerrShowDetailPageLinkAsText'] },
            { parent: 'downloadsPageEnabled', children: ['showDownloadsInRequests', 'downloadsPageShowIssues', 'downloadsShowHistory', 'downloadsUsePluginPages', 'downloadsUseNativeTab', 'downloadsUseCustomTabs', 'downloadsPagePollingEnabled'] },
            { parent: 'showDownloadsInRequests', children: ['downloadsFilterByUserRequests'] },
            { parent: 'downloadsShowHistory', children: ['downloadsHistoryAdminOnly'] },
            { parent: 'downloadsPagePollingEnabled', children: ['downloadsPollIntervalSeconds'] },
            { parent: 'arrLinksEnabled', children: ['showArrLinksAsText', 'arrLinksShowStatusSingle'] },
            { parent: 'arrTagsSyncEnabled', children: ['arrTagsPrefix', 'arrTagsClearOldTags', 'arrTagsShowAsLinks', 'arrTagsSyncFilter'] },
            { parent: 'arrTagsShowAsLinks', children: ['arrTagsLinksFilter', 'arrTagsLinksHideFilter'] },
            { parent: 'audioLanguageTagSyncEnabled', children: ['audioLanguageTagPrefix', 'audioLanguageTagShowAsLinks'] },
            { parent: 'calendarPageEnabled', children: ['calendarUsePluginPages', 'calendarUseNativeTab', 'calendarUseCustomTabs', 'calendarFirstDayOfWeek', 'calendarTimeFormat', 'calendarHighlightFavorites', 'calendarHighlightWatchedSeries', 'calendarFilterByLibraryAccess', 'calendarShowOnlyRequested', 'calendarForceOnlyRequested'] },
            { parent: 'recommendationsPageEnabled', children: ['recommendationsUseNativeTab', 'recommendationsUsePluginPages', 'recommendationsUseCustomTabs', 'recommendationsAutoCreateCustomTab'] },
            { parent: 'activityFeedEnabled', children: ['activityFeedShowWatched', 'activityFeedShowFavorited', 'activityFeedShowReviewed', 'activityFeedOwnOnlyForNonAdmins', 'activityFeedShowActiveStreams', 'activityFeedUseNativeTab', 'activityFeedUsePluginPages', 'activityFeedUseCustomTabs', 'activityFeedAutoCreateCustomTab'] },
            { parent: 'leavingSoonPageEnabled', children: ['leavingSoonPageUseNativeTab', 'leavingSoonPageUsePluginPages', 'leavingSoonPageUseCustomTabs', 'leavingSoonPageAutoCreateCustomTab'] },
            { parent: 'catchUpEnabled', children: ['catchUpLogEnabled', 'catchUpUseNativeTab', 'catchUpUsePluginPages', 'catchUpUseCustomTabs', 'catchUpAutoCreateCustomTab'] },
            { parent: 'autoMovieRequestEnabled', children: ['autoMovieRequestTriggerOnStart', 'autoMovieRequestTriggerOnMinutesWatched', 'autoMovieRequestMinutesWatched', 'autoMovieRequestCheckReleaseDate', 'autoMovieRequestQualityMode', 'autoMovieRequestFallbackOn4k'] },
            { parent: 'autoSeasonRequestEnabled', children: ['autoSeasonRequestRequireAllWatched', 'autoSeasonRequestThresholdValue'] },
            { parent: 'preventWatchlistReAddition', children: ['watchlistMemoryRetentionDays'] },
            { parent: 'triggerSeerrScanOnItemAdded', children: ['seerrScanDebounceSeconds'] },
            { parent: 'bookmarksEnabled', children: ['bookmarksUsePluginPages', 'bookmarksUseNativeTab', 'bookmarksUseCustomTabs'] },
            { parent: 'hiddenContentEnabled', children: ['hiddenContentUsePluginPages', 'hiddenContentUseNativeTab', 'hiddenContentUseCustomTabs'] },
            { parent: 'spoilerBlurEnabled', children: ['spoilerBlurIntensity', 'spoilerBlurArtwork', 'spoilerStripSeriesOverview', 'spoilerStripOverview', 'spoilerOverviewPlaceholder', 'spoilerStripTags', 'spoilerStripChapters', 'spoilerStripTaglines', 'spoilerStripRatings', 'spoilerStripPremiereDate', 'spoilerReplaceTitle', 'spoilerStripCast', 'spoilerAutoEnableOnFirstPlay', 'spoilerAutoEnableOnSeerrRequest', 'spoilerAutoEnableOnLibraryAdd', 'spoilerAutoEnableSeries', 'spoilerAutoEnableMovies', 'spoilerBlurStrictRefresh', 'spoilerKeepMoviePosters', 'spoilerBlurTrickplay', 'spoilerAdvancedMode'] },
            { parent: 'spoilerStripCast', children: ['spoilerStripCastMode'] },
            { parent: 'spoilerAdvancedMode', children: ['spoilerNextEpisodeStripTitle', 'spoilerNextEpisodeStripOverview', 'spoilerNextEpisodeStripRatings', 'spoilerNextEpisodeStripImage', 'spoilerCurrentSeasonStripTitle', 'spoilerCurrentSeasonStripOverview', 'spoilerCurrentSeasonStripRatings'] }
        ];

        /**
         * Evaluates one parent-child dependency, disabling children when the parent is unchecked.
         * @param {Object} dep - Parent dependency rule with parent id, label, and children ids
         */
        // Hide (not just dim) a dependent setting and its description while its parent is off. Search mode shows them again via CSS.
        function jeaSetDepHidden(container: Element, childId: string, hide: boolean) : void {
            container.classList.toggle('jea-dep-hidden', hide);
            var d = asHtml(document.querySelector('.je-setting-description[data-desc-for="' + childId + '"]'));
            if (d) d.classList.toggle('jea-dep-hidden', hide);
        }

        /**
         * "Don't re-add removed items" and its retention days only matter when removals are set to "Seerr decides"
         * or "Never". With "Jellyfin decides" or "Both", a removal in Jellyfin also removes the item from Seerr, so
         * there is nothing left to re-add and both rows are hidden. Runs after the parent pass, which would otherwise
         * show the days row and its description again whenever the toggle is on.
         */
        function updateWatchlistMemoryVisibility() : void {
            var mode = asControl(document.querySelector('#watchlistRemovalSync'));
            var toggle = asInput(document.querySelector('#preventWatchlistReAddition'));
            var days = asHtml(document.querySelector('#watchlistMemoryRetentionDays'));
            if (!mode || !toggle || !days) return;
            var applies = mode.value === 'seerr' || mode.value === 'off';
            var toggleRow = toggle.closest('.checkboxContainer, .inputContainer, .selectContainer') || toggle.closest('label');
            var daysRow = asHtml(days.closest('.inputContainer'));
            if (toggleRow) jeaSetDepHidden(toggleRow, 'preventWatchlistReAddition', !applies);
            var showDays = applies && toggle.checked;
            if (daysRow) {
                daysRow.style.display = showDays ? '' : 'none';
                jeaSetDepHidden(daysRow, 'watchlistMemoryRetentionDays', !showDays);
            }
        }

        /** A switch's label as the page shows it: its own text, without the badges and hints added into it. */
        function switchLabel(id: string): string {
            var label = document.getElementById(id)?.closest('label');
            // Rendered rows keep the text in .jea-label-text (the markers sit beside it); hand-written ones in their first span.
            var span = asHtml(label?.querySelector('.jea-label-text') ?? label?.querySelector('span') ?? null);
            var own = span ? Array.from(span.childNodes).filter(function(n) { return n.nodeType === Node.TEXT_NODE; }).map(function(n) { return n.textContent; }).join('').trim() : '';
            return own || id;
        }

        /** The parent switch(es) by their labels: '“A”', or '“A”, “B” or “C”' when any of them will do (a label can hold straight quotes). */
        function parentNames(dep: ParentDep): string {
            var names = (dep.anyOf || [dep.parent]).map(function(id) { return '\u201c' + switchLabel(id) + '\u201d'; });
            return names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names[0] ?? '';
        }

        function updateParentDep(dep: ParentDep) : void {
            var parent = asHtml(document.getElementById(dep.parent));
            if (!parent) return;
            var isEnabled = (dep.anyOf || [dep.parent]).some(function(id) {
                var el = asInput(document.getElementById(id));
                return !!(el && el.checked);
            });
            var tag = 'parent-' + dep.parent;
            var hintClass = 'parent-hint-' + dep.parent;

            dep.children.forEach(function(childId) {
                var child = asControl(document.getElementById(childId));
                if (!child) return;
                var container = asHtml(child.closest('.checkboxContainer, .inputContainer, .selectContainer'))
                             || child.closest('label');

                if (!isEnabled) {
                    var on = isOn(child);
                    child.disabled = !on;
                    addDepTag(child, tag);
                    if (container) {
                        container.style.opacity = on ? '' : '0.5';
                        container.style.cursor = on ? '' : 'not-allowed';
                        addDepTag(container, tag);
                        jeaSetDepHidden(container, childId, true);
                        // Add hint unless the dependency opted out (e.g. tag-position
                        // dropdowns, where the disabled styling next to the parent
                        // checkbox already makes the relationship obvious).
                        var hint = asHtml(container.querySelector('.' + hintClass));
                        if (!dep.noHint && !hint) {
                            hint = document.createElement('div');
                            hint.className = 'dep-hint-text ' + hintClass;
                            hint.id = childId + '-' + hintClass;
                            container.appendChild(hint);
                        }
                        if (hint) {
                            hint.textContent = on ? 'On, but needs ' + parentNames(dep) + ' on to work' : 'Needs ' + parentNames(dep) + ' on';
                            describeBy(child, hint.id, true);
                        }
                    }
                } else {
                    var allClear = removeDepTag(child, tag);
                    if (allClear) child.disabled = false;
                    if (container) {
                        var cc = removeDepTag(container, tag);
                        if (cc) { container.style.opacity = ''; container.style.cursor = ''; jeaSetDepHidden(container, childId, false); }
                        // Remove hint
                        var hintEl = asHtml(container.querySelector('.' + hintClass));
                        if (hintEl) {
                            describeBy(child, hintEl.id, false);
                            hintEl.remove();
                        }
                    }
                }
            });
        }

        /**
         * Shows the notes under Default Region and at the top of Elsewhere when Seerr
         * is configured and no TMDB key is set: streaming providers then come from Seerr.
         */
        function updateRegionSourceNote() : void {
            var seerrMode = !hasTmdbKey() && hasJellyseerrConfigured();
            document.querySelectorAll<HTMLElement>('.je-region-source-note').forEach(function(el) { el.style.display = seerrMode ? 'flex' : 'none'; });
        }

    /** Runs this module's start-up work, in the page's original order. */
    function wire(): void {

    }

    return {
        wire,
        CUSTOM_TABS_V12_HINTS,
        INDIVIDUAL_DEPS,
        PARENT_DEPS,
        SECTION_DEPS,
        hasAnyArrService,
        hasJellyseerrConfigured,
        notWorkingText,
        updateCustomTabsV12Hint,
        updateIndividualDep,
        updateParentDep,
        updateRegionSourceNote,
        updateSearchExcludeLibraryWarning,
        updateSectionDep,
        updateWatchlistMemoryVisibility,
    };
}
