// Private bootstrap source; regenerate artifacts/generated/plugin.js with npm run generate.
function createNamespace() {
    // Create the global namespace immediately with placeholders
    const JE = {
        // Shared core layer, populated by js/core/*.js (navigation, lifecycle,
        // dom, api, ui). Created here so core modules can attach to it.
        core: {},
        pluginConfig: {},
        userConfig: { settings: {}, shortcuts: { Shortcuts: [] }, bookmarks: { Bookmarks: {} }, elsewhere: {}, hiddenContent: { items: {}, settings: {} } },
        translations: {},
        pluginVersion: 'unknown',
        // Local CDN helper. Every third-party static asset (icons, fonts, flags, theme
        // sheets, remote locales) is served from the plugin's own route
        // (/JellyfinEnhanced/cdn/{source}/{path}) — backed by an on-disk cache refreshed
        // every 24h — so the client never contacts an external CDN directly.
        // Defined here (not in a loaded module) because component scripts load in parallel
        // and reference these URLs at eval time, so JE.cdn must exist before they run.
        cdn: {
            // Build a local CDN route URL for an allow-listed {source} + sub-{path}.
            url(source, path) {
                const clean = String(path == null ? '' : path).replace(/^\/+/, '');
                return ApiClient.getUrl(`/JellyfinEnhanced/cdn/${source}/${clean}`);
            },
            // selfhst icon pack, e.g. selfhst('svg/sonarr.svg') or selfhst('png/youtube.png')
            selfhst(file) { return this.url('selfhst', file); },
            // Country flag as a raster PNG (flagcdn), size like 'w20'
            flagPng(code, size = 'w20') { return this.url('flagcdn', `${size}/${String(code).toLowerCase()}.png`); },
            // Country flag as an SVG (cdnjs flag-icons, 4x3)
            flagSvg(code) { return this.url('flag-icons', `flags/4x3/${String(code).toLowerCase()}.svg`); },
            // Material Symbols glyph font, bundled with the plugin (not Google Fonts)
            font(name) { return ApiClient.getUrl(`/JellyfinEnhanced/fonts/${name}`); }
        },
        // Stub functions that will be overwritten by modules
        icon: (name) => {
            // Fallback icon function until icons.js loads
            // Returns the token unchanged so t() can keep the placeholder
            return name ? `{{ICON_PENDING:${name}}}` : '';
        },
        IconName: {}, // Will be replaced by icons.js
        state: {
            activeShortcuts: {},
            // { itemId, surface: 'continuewatching'|'nextup'|null, ts } captured on a menu trigger
            // so the action-sheet observer knows which Remove button (if any) to add.
            removeContext: null,
            pauseScreenClickTimer: null
         },
        // Unified cache manager for tag systems
        _cacheManager: {
            callbacks: new Set(),
            dirty: false,
            scheduleId: null,
            register(saveCallback) {
                this.callbacks.add(saveCallback);
            },
            unregister(saveCallback) {
                this.callbacks.delete(saveCallback);
            },
            markDirty() {
                this.dirty = true;
                if (!this.scheduleId) {
                    // Use requestIdleCallback to defer cache saves
                    if (typeof requestIdleCallback !== 'undefined') {
                        this.scheduleId = requestIdleCallback(() => this._flush(), { timeout: 5000 });
                    } else {
                        this.scheduleId = setTimeout(() => this._flush(), 1000);
                    }
                }
            },
            _flush() {
                if (this.dirty) {
                    this.callbacks.forEach(cb => {
                        try { cb(); } catch (e) { console.error('Cache save error:', e); }
                    });
                    this.dirty = false;
                }
                this.scheduleId = null;
            },
            forceSave() {
                this.dirty = true;
                this._flush();
            }
        },
        /**
         * Escapes HTML special characters to prevent XSS when interpolating into HTML strings.
         * Bootstrap copy only — replaced by the canonical JE.core.ui.escapeHtml
         * as soon as js/core/ui-kit.js loads.
         * @param {string} str - The value to escape.
         * @returns {string} The escaped string safe for HTML interpolation.
         */
        escapeHtml: (str) => {
            if (typeof str !== 'string') return String(str ?? '');
            return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        },
        // Placeholder functions
        t: (key, params = {}) => { // Actual implementation defined later
            const translations = window.JellyfinEnhanced?.translations || {};
            let text = translations[key] || key;
            if (params) {
                for (const [param, value] of Object.entries(params)) {
                    text = text.replace(new RegExp(`{${param}}`, 'g'), value);
                }
            }
            // Replace {{icon:name}} tokens with JE.icon() calls
            text = text.replace(/\{\{icon:([a-zA-Z]+)\}\}/g, (match, iconName) => {
                const iconKey = iconName.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase();
                const iconConstant = window.JellyfinEnhanced.IconName?.[iconKey];

                // If IconName not loaded yet, keep the placeholder
                if (!iconConstant) {
                    console.debug(`[JE.t] IconName.${iconKey} not available yet, keeping placeholder`);
                    return match;
                }

                const iconResult = window.JellyfinEnhanced.icon?.(iconConstant);

                // If icon function returns a pending token, keep original placeholder
                if (iconResult && iconResult.startsWith('{{ICON_PENDING:')) {
                    console.debug(`[JE.t] Icon system not ready, keeping placeholder for ${iconName}`);
                    return match;
                }

                return iconResult || match;
            });

            return text;
        },
        loadSettings: () => { console.warn("🪼 Jellyfin Enhanced: loadSettings called before config.js loaded"); return {}; },
        initializeShortcuts: () => { console.warn("🪼 Jellyfin Enhanced: initializeShortcuts called before config.js loaded"); },
        saveUserSettings: async (fileName) => { console.warn(`🪼 Jellyfin Enhanced: saveUserSettings(${fileName}) called before config.js loaded`); }
    };



    /**
     * Converts PascalCase object keys to camelCase recursively.
     * @param {object} obj - The object to convert.
     * @returns {object} - A new object with camelCase keys.
     */
    function toCamelCase(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj; // Return primitives and arrays as-is
        }
        const camelCased = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
                camelCased[camelKey] = toCamelCase(obj[key]); // Recursive for nested objects
            }
        }
        return camelCased;
    }
    JE.toPascalCase = toPascalCase;
    JE.toCamelCase = toCamelCase;
    /**
     * Converts object keys from camelCase to PascalCase (recursively).
     * @param {object} obj - The object to convert.
     * @returns {object} - A new object with PascalCase keys.
     */
    function toPascalCase(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj; // Return primitives and arrays as-is
        }
        const pascalCased = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
                pascalCased[pascalKey] = toPascalCase(obj[key]); // Recursive for nested objects
            }
        }
        return pascalCased;
    }
    return JE;
}
