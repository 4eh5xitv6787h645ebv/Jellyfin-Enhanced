using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using MediaBrowser.Controller.Configuration;
using MediaBrowser.Common.Net;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class HostController : UserControllerBase
    {
        private readonly Services.HostCompatibilityService _hostCompatibility;
        private readonly IServerConfigurationManager _serverConfigurationManager;
        private readonly INetworkManager _networkManager;

        public HostController(
            Services.HostCompatibilityService hostCompatibility,
            IServerConfigurationManager serverConfigurationManager,
            INetworkManager networkManager,
            IUserManager userManager) : base(userManager)
        {
            _hostCompatibility = hostCompatibility;
            _serverConfigurationManager = serverConfigurationManager;
            _networkManager = networkManager;
        }

        /// <summary>
        /// Builds Jellyfin's own LAN URL from its detected internal bind interfaces
        /// (the same source Jellyfin itself uses for Server Discovery / PlayTo /
        /// LiveTV / SystemInfo) plus the configured internal port -- a genuinely
        /// server-known value, not a guess from whatever origin the admin's browser
        /// happens to be on right now.
        /// </summary>
        private string? GetJellyfinInternalUrl()
        {
            var address = _networkManager.GetInternalBindAddresses()
                .Select(d => d.Address)
                .FirstOrDefault(a => !System.Net.IPAddress.IsLoopback(a));
            if (address == null)
            {
                return null;
            }

            var networkConfig = _serverConfigurationManager.GetNetworkConfiguration();
            var scheme = networkConfig.EnableHttps ? "https" : "http";
            var port = networkConfig.EnableHttps ? networkConfig.InternalHttpsPort : networkConfig.InternalHttpPort;
            var host = address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6
                ? $"[{address}]"
                : address.ToString();
            return $"{scheme}://{host}:{port}";
        }

        /// <summary>
        /// Reads Jellyfin's own "Published server URIs" (Dashboard → Networking →
        /// Advanced) for an "external" or "all" override -- the same mechanism
        /// Jellyfin itself uses to tell clients what URL to use from outside the
        /// LAN. When set, this is a far more reliable source for "Jellyfin's
        /// public URL" than guessing from the admin's current browser origin.
        /// </summary>
        private string? GetJellyfinExternalUrl()
        {
            var overrides = _serverConfigurationManager.GetNetworkConfiguration().PublishedServerUriBySubnet;
            if (overrides == null || overrides.Length == 0)
            {
                return null;
            }

            // "all" always wins in Jellyfin's own resolution (it clears every other
            // override once reached), so prefer it here too if both are present.
            string? externalMatch = null;
            foreach (var entry in overrides)
            {
                var parts = entry.Split('=', 2);
                if (parts.Length != 2)
                {
                    continue;
                }

                var key = parts[0].Trim();
                var url = parts[1].Trim();
                if (string.Equals(key, "all", StringComparison.OrdinalIgnoreCase))
                {
                    return url;
                }
                if (string.Equals(key, "external", StringComparison.OrdinalIgnoreCase))
                {
                    externalMatch = url;
                }
            }

            return externalMatch;
        }

        /// <summary>
        /// Which Jellyfin line this DLL was built for vs which one is running it.
        /// Exposes build/host compatibility for administrator diagnostics.
        /// </summary>
        [HttpGet("host-compat")]
        [Authorize]
        public ActionResult GetHostCompatibility()
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            return new JsonResult(new
            {
                builtFor = Services.HostCompatibilityService.BuiltFor,
                hostTarget = _hostCompatibility.HostTarget,
                hostVersion = _hostCompatibility.HostVersionString,
                pluginVersion = JellyfinEnhanced.Instance?.Version.ToString(),
                mismatch = _hostCompatibility.IsMismatch,
                expectedAsset = _hostCompatibility.ExpectedAssetName,
                manifestUrl = Services.HostCompatibilityService.ManifestUrl,
                message = _hostCompatibility.MismatchMessage
            });
        }

        // Admin-only. Backs the "Import from Seerr" picker's URL-mapping pre-fill --
        // both values come from Jellyfin's own server-side network detection rather
        // than guessing from the admin's current browser origin: external from
        // Dashboard -> Networking -> Advanced "Published server URIs" ("external"/
        // "all" override), internal from Jellyfin's own detected LAN bind address.
        // Either may be null if not configured/detectable; the frontend falls back
        // to an editable guess in that case.
        [HttpGet("jellyfin-urls")]
        [Authorize]
        public ActionResult GetJellyfinNetworkUrls()
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            return new JsonResult(new { externalUrl = GetJellyfinExternalUrl(), internalUrl = GetJellyfinInternalUrl() });
        }
        // [AllowAnonymous]: version is loaded by translations.js cache-buster pre-login.
        // Information disclosure of the plugin version is acceptable — Jellyfin core
        // exposes its own version pre-auth too. CVEs against JE are tracked publicly
        // so attackers do not need this endpoint to fingerprint a vulnerable version.
        [HttpGet("version")]
        public ActionResult GetVersion() => Content(JellyfinEnhanced.Instance?.Version.ToString() ?? "unknown");
    }
}
