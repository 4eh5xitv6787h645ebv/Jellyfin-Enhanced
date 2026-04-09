// /js/tags/languagetags.js
// Jellyfin Language Flags Overlay
(function(JE) {
    'use strict';

    JE.initializeLanguageTags = function() {
        const logPrefix = '🪼 Jellyfin Enhanced: Language Tags:';
        const containerClass = 'language-overlay-container';
        const flagClass = 'language-flag';
        const TAGGED_ATTR = 'jeLanguageTagged';
        const CACHE_KEY = 'JellyfinEnhanced-languageTagsCache';
        const CACHE_TIMESTAMP_KEY = 'JellyfinEnhanced-languageTagsCacheTimestamp';
        const ENABLE_LOCAL_STORAGE_FALLBACK =
            JE.pluginConfig?.TagCacheServerMode === false ||
            JE.pluginConfig?.EnableTagsLocalStorageFallback === true;
        const CACHE_TTL = (JE.pluginConfig?.TagsCacheTtlDays || 30) * 24 * 60 * 60 * 1000;
        const langDisplayNames = new Intl.DisplayNames(['en'], { type: 'language' });

        // CSS selectors for elements that should NOT have language tags applied.
        // This is used to ignore certain views like the cast & crew list.
        const IGNORE_SELECTORS = [
            '#itemDetailPage .infoWrapper .cardImageContainer',
            '#itemDetailPage #castCollapsible .cardImageContainer',
            '#indexPage .verticalSection.MyMedia .cardImageContainer',
            '.formDialog .cardImageContainer',
            '#itemDetailPage .chapterCardImageContainer',
            // Admin/dashboard pages
            '#pluginsPage .cardImageContainer',
            '#pluginsPage .card',
            '#pluginCatalogPage .cardImageContainer',
            '#pluginCatalogPage .card',
            '#devicesPage .cardImageContainer',
            '#devicesPage .card',
            '#mediaLibraryPage .cardImageContainer',
            '#mediaLibraryPage .card'
        ];

        // Add search page to ignore list if configured (Gelato compatibility)
        if (JE.pluginConfig?.DisableTagsOnSearchPage === true) {
            IGNORE_SELECTORS.push('#searchPage .cardImageContainer');
        }

        let langCache = ENABLE_LOCAL_STORAGE_FALLBACK
            ? JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
            : {};
        const Hot = (JE._hotCache = JE._hotCache || { ttl: CACHE_TTL });
        Hot.language = Hot.language || new Map();

        function saveCache() {
            if (!ENABLE_LOCAL_STORAGE_FALLBACK) return;
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(langCache)); }
            catch (e) { console.warn(`${logPrefix} Failed to save cache`, e); }
        }

        function cleanupOldCaches() {
            if (!ENABLE_LOCAL_STORAGE_FALLBACK) return;
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.startsWith('languageTagsCache-') || key === 'languageTagsCache' || key === 'languageTagsCacheTimestamp') && key !== CACHE_KEY && key !== CACHE_TIMESTAMP_KEY) {
                    localStorage.removeItem(key);
                }
            }
            const serverClearTimestamp = JE.pluginConfig?.ClearLocalStorageTimestamp || 0;
            const localCacheTimestamp = parseInt(localStorage.getItem(CACHE_TIMESTAMP_KEY) || '0', 10);
            if (serverClearTimestamp > localCacheTimestamp) {
                console.log(`${logPrefix} Server triggered cache clear (${new Date(serverClearTimestamp).toISOString()})`);
                localStorage.removeItem(CACHE_KEY);
                localStorage.setItem(CACHE_TIMESTAMP_KEY, serverClearTimestamp.toString());
                langCache = {};
                if (JE._hotCache?.language) JE._hotCache.language.clear();
            }
        }

        // Language to country code mapping (shared with features.js).
        // Regional BCP-47 keys below are stored lowercase so a case-insensitive lookup
        // can match ffprobe's lowercase `pt-br` as well as Sonarr's mixed-case `pt-BR`
        // — see lookupRegionalCode() below.
        const languageToCountryMap = {
            English: 'gb', eng: 'gb', Japanese: 'jp', jpn: 'jp', Spanish: 'es', spa: 'es', French: 'fr', fre: 'fr', fra: 'fr',
            German: 'de', ger: 'de', deu: 'de', Italian: 'it', ita: 'it', Korean: 'kr', kor: 'kr', Chinese: 'cn', chi: 'cn',
            zho: 'cn', Russian: 'ru', rus: 'ru', Portuguese: 'pt', por: 'pt', Hindi: 'in', hin: 'in', Dutch: 'nl', dut: 'nl',
            nld: 'nl', Arabic: 'sa', ara: 'sa', Bengali: 'in', ben: 'in', Czech: 'cz', ces: 'cz', Danish: 'dk',
            dan: 'dk', Greek: 'gr', ell: 'gr', Finnish: 'fi', fin: 'fi', Hebrew: 'il', heb: 'il', Hungarian: 'hu',
            hun: 'hu', Indonesian: 'id', ind: 'id', Norwegian: 'no', nor: 'no', Polish: 'pl', pol: 'pl', Persian: 'ir',
            per: 'ir', fas: 'ir', Romanian: 'ro', ron: 'ro', rum: 'ro', Swedish: 'se', swe: 'se', Thai: 'th', tha: 'th',
            Turkish: 'tr', tur: 'tr', Ukrainian: 'ua', ukr: 'ua', Vietnamese: 'vn', vie: 'vn', Malay: 'my', msa: 'my',
            may: 'my', Swahili: 'ke', swa: 'ke', Tagalog: 'ph', tgl: 'ph', Filipino: 'ph', Tamil: 'in', tam: 'in',
            Telugu: 'in', tel: 'in', Marathi: 'in', mar: 'in', Punjabi: 'in', pan: 'in', Urdu: 'pk', urd: 'pk',
            Gujarati: 'in', guj: 'in', Kannada: 'in', kan: 'in', Malayalam: 'in', mal: 'in', Sinhala: 'lk', sin: 'lk',
            Nepali: 'np', nep: 'np', Pashto: 'af', pus: 'af', Kurdish: 'iq', kur: 'iq', Slovak: 'sk', slk: 'sk',
            Slovenian: 'si', slv: 'si', Serbian: 'rs', srp: 'rs', Croatian: 'hr', hrv: 'hr', Bulgarian: 'bg', bul: 'bg',
            Macedonian: 'mk', mkd: 'mk', Albanian: 'al', sqi: 'al', Estonian: 'ee', est: 'ee', Latvian: 'lv', lav: 'lv',
            Lithuanian: 'lt', lit: 'lt', Icelandic: 'is', isl: 'is', Georgian: 'ge', kat: 'ge', Armenian: 'am',
            hye: 'am', Mongolian: 'mn', mon: 'mn', Kazakh: 'kz', kaz: 'kz', Uzbek: 'uz', uzb: 'uz', Azerbaijani: 'az',
            aze: 'az', Belarusian: 'by', bel: 'by', Amharic: 'et', amh: 'et', Zulu: 'za', zul: 'za', Afrikaans: 'za',
            afr: 'za', Hausa: 'ng', hau: 'ng', Yoruba: 'ng', yor: 'ng', Igbo: 'ng', ibo: 'ng', Brazilian: 'br', bra: 'br',
            Bosnian: 'ba', bos: 'ba', Flemish: 'be', Romansh: 'ch', roh: 'ch',
            Catalan: 'es-ct', cat: 'es-ct', ca: 'es-ct', Galician: 'es-ga', glg: 'es-ga', gl: 'es-ga', Basque: 'es-pv',
            baq: 'es-pv', eus: 'es-pv',
            // Regional BCP-47 variants — surface a region-specific flag when the file or arr
            // metadata is regionally tagged. Sonarr/Radarr explicitly track Brazilian Portuguese
            // and Latino Spanish; the rest light up only when the file's container language tag
            // is BCP-47 (rare but spec-allowed for MKVs and the issue reporter's use case).
            // Keys are lowercase — lookupRegionalCode() normalizes incoming codes before lookup.
            'pt-br': 'br', 'pt-pt': 'pt',
            'en-us': 'us', 'en-gb': 'gb', 'en-au': 'au', 'en-ca': 'ca', 'en-nz': 'nz', 'en-ie': 'ie',
            'es-es': 'es', 'es-mx': 'mx', 'es-419': 'mx', 'es-ar': 'ar', 'es-co': 'co', 'es-cl': 'cl',
            'fr-fr': 'fr', 'fr-ca': 'ca', 'fr-be': 'be', 'fr-ch': 'ch',
            'de-de': 'de', 'de-at': 'at', 'de-ch': 'ch',
            'zh-cn': 'cn', 'zh-tw': 'tw', 'zh-hk': 'hk', 'zh-sg': 'sg',
            'it-it': 'it', 'it-ch': 'ch',
            'nl-nl': 'nl', 'nl-be': 'be', 'nl-sr': 'sr',
            'ar-sa': 'sa', 'ar-eg': 'eg', 'ar-ae': 'ae', 'ar-ma': 'ma'
        };

        /**
         * Look up a BCP-47 code (like "pt-BR", "pt-br", or "en_US") in the country map.
         * Normalizes case and separator so ffprobe's lowercase and Sonarr's mixed-case both
         * match the same entry. Returns null when no regional mapping is registered.
         */
        function lookupRegionalCode(code) {
            if (!code) return null;
            const normalized = code.toString().replace('_', '-').toLowerCase();
            return languageToCountryMap[normalized] || null;
        }

        // Names emitted by Sonarr/Radarr's language enum that don't match the base name.
        // Keyed by lowercased name → BCP-47 code so the resolver doesn't need a separate path.
        const arrRegionalNameToCode = {
            'portuguese (brazil)': 'pt-BR',
            'spanish (latino)': 'es-419',
            'spanish (latin america)': 'es-419',
            'flemish': 'nl-BE',
            'chinese (mandarin)': 'zh-CN',
            'chinese (cantonese)': 'zh-HK'
        };

        // ffprobe/Jellyfin typically returns ISO 639-2/B (3-letter, e.g. "por", "spa", "eng")
        // while arr enrichment uses ISO 639-1 (2-letter, e.g. "pt", "es", "en"). To correctly
        // collapse "por" with "pt-BR" into a single regional entry, both sides need to be
        // normalized to the same canonical family key.
        const iso6392ToFamily = {
            por: 'pt', spa: 'es', eng: 'en',
            fre: 'fr', fra: 'fr',
            ger: 'de', deu: 'de',
            ita: 'it', jpn: 'ja', kor: 'ko',
            chi: 'zh', zho: 'zh',
            rus: 'ru', ara: 'ar', hin: 'hi',
            dut: 'nl', nld: 'nl', hol: 'nl',
            pol: 'pl', tur: 'tr', ukr: 'uk',
            swe: 'sv', nor: 'no', dan: 'da',
            fin: 'fi', ces: 'cs', slk: 'sk',
            ell: 'el', heb: 'he', hun: 'hu',
            ron: 'ro', rum: 'ro',
            bul: 'bg', srp: 'sr', hrv: 'hr',
            tha: 'th', vie: 'vi', ind: 'id',
            msa: 'ms', may: 'ms',
            fas: 'fa', per: 'fa',
            ben: 'bn', tam: 'ta', tel: 'te',
            mar: 'mr', guj: 'gu', pan: 'pa',
            kan: 'kn', mal: 'ml', urd: 'ur',
            bos: 'bs', roh: 'rm'
        };

        /**
         * Map a language code (ISO 639-1, 639-2, or BCP-47) to its canonical family key.
         * Used for collapsing "por" with "pt-BR" during regional merge.
         */
        function canonicalFamilyKey(code) {
            const base = (code || '').toString().split('-')[0].toLowerCase();
            if (!base) return '';
            return iso6392ToFamily[base] || base;
        }


        /**
         * Resolve a {name, code} language object to a country code for the flag CDN.
         * Priority: regional BCP-47 code → arr-style regional name → base code → name.
         * Per-item manual overrides are applied upstream in mergeRegionalLanguages
         * (from ManualRegionOverrides on the TagCacheEntry), so by the time a language
         * reaches this function, its code is already the correct regional variant.
         * Returns null when no flag is appropriate.
         */
        function resolveCountryCode(lang) {
            if (!lang) return null;
            var code = (lang.code || '').toString().trim();
            var name = (lang.name || '').toString().trim();
            var lowerName = name.toLowerCase();

            // 1. Full BCP-47 code with region (e.g. "pt-BR" → "br"). Case-insensitive
            // via lookupRegionalCode so ffprobe's lowercase "pt-br" matches Sonarr's "pt-BR".
            if (code.includes('-')) {
                var regionalCountry = lookupRegionalCode(code);
                if (regionalCountry) return regionalCountry;
            }
            // 2. Arr-style regional name (e.g. "Portuguese (Brazil)" → "br")
            if (arrRegionalNameToCode[lowerName]) {
                var bcp = arrRegionalNameToCode[lowerName];
                var mapped = lookupRegionalCode(bcp);
                if (mapped) return mapped;
            }
            // 3. Fall back to base code or name lookup.
            var baseCode = code.split('-')[0].toLowerCase();
            return languageToCountryMap[name] || languageToCountryMap[baseCode] || null;
        }

        /**
         * Extracts audio languages from a Jellyfin item's media sources.
         * @param {Object} sourceItem - The item (or first episode) to extract languages from.
         * @returns {Array<{name: string, code: string}>} Normalized array of language objects.
         */
        function extractLanguagesFromItem(sourceItem) {
            if (!sourceItem) return [];
            const languages = new Set();

            // Process audio streams from a flat list
            const processStreams = function(streams) {
                if (!streams) return;
                streams.filter(function(s) { return s.Type === 'Audio'; }).forEach(function(stream) {
                    var langCode = stream.Language;
                    if (langCode && !['und', 'root'].includes(langCode.toLowerCase())) {
                        try {
                            var langName = langDisplayNames.of(langCode);
                            languages.add(JSON.stringify({ name: langName, code: langCode }));
                        } catch (e) {
                            languages.add(JSON.stringify({ name: langCode.toUpperCase(), code: langCode }));
                        }
                    }
                });
            };

            // Handle both formats: nested MediaSources[].MediaStreams[] and flat MediaStreams[]
            if (sourceItem.MediaSources) {
                sourceItem.MediaSources.forEach(function(source) {
                    processStreams(source.MediaStreams);
                });
            }
            if (sourceItem.MediaStreams) {
                processStreams(sourceItem.MediaStreams);
            }

            return normalizeLanguages(Array.from(languages).map(JSON.parse));
        }


        function computePositionStyles(position) {
            const pos = (position || JE.currentSettings?.languageTagsPosition || JE.pluginConfig?.LanguageTagsPosition || 'bottom-left');
            const styles = { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' };
            if (pos.includes('top')) styles.top = '6px'; else styles.bottom = '6px';
            if (pos.includes('left')) styles.left = '6px'; else styles.right = '6px';
            return styles;
        }

        // Normalize different shapes of language arrays into [{ name, code }] and de-duplicate.
        // Region suffixes (pt-BR, en-US) are PRESERVED so resolveCountryCode can pick a regional flag.
        function normalizeLanguages(languages) {
            if (!Array.isArray(languages)) return [];
            const norm = [];
            const seen = new Set();
            for (const entry of languages) {
                let obj = null;
                if (!entry) continue;
                if (typeof entry === 'string') {
                    // Handle legacy cache that stored ["en", "fr", ...]
                    const fullCode = entry.trim();
                    const baseCode = fullCode.split('-')[0].toLowerCase();
                    let name = null;
                    try { name = langDisplayNames.of(fullCode) || langDisplayNames.of(baseCode) || fullCode.toUpperCase(); }
                    catch { name = fullCode.toUpperCase(); }
                    obj = { name, code: fullCode };
                } else if (typeof entry === 'object') {
                    const fullCode = (entry.code || entry.Code || '').toString().trim();
                    const baseCode = fullCode.split('-')[0].toLowerCase();
                    const name = entry.name || entry.Name || null;
                    if (fullCode) {
                        let resolvedName = name;
                        try { if (!resolvedName) resolvedName = langDisplayNames.of(fullCode) || langDisplayNames.of(baseCode) || fullCode.toUpperCase(); }
                        catch { resolvedName = (name || fullCode.toUpperCase()); }
                        obj = { name: resolvedName, code: fullCode };
                    }
                }
                if (!obj) continue;
                const key = `${obj.code.toLowerCase()}|${(obj.name || '').toLowerCase()}`;
                if (!seen.has(key)) { seen.add(key); norm.push(obj); }
            }
            return norm;
        }

        /**
         * Merge a base language list with arr-sourced regional variants. When the arr knows
         * a more specific code for a language already present in the base list, the regional
         * entry replaces the base one. Other base entries pass through unchanged.
         * Matching uses canonicalFamilyKey() so "por" correctly collapses with "pt-BR".
         */
        function mergeRegionalLanguages(base, regional) {
            if (!Array.isArray(regional) || regional.length === 0) return base || [];
            const baseList = Array.isArray(base) ? base.slice() : [];
            const regionalByFamily = {};
            for (const entry of regional) {
                if (!entry) continue;
                const code = (entry.code || entry.Code || '').toString().trim();
                if (!code) continue;
                const family = canonicalFamilyKey(code);
                // If the arr returns multiple regionals for the same family (hypothetical
                // pt-BR + pt-PT), keep the first — current arr enums only have one per family.
                if (!regionalByFamily[family]) {
                    regionalByFamily[family] = {
                        name: entry.name || entry.Name || code,
                        code: code
                    };
                }
            }
            const seenFamilies = new Set();
            const merged = [];
            for (const entry of baseList) {
                const family = canonicalFamilyKey(entry.code);
                if (regionalByFamily[family]) {
                    if (!seenFamilies.has(family)) {
                        merged.push(regionalByFamily[family]);
                        seenFamilies.add(family);
                    }
                } else {
                    merged.push(entry);
                    seenFamilies.add(family);
                }
            }
            // Append any regional entries that didn't match a base entry
            for (const family of Object.keys(regionalByFamily)) {
                if (!seenFamilies.has(family)) {
                    merged.push(regionalByFamily[family]);
                }
            }
            return merged;
        }

        function insertLanguageTags(container, languages) {
            if (!container) return;
            if (isCardAlreadyTagged(container)) return;
            const existing = container.querySelector(`.${containerClass}`);
            // Always re-render to handle cache migrations or setting changes
            if (existing) existing.remove();
            container.style.position = 'relative'; // Avoid forced reflow from getComputedStyle

            const wrap = document.createElement('div');
            wrap.className = containerClass;
            const pos = computePositionStyles();
            wrap.style.position = 'absolute';
            wrap.style.top = pos.top; wrap.style.right = pos.right; wrap.style.bottom = pos.bottom; wrap.style.left = pos.left;
            // If positioned top-right and the card has indicators, add a top margin to avoid overlap
            const hasIndicators = !!container.querySelector('.cardIndicators');
            const isTopRight = pos.top !== 'auto' && pos.right !== 'auto';
            if (hasIndicators && isTopRight) {
                wrap.style.marginTop = 'clamp(20px, 3vw, 30px)';
            }

            const normalized = normalizeLanguages(languages);
            const maxToShow = 3;
            const seenCountries = new Set();
            const uniqueFlags = [];

            // Deduplicate by country code while preserving language info for tooltips
            normalized.forEach(lang => {
                const codeKey = (lang.code || '').toString().split('-')[0];
                const nameKey = (lang.name || '').toString();
                const countryCode = resolveCountryCode(lang);
                if (countryCode && !seenCountries.has(countryCode)) {
                    seenCountries.add(countryCode);
                    uniqueFlags.push({ countryCode, name: nameKey || codeKey.toUpperCase(), allLanguages: [nameKey || codeKey.toUpperCase()] });
                } else if (countryCode && seenCountries.has(countryCode)) {
                    // Add language name to existing country's tooltip
                    const existingFlag = uniqueFlags.find(f => f.countryCode === countryCode);
                    if (existingFlag && !existingFlag.allLanguages.includes(nameKey || codeKey.toUpperCase())) {
                        existingFlag.allLanguages.push(nameKey || codeKey.toUpperCase());
                    }
                }
            });

            uniqueFlags.slice(0, maxToShow).forEach(flagInfo => {
                const img = document.createElement('img');
                img.src = `https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.1/flags/4x3/${flagInfo.countryCode.toLowerCase()}.svg`;
                img.className = flagClass;
                img.alt = flagInfo.allLanguages.join(', ');
                img.title = flagInfo.allLanguages.join(', ');
                img.loading = 'lazy';
                img.dataset.lang = flagInfo.countryCode.toLowerCase();
                img.dataset.langName = flagInfo.allLanguages.join(', ');
                wrap.appendChild(img);
            });
            if (wrap.children.length > 0) {
                container.appendChild(wrap);
                markCardTagged(container);
                // Admin-only: attach right-click handler for per-item region override
                var popoverItemId = getItemIdFromCard(container);
                if (popoverItemId) attachRegionPopoverHandler(wrap, popoverItemId);
            }
        }

        // ---- Per-item region override popover (admin-only, issue #544) ----

        // Build a lookup of language family → available regional options from the country map.
        // e.g. "pt" → [{code:"pt-br", label:"Brazil", country:"br"}, {code:"pt-pt", label:"Portugal", country:"pt"}]
        var _regionOptions = null;
        function getRegionOptions() {
            if (_regionOptions) return _regionOptions;
            _regionOptions = {};
            var regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            for (var key in languageToCountryMap) {
                if (!key.includes('-')) continue; // only regional keys like "pt-br"
                var parts = key.split('-');
                var family = parts[0];
                var regionPart = parts.slice(1).join('-');
                var country = languageToCountryMap[key];
                var label = country.toUpperCase();
                try { label = regionNames.of(country.toUpperCase()) || label; } catch(e) {}
                if (!_regionOptions[family]) _regionOptions[family] = [];
                _regionOptions[family].push({ code: key, country: country, label: label });
            }
            return _regionOptions;
        }

        function getItemIdFromCard(el) {
            // Try data-itemid on ancestors
            var card = el.closest('.card') || el.closest('[data-itemid]');
            if (card && card.dataset.itemid) return card.dataset.itemid;
            // Try an <a> ancestor with id= in href
            var link = el.closest('a[href*="id="]');
            if (link) {
                var m = link.href.match(/[?&]id=([^&#]+)/);
                if (m) return m[1];
            }
            // The tag pipeline renders overlays into .je-tag-host which is a SIBLING of the
            // <a class="cardImageContainer"> link. Look for the link WITHIN the same card.
            if (card) {
                var cardLink = card.querySelector('a.cardImageContainer[href*="id="]');
                if (cardLink) {
                    var cm = cardLink.href.match(/[?&]id=([^&#]+)/);
                    if (cm) return cm[1];
                }
            }
            // Background image fallback
            if (el.style && el.style.backgroundImage) {
                var bgMatch = el.style.backgroundImage.match(/Items\/(.*?)\//);
                if (bgMatch) return bgMatch[1];
            }
            return null;
        }

        /**
         * Show the region-override popover anchored to a flag overlay container.
         * Admin right-clicks a flag → popover with per-language region dropdowns.
         */
        function showRegionPopover(overlayEl, itemId) {
            // Close any existing popover
            var existing = document.getElementById('je-region-popover');
            if (existing) existing.remove();

            // Detect which audio languages this item has from the rendered flags
            var flags = Array.from(overlayEl.querySelectorAll('.' + flagClass));
            if (flags.length === 0) return;

            var regionOpts = getRegionOptions();
            var languageFamilies = [];
            flags.forEach(function(img) {
                var langName = img.dataset.langName || '';
                var langCountry = img.dataset.lang || '';
                // Resolve the language family from the country code via reverse-lookup.
                // The map has both NAME keys ("English") and CODE keys ("eng"). We want the
                // CODE key so canonicalFamilyKey maps it correctly (eng → en, por → pt).
                var bestFamily = null;
                for (var key in languageToCountryMap) {
                    if (key.includes('-')) continue; // skip regional entries
                    if (languageToCountryMap[key] !== langCountry) continue;
                    var family = canonicalFamilyKey(key);
                    // Prefer the mapping that actually has regional options
                    if (family && regionOpts[family] && regionOpts[family].length > 1) {
                        bestFamily = family;
                        break;
                    }
                    // Also try: if the key is short (3 chars = ISO 639-2), it's more likely
                    // to map correctly than a long NAME key
                    if (!bestFamily && family && key.length <= 3) {
                        bestFamily = family;
                    }
                }
                if (bestFamily && regionOpts[bestFamily] && regionOpts[bestFamily].length > 1) {
                    if (!languageFamilies.find(function(f) { return f.family === bestFamily; })) {
                        languageFamilies.push({
                            family: bestFamily,
                            name: langName.split(',')[0].trim(),
                            currentCountry: langCountry
                        });
                    }
                }
            });

            if (languageFamilies.length === 0) {
                JE.toast?.('No regional variants available for this language');
                return;
            }

            // Build popover DOM
            var popover = document.createElement('div');
            popover.id = 'je-region-popover';
            popover.style.cssText = 'position:fixed;z-index:10000;background:var(--theme-card-background,#1c1c1e);' +
                'border:1px solid rgba(255,255,255,0.15);border-radius:8px;padding:12px 16px;min-width:220px;' +
                'box-shadow:0 8px 24px rgba(0,0,0,0.5);font-size:0.9em;color:var(--theme-text-color,#fff);';

            var title = document.createElement('div');
            title.textContent = 'Set Language Region';
            title.style.cssText = 'font-weight:600;margin-bottom:10px;font-size:1em;';
            popover.appendChild(title);

            languageFamilies.forEach(function(lf) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;';

                var label = document.createElement('span');
                label.textContent = lf.name + ':';
                label.style.cssText = 'min-width:80px;';
                row.appendChild(label);

                var select = document.createElement('select');
                select.dataset.family = lf.family;
                select.style.cssText = 'flex:1;background:rgba(255,255,255,0.1);color:inherit;border:1px solid rgba(255,255,255,0.2);' +
                    'border-radius:4px;padding:4px 8px;font-size:0.95em;';

                var autoOpt = document.createElement('option');
                autoOpt.value = '';
                autoOpt.textContent = 'Auto (detected)';
                select.appendChild(autoOpt);

                regionOpts[lf.family].forEach(function(opt) {
                    var o = document.createElement('option');
                    o.value = opt.code;
                    o.textContent = opt.label + ' (' + opt.country.toUpperCase() + ')';
                    if (opt.country === lf.currentCountry) o.selected = true;
                    select.appendChild(o);
                });

                row.appendChild(select);
                popover.appendChild(row);
            });

            // Buttons
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:8px;margin-top:10px;justify-content:flex-end;';

            var cancelBtn = document.createElement('button');
            cancelBtn.textContent = 'Cancel';
            cancelBtn.style.cssText = 'padding:4px 12px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);' +
                'background:transparent;color:inherit;cursor:pointer;';
            cancelBtn.onclick = function() { popover.remove(); backdrop.remove(); };
            btnRow.appendChild(cancelBtn);

            var saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save';
            saveBtn.style.cssText = 'padding:4px 12px;border-radius:4px;border:none;' +
                'background:var(--theme-primary-color,#00a4dc);color:#fff;cursor:pointer;font-weight:600;';
            saveBtn.onclick = function() {
                var overrides = {};
                var hasOverride = false;
                popover.querySelectorAll('select').forEach(function(sel) {
                    if (sel.value) {
                        overrides[sel.dataset.family] = sel.value;
                        hasOverride = true;
                    }
                });

                var body = JSON.stringify({ overrides: hasOverride ? overrides : null });
                // Disable the save button and show saving state while the POST is in-flight.
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                ApiClient.ajax({
                    type: 'POST',
                    url: ApiClient.getUrl('/JellyfinEnhanced/language-region/' + itemId),
                    data: body,
                    contentType: 'application/json',
                    dataType: 'json'
                }).then(function(resp) {
                    popover.remove();
                    backdrop.remove();
                    var msg = 'Language region updated' + (resp.targetName ? ' for ' + resp.targetName : '') + '. Refreshing...';
                    if (typeof JE.toast === 'function') { JE.toast(msg); }
                    setTimeout(function() { window.location.reload(); }, 1200);
                }).catch(function(err) {
                    console.error(logPrefix, 'Failed to save region override:', err);
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                    var errMsg = 'Failed to save region override. Check the Jellyfin log for details.';
                    if (typeof JE.toast === 'function') { JE.toast(errMsg); }
                    else { window.alert(errMsg); }
                });
            };
            btnRow.appendChild(saveBtn);
            popover.appendChild(btnRow);

            // Backdrop to close on outside click
            var backdrop = document.createElement('div');
            backdrop.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;';
            backdrop.onclick = function() { popover.remove(); backdrop.remove(); };

            document.body.appendChild(backdrop);
            document.body.appendChild(popover);

            // Position near the flag overlay
            var rect = overlayEl.getBoundingClientRect();
            var popW = 260;
            var left = Math.min(rect.left, window.innerWidth - popW - 16);
            var top = rect.bottom + 8;
            if (top + 200 > window.innerHeight) top = rect.top - 200;
            popover.style.left = Math.max(8, left) + 'px';
            popover.style.top = Math.max(8, top) + 'px';
        }

        /**
         * Attach the admin-only right-click handler to a language overlay container.
         * Called from insertLanguageTags after flags are rendered.
         */
        function attachRegionPopoverHandler(wrap, itemId) {
            // Use currentSettings.isAdmin (cached from prior session) OR currentUser.Policy
            // (resolved during this session). currentUser may not be populated yet on first
            // render since plugin.js fetches it asynchronously.
            var isAdmin = JE.currentSettings?.isAdmin === true
                || JE.currentUser?.Policy?.IsAdministrator === true;
            if (!isAdmin) return;
            // Enable pointer events on the overlay so admin can click the flags.
            // Non-admin users keep pointer-events:none so the flags are non-interactive
            // and clicks pass through to the card beneath.
            wrap.style.pointerEvents = 'auto';
            wrap.style.cursor = 'pointer';
            wrap.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                showRegionPopover(wrap, itemId);
            });
        }

        function shouldIgnoreElement(el) {
            return IGNORE_SELECTORS.some(selector => {
                try {
                    if (el.matches(selector)) return true;
                    return el.closest(selector) !== null;
                } catch {
                    return false; // Silently handle potential errors with complex selectors
                }
            });
        }

        function isCardAlreadyTagged(el) {
            const card = el.closest('.card');
            if (!card) return false;
            const hasAttr = card.dataset?.[TAGGED_ATTR] === '1';
            const hasOverlay = !!card.querySelector(`.${containerClass}`);
            return hasAttr && hasOverlay;
        }

        function markCardTagged(el) {
            const card = el.closest('.card');
            if (card) card.dataset[TAGGED_ATTR] = '1';
        }

        function injectCss() {
            const styleId = 'language-tags-styles';
            const existing = document.getElementById(styleId);
            if (existing) existing.remove();
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .${containerClass} {
                    display: flex;
                    flex-direction: column;
                    gap: 3px;
                    z-index: 101;
                    pointer-events: none;
                    max-height: 90%;
                    overflow: hidden;
                }
                .${flagClass} {
                    width: clamp(24px, 6vw, 32px);
                    height: auto;
                    border-radius: 2px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
                    flex-shrink: 0;
                    object-fit: cover;
                }
                .layout-mobile .${flagClass} {
                    width: clamp(20px, 5vw, 26px);
                }
                .layout-mobile .${containerClass} { gap: 2px; }
                @media (max-width: 768px) {
                    .${flagClass} {
                        width: clamp(20px, 5vw, 26px);
                        gap: 2px;
                    }
                }
                @media (max-width: 480px) {
                    .${flagClass} {
                        width: clamp(16px, 4vw, 20px);
                    }
                    .${containerClass} {
                        gap: 2px;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // --- INITIALIZATION VIA TAG PIPELINE ---
        cleanupOldCaches();

        // Register with unified cache manager for periodic saves
        if (ENABLE_LOCAL_STORAGE_FALLBACK && JE._cacheManager) {
            JE._cacheManager.register(saveCache);
        }
        if (ENABLE_LOCAL_STORAGE_FALLBACK) {
            window.addEventListener('beforeunload', saveCache);
        }

        if (JE.tagPipeline) {
            JE.tagPipeline.registerRenderer('language', {
                render: function(el, item, extras) {
                    if (shouldIgnoreElement(el)) return;
                    if (isCardAlreadyTagged(el)) return;
                    // Skip cards hidden by hidden-content module
                    if (el.closest('.je-hidden')) return;

                    const itemId = item.Id;
                    // Check hot cache first
                    const hot = Hot?.language?.get(itemId);
                    if (hot && (Date.now() - hot.timestamp) < Hot.ttl) {
                        if (hot.value && hot.value.length) insertLanguageTags(el, hot.value);
                        return;
                    }

                    var sourceItem = item;
                    if (item.Type === 'Series' || item.Type === 'Season') {
                        if (extras.firstEpisode) {
                            sourceItem = extras.firstEpisode;
                        } else {
                            return; // No first episode available, skip
                        }
                    }

                    var languages = extractLanguagesFromItem(sourceItem);
                    // Priority chain: manual per-item override > arr enrichment > file metadata.
                    if (item.ManualRegionOverrides && Object.keys(item.ManualRegionOverrides).length > 0) {
                        var manualRegional = [];
                        for (var family in item.ManualRegionOverrides) {
                            var bcp = item.ManualRegionOverrides[family];
                            manualRegional.push({ code: bcp, name: bcp });
                        }
                        languages = mergeRegionalLanguages(languages, manualRegional);
                    } else if (item.RegionalAudioLanguages && item.RegionalAudioLanguages.length > 0) {
                        languages = mergeRegionalLanguages(languages, item.RegionalAudioLanguages);
                    }

                    if (languages.length > 0) {
                        langCache[itemId] = languages;
                        Hot?.language?.set(itemId, { value: languages, timestamp: Date.now() });
                        if (JE._cacheManager) JE._cacheManager.markDirty();
                        insertLanguageTags(el, languages);
                    }
                },
                renderFromCache: function(el, itemId) {
                    if (isCardAlreadyTagged(el)) return true;
                    if (shouldIgnoreElement(el)) return true;
                    if (el.closest('.je-hidden')) return true;
                    const hot = Hot?.language?.get(itemId);
                    const cached = hot || langCache[itemId];
                    if (cached) {
                        const languages = Array.isArray(cached) ? cached : (cached.value || cached.languages);
                        if (languages && languages.length > 0) {
                            insertLanguageTags(el, languages);
                            return true;
                        }
                    }
                    return false;
                },
                renderFromServerCache: function(el, entry) {
                    if (isCardAlreadyTagged(el)) return;
                    if (shouldIgnoreElement(el)) return;
                    var codes = entry.AudioLanguages;
                    if (!codes || codes.length === 0) return;
                    var languages = codes.map(function(code) {
                        try {
                            return { name: langDisplayNames.of(code), code: code };
                        } catch (e) {
                            return { name: code.toUpperCase(), code: code };
                        }
                    });
                    // Priority chain: manual per-item override > arr enrichment > file metadata.
                    // ManualRegionOverrides (admin-set via flag-click popover) is a dict of
                    // canonical family key → BCP-47 code, e.g. {"pt": "pt-BR"}.
                    if (entry.ManualRegionOverrides && Object.keys(entry.ManualRegionOverrides).length > 0) {
                        var manualRegional = [];
                        for (var family in entry.ManualRegionOverrides) {
                            var bcp = entry.ManualRegionOverrides[family];
                            manualRegional.push({ code: bcp, name: bcp });
                        }
                        languages = mergeRegionalLanguages(languages, manualRegional);
                    } else if (entry.RegionalAudioLanguages && entry.RegionalAudioLanguages.length > 0) {
                        languages = mergeRegionalLanguages(languages, entry.RegionalAudioLanguages);
                    }
                    insertLanguageTags(el, languages);
                },
                isEnabled: function() { return !!JE.currentSettings?.languageTagsEnabled; },
                needsFirstEpisode: true,
                needsParentSeries: false,
                injectCss: injectCss,
            });
            console.log(`${logPrefix} Registered with unified tag pipeline.`);
        } else {
            console.warn(`${logPrefix} Tag pipeline not available, language tags will not render.`);
        }
    };

    /**
     * Re-initializes the Language Tags feature
     * Cleans up existing state and re-applies tags.
     */
    JE.reinitializeLanguageTags = function() {
        const logPrefix = '🪼 Jellyfin Enhanced: Language Tags:';
        console.log(`${logPrefix} Re-initializing...`);

        // Always remove existing tags and clear tagged state
        document.querySelectorAll('.language-overlay-container').forEach(el => el.remove());
        document.querySelectorAll('[data-je-language-tagged]').forEach(el => { delete el.dataset.jeLanguageTagged; });

        // Drop the in-memory language cache so newly-fetched arr enrichment / region overrides
        // take effect on the next pipeline scan instead of being masked by stale cache hits.
        if (JE._hotCache?.language) JE._hotCache.language.clear();

        // Re-inject CSS in case position settings changed
        // Use the renderer's injectCss reference (captures the initialize closure)
        const renderer = JE.tagPipeline?.getRenderer?.('language');
        if (renderer?.injectCss) renderer.injectCss();

        if (!JE.currentSettings.languageTagsEnabled) {
            console.log(`${logPrefix} Feature is disabled after reinit.`);
            return;
        }

        // Trigger pipeline re-scan with current settings
        JE.tagPipeline?.clearProcessed();
        JE.tagPipeline?.scheduleScan();
    };

})(window.JellyfinEnhanced);
