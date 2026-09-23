// Private bootstrap source; regenerate artifacts/generated/plugin.js with npm run generate.
function createPrelogin(JE, { getScriptVersion }) {
    /**
     * Injects Druidblack metadata icons CSS.
     * @param {boolean} enabled
     */
    function injectMetadataIcons(enabled) {
        const existing = document.getElementById('metadataIconsCss');
        if (enabled && !existing) {
            const link = document.createElement('link');
            link.id = 'metadataIconsCss';
            link.rel = 'stylesheet';
            link.href = JE.cdn.url('icon-metadata', 'public-icon.css');
            document.head.appendChild(link);
        } else if (!enabled && existing) {
            existing.remove();
        }
    }

     /**
     * Loads the splash screen script early.
     */
     function loadSplashScreenEarly() {
        if (typeof ApiClient === 'undefined') {
            setTimeout(loadSplashScreenEarly, 50);
            return;
        }
        const splashScript = document.createElement('script');
        splashScript.src = ApiClient.getUrl('/JellyfinEnhanced/js/others/splashscreen.js?v=' + getScriptVersion());
        splashScript.onload = () => {
            if (typeof JE.initializeSplashScreen === 'function') {
                JE.initializeSplashScreen(); // Initialize if available
            }
        };
         splashScript.onerror = () => console.error('🪼 Jellyfin Enhanced: Failed to load splash screen script.');
        document.head.appendChild(splashScript);
    }

    /**
     * Injects a maintenance banner at the top of the page.
     */
    function injectMaintenanceBanner(message) {
        if (document.getElementById('je-maintenance-banner')) return;
        const text = (message || '').trim() || 'This server is currently undergoing maintenance. Please try again later.';
        const banner = document.createElement('div');
        banner.id = 'je-maintenance-banner';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'background:#b71c1c', 'color:#fff', 'text-align:center',
            'padding:10px 16px', 'font-size:14px', 'font-weight:600',
            'letter-spacing:0.02em', 'box-shadow:0 2px 8px rgba(0,0,0,0.4)',
            'font-family:inherit'
        ].join(';');
        banner.textContent = text;
        document.body.appendChild(banner);
        // Inject a stylesheet that shifts Jellyfin's fixed header + body down by the banner height.
        // We use a <style> tag so the rule applies even if Jellyfin re-renders its header.
        requestAnimationFrame(function() {
            const h = banner.offsetHeight;
            if (h <= 0) return;
            const existing = document.getElementById('je-maintenance-banner-style');
            if (existing) return;
            const style = document.createElement('style');
            style.id = 'je-maintenance-banner-style';
            style.textContent = [
                'body { padding-top: ' + h + 'px !important; }',
                '.skinHeader { top: ' + h + 'px !important; }',
                '.mainDrawer { top: ' + h + 'px !important; }',
                '.videoOsdBottom { bottom: 0 !important; }'
            ].join('\n');
            document.head.appendChild(style);
        });
    }

    /**
     * Loads the login image script early (checks config first).
     * Also injects a maintenance banner when maintenance mode is active.
     */
    function loadLoginImageEarly() {
        if (typeof ApiClient === 'undefined') {
            setTimeout(loadLoginImageEarly, 50);
            return;
        }

        // Fetch the public config to check if login image / maintenance banner is needed
        ApiClient.ajax({
            type: 'GET',
            url: ApiClient.getUrl('/JellyfinEnhanced/public-config'),
            dataType: 'json'
        }).then((config) => {
            // Show maintenance banner for all users (admins can dismiss it mentally)
            if (config?.MaintenanceModeEnabled === true) {
                injectMaintenanceBanner(config.MaintenanceModeMessage);
            }

            // Only load login image if enabled (default to false)
            if (config?.EnableLoginImage === true) {
                const loginImageScript = document.createElement('script');
                loginImageScript.src = ApiClient.getUrl('/JellyfinEnhanced/js/extras/login-image.js?v=' + getScriptVersion());
                loginImageScript.onerror = () => console.error('🪼 Jellyfin Enhanced: Failed to load login image script.');
                document.head.appendChild(loginImageScript);
            }
        }).catch(() => {
            console.warn('🪼 Jellyfin Enhanced: Could not fetch config for login image, skipping.');
        });
    }
    return { injectMetadataIcons, loadSplashScreenEarly, loadLoginImageEarly };
}
