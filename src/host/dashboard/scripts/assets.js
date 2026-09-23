        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = ApiClient.getUrl('/JellyfinEnhanced/Configuration/configPage.css');
        document.head.appendChild(link);

        // Local CDN route helper. Every external CDN asset this admin page used to load
        // directly (icons, screenshots, the Material Symbols font) is served from the
        // plugin's own /JellyfinEnhanced/cdn/ route instead. Base-path-safe via
        // ApiClient.getUrl so it works behind a reverse-proxy sub-path.
        window.jeCdnUrl = function (subpath) {
            return ApiClient.getUrl('/JellyfinEnhanced/cdn/' + subpath);
        };
        // Inject the Material Symbols Rounded @font-face pointing at the local gfont route
        // (replaces the former fonts.gstatic.com @font-face).
        var jeFontStyle = document.createElement('style');
        jeFontStyle.textContent = "@font-face{font-family:'Material Symbols Rounded';font-style:normal;font-weight:100 700;font-display:block;src:url(" + jeCdnUrl('gfont/s/materialsymbolsrounded/v258/syl0-zNym6YjUruM-QrEh7-nyTnjDwKNJ_190FjpZIvDmUSVOK7BDB_Qb9vUSzq3wzLK-P0J-V_Zs-QtQth3-jOcbTCVpeRL2w5rwZu2rIelXxc.woff2') + ") format('woff2');}";
        document.head.appendChild(jeFontStyle);
