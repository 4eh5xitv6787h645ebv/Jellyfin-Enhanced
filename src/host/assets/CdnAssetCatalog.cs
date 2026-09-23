using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>Allow-listed upstreams, content types, refresh inventory and request-path policy.</summary>
    internal static class CdnAssetCatalog
    {
        // A request path may only contain these characters. No '..', no '@' (refs are
        // baked into the fixed base), no scheme, no CR/LF — see IsSafePath.
        private static readonly Regex SafePathRegex = new(@"^[A-Za-z0-9][A-Za-z0-9._/\-]*$", RegexOptions.Compiled);

        /// <summary>
        /// Describes one allow-listed upstream source. <see cref="BaseUrl"/> is a fixed
        /// server-side constant; the client-supplied path is appended to it after strict
        /// validation, so a request can never reach a host outside this list.
        /// </summary>
        /// <param name="FixedPaths">
        /// When set, the source does NOT build its URL as base+path. Instead only these
        /// exact keys are valid and each maps to a complete upstream URL — used for
        /// sources whose real URL isn't a simple path append (e.g. the Google Fonts css2
        /// endpoint, which needs a `?family=…` query string).
        /// </param>
        /// <param name="NotFoundFallbackBaseUrl">
        /// Optional fixed alternate layout on the same trusted upstream. Used only after
        /// an HTTP 404; authentication failures, outages and invalid responses never retry it.
        /// Fixed-path sources do not use this fallback.
        /// </param>
        internal sealed record CdnSource(string BaseUrl, HashSet<string> AllowedTypes, IReadOnlyDictionary<string, string>? FixedPaths = null, string? NotFoundFallbackBaseUrl = null);

        // ── Source registry (the ONLY hosts this service will ever fetch from) ──────
        internal static readonly IReadOnlyDictionary<string, CdnSource> Sources = new Dictionary<string, CdnSource>(StringComparer.Ordinal)
        {
            // selfhst icon pack (Sonarr/Radarr/Bazarr/Seerr/Letterboxd/YouTube …)
            ["selfhst"] = new("https://cdn.jsdelivr.net/gh/selfhst/icons", Types("image/svg+xml", "image/png")),
            // Jellyfish theme: colour sheets + logos/favicon
            ["jellyfish"] = new("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfish", Types("text/css", "image/png", "image/vnd.microsoft.icon", "image/x-icon")),
            // homarr-labs dashboard-icons (generic script/plugin icons)
            ["dashboard-icons"] = new("https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons", Types("image/svg+xml", "image/png")),
            // ZestyTheme logo fallback
            ["zesty"] = new("https://cdn.jsdelivr.net/gh/stpnwf/ZestyTheme@latest", Types("image/png", "image/jpeg")),
            // JellyPlugins jellyfin-helper favicon (pinned ref)
            ["jelly-helper"] = new("https://cdn.jsdelivr.net/gh/JellyPlugins/jellyfin-helper@2.0.0.2", Types("image/vnd.microsoft.icon", "image/x-icon", "image/png")),
            // Moonbase (Moonfin server plugin) icon: Moonfin-Client's GitHub avatar (pre-sized, no version to pin)
            ["moonbase"] = new("https://avatars.githubusercontent.com", Types("image/jpeg", "image/png"),
                FixedPaths: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["moonfin-client"] = "https://avatars.githubusercontent.com/u/103554043?v=4&size=40"
                }),
            // flagcdn raster flags (people/country tags)
            ["flagcdn"] = new("https://flagcdn.com", Types("image/png")),
            // cdnjs flag-icons SVG flags (language tags)
            ["flag-icons"] = new("https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.1", Types("image/svg+xml")),
            // ibb "poster not found" fallback image. i.ibb.co hosts arbitrary user uploads,
            // so this is locked to the single known asset via FixedPaths — any other path is
            // rejected — to avoid an anonymous cache-fill proxy over an open host.
            ["ibb"] = new("https://i.ibb.co", Types("image/png", "image/jpeg"),
                FixedPaths: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["fdbkXQdP/jellyseerr-poster-not-found.png"] = "https://i.ibb.co/fdbkXQdP/jellyseerr-poster-not-found.png"
                }),
            // Remote (newer-than-bundled) locale JSON from the upstream repo's main branch
            ["locales"] = new("https://raw.githubusercontent.com/n00bcodr/Jellyfin-Enhanced/main/Jellyfin.Plugin.JellyfinEnhanced/js/locales", Types("application/json", "text/plain"),
                NotFoundFallbackBaseUrl: "https://raw.githubusercontent.com/n00bcodr/Jellyfin-Enhanced/main/locales"),
            // Documentation screenshots shown on the admin config page
            ["je-docs-img"] = new("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Enhanced@main/docs/images", Types("image/png", "image/jpeg")),
            // The plugin's own bundled-on-CDN stylesheets (e.g. colored-ratings CSS)
            ["je-css"] = new("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Enhanced@main/css", Types("text/css")),
            // Druidblack metadata-provider icon stylesheet (attribute-selector icons; no external url() assets)
            ["icon-metadata"] = new("https://cdn.jsdelivr.net/gh/Druidblack/jellyfin-icon-metadata", Types("text/css")),
            // Jellyfin-Elsewhere region/provider reference lists (fetched as text)
            ["elsewhere-res"] = new("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Elsewhere/resources", Types("text/plain")),
            // Award-body logos for the Awards feature (WikidataAwardsService), sourced from
            // Wikimedia Commons via its Special:FilePath redirect.
            ["award-logos"] = new("https://commons.wikimedia.org/wiki/Special:FilePath", Types("image/svg+xml", "image/png"),
                FixedPaths: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["oscar"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Oscar%20gold%20silhouette.svg",
                    ["golden-globe"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Golden_Globe_icon_(gold).svg",
                    ["bafta"] = "https://commons.wikimedia.org/wiki/Special:FilePath/BAFTA%20award%20icon%20gold%20silhouette.svg",
                    ["emmy"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Emmy%20gold%20silhouette.svg",
                    ["sag"] = "https://commons.wikimedia.org/wiki/Special:FilePath/The%20Actor%20Statuette%20gold%20silhouette.svg",
                    ["critics-choice"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Critics%20Choice%20Association%20horizontal%20logo.svg",
                    ["national-board-of-review"] = "https://commons.wikimedia.org/wiki/Special:FilePath/The%20National%20Board%20of%20Review%20Logo.png",
                    ["saturn"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Saturn_Award_Silhouette.svg",
                    ["kids-choice"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Kids%27%20Choice%20Awards%202017%20Logo.png",
                    ["toronto-critics"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Toronto%20Film%20Critics%20Association%20logo.svg",
                    ["cannes"] = "https://commons.wikimedia.org/wiki/Special:FilePath/Palme%20d%27Or%20gold%20silhouette.svg",
                }),
            // Rating-source logos (TMDB, Rotten Tomatoes, IMDb, etc.) for the MDBList
            // Ratings feature. Vendored into this repo's own images/mdblist-logos/
            // (sourced from xroguel1ke/jellyfin_ratings, the script this feature is
            // based on) rather than proxied from their repo directly -- these are
            // third-party brand marks neither repo owns; identifying a rating's
            // source with its brand logo is the same nominative-use pattern as the
            // selfhst/dashboard-icons service logos and the Wikimedia award-logos
            // above. rottentomatoes_fresh.png/rottentomatoes_rotten.png are the one
            // exception -- converted from jellyfin/jellyfin-web's own
            // src/assets/img/fresh.svg and rotten.svg (GPL-2.0), the same glyphs
            // Jellyfin's own web client uses for critic Fresh/Rotten status.
            ["mdblist-logos"] = new("https://cdn.jsdelivr.net/gh/n00bcodr/Jellyfin-Enhanced@main/images/mdblist-logos", Types("image/png")),
            // MDBList's own favicon, for the config page's "MDBList Ratings" fieldset
            // legend -- single fixed asset, so locked down the same way as "ibb" above.
            ["mdblist-static"] = new("https://mdblist.com/static", Types("image/x-icon", "image/vnd.microsoft.icon"),
                FixedPaths: new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["favicon.ico"] = "https://mdblist.com/static/favicon.ico"
                }),
        };

        private static HashSet<string> Types(params string[] t) => new(t, StringComparer.OrdinalIgnoreCase);

        /// <summary>
        /// The "mutable" static assets the scheduled task pre-fetches and refreshes
        /// every 24h so they are always warm and current in the disk cache.
        /// Per-country flags and per-language locales are intentionally NOT prefetched —
        /// they are effectively immutable per key and are cached lazily on first hit.
        /// </summary>
        internal static readonly IReadOnlyList<(string Source, string Path)> KnownAssets = new List<(string, string)>
        {
            ("selfhst", "svg/sonarr.svg"),
            ("selfhst", "svg/radarr-light-hybrid-light.svg"),
            ("selfhst", "svg/bazarr.svg"),
            ("selfhst", "svg/seerr.svg"),
            ("selfhst", "svg/letterboxd.svg"),
            ("selfhst", "png/youtube.png"),
            ("selfhst", "svg/shoko-server.svg"),
            ("jellyfish", "logos/favicon.ico"),
            ("jellyfish", "colors/aurora.css"),
            ("jellyfish", "colors/banana.css"),
            ("jellyfish", "colors/coal.css"),
            ("jellyfish", "colors/coral.css"),
            ("jellyfish", "colors/forest.css"),
            ("jellyfish", "colors/grass.css"),
            ("jellyfish", "colors/jellyblue.css"),
            ("jellyfish", "colors/jellyflix.css"),
            ("jellyfish", "colors/jellypurple.css"),
            ("jellyfish", "colors/lavender.css"),
            ("jellyfish", "colors/midnight.css"),
            ("jellyfish", "colors/mint.css"),
            ("jellyfish", "colors/ocean.css"),
            ("jellyfish", "colors/peach.css"),
            ("jellyfish", "colors/watermelon.css"),
            ("dashboard-icons", "svg/javascript.svg"),
            ("zesty", "images/logo/jellyfin-logo-light.png"),
            ("jelly-helper", "media/favicon.ico"),
            ("moonbase", "moonfin-client"),
            ("ibb", "fdbkXQdP/jellyseerr-poster-not-found.png"),
            ("je-css", "ratings.css"),
            ("icon-metadata", "public-icon.css"),
            ("elsewhere-res", "regions.txt"),
            ("elsewhere-res", "providers.txt"),
            ("award-logos", "oscar"),
            ("award-logos", "golden-globe"),
            ("award-logos", "bafta"),
            ("award-logos", "emmy"),
            ("award-logos", "sag"),
            ("award-logos", "critics-choice"),
            ("award-logos", "national-board-of-review"),
            ("award-logos", "saturn"),
            ("award-logos", "kids-choice"),
            ("award-logos", "toronto-critics"),
            ("award-logos", "cannes"),
            ("mdblist-logos", "master.png"),
            ("mdblist-logos", "imdb.png"),
            ("mdblist-logos", "tmdb.png"),
            ("mdblist-logos", "trakt.png"),
            ("mdblist-logos", "letterboxd.png"),
            ("mdblist-logos", "anilist.png"),
            ("mdblist-logos", "myanimelist.png"),
            ("mdblist-logos", "rogerebert.png"),
            ("mdblist-logos", "rottentomatoes.png"),
            ("mdblist-logos", "rottentomatoes_audience.png"),
            ("mdblist-logos", "rottentomatoes_fresh.png"),
            ("mdblist-logos", "rottentomatoes_rotten.png"),
            ("mdblist-logos", "metacritic.png"),
            ("mdblist-logos", "metacritic_audience.png"),
            ("mdblist-static", "favicon.ico"),
        };

        /// <summary>
        /// Validates a client-supplied path: printable safe characters only, no traversal,
        /// no protocol-relative escape, no CR/LF. The base host is fixed per source, so a
        /// valid path can only ever address a different file on the same trusted CDN.
        /// </summary>
        internal static bool IsSafePath(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || path.Length > 512)
            {
                return false;
            }

            if (path.Contains("..", StringComparison.Ordinal)
                || path.Contains("//", StringComparison.Ordinal)
                || path.StartsWith('/'))
            {
                return false;
            }

            return SafePathRegex.IsMatch(path);
        }

    }
}
