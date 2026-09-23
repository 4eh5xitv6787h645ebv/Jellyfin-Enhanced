using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class UsageController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly Services.UsageEventCounterService _usageEventCounterService;
        private readonly Services.AnalyticsReportingService _analyticsReportingService;

        public UsageController(
            Logger logger,
            Services.UsageEventCounterService usageEventCounterService,
            Services.AnalyticsReportingService analyticsReportingService,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _usageEventCounterService = usageEventCounterService;
            _analyticsReportingService = analyticsReportingService;
        }

        /// <summary>
        /// Award wins/nominations for a title or a person, keyed by TMDB id.
        /// "movie"/"tv" return awards the title itself (or a cast/crew member,
        /// "for" that title) received; "person" returns that person's own
        /// full award history across their career. Backed by
        /// WikidataAwardsService's disk cache — Wikidata's public SPARQL endpoint
        /// needs no API key, so this is gated only on the ShowAwards toggle, not
        /// TMDB_API_KEY (that key is unrelated to this lookup).
        /// </summary>
        /// <summary>
        /// Bumps one feature-usage counter (e.g. "seerr.request_submitted") for the
        /// current analytics reporting period. No-ops silently (not an error)
        /// unless analytics AND the usage-counts category are both enabled, so a
        /// client that fires this unconditionally never needs to check config
        /// first. Any authenticated user can call this; it's a fire-and-forget
        /// counter bump, not a privileged action.
        /// </summary>
        [HttpPost("usage/track")]
        [Authorize]
        public IActionResult TrackUsage([FromBody] JsonElement requestBody)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null || !config.AnalyticsEnabled || !config.AnalyticsShareUsageCounts)
            {
                return Ok();
            }

            if (!requestBody.TryGetProperty("key", out var keyEl) || keyEl.ValueKind != JsonValueKind.String)
            {
                return BadRequest("Missing 'key'.");
            }

            var key = keyEl.GetString() ?? string.Empty;
            // IsKnownKey restricts this endpoint to the finite set of counters
            // the plugin actually emits: without it, any authenticated user
            // could mint unbounded distinct counter rows or forge "total.*"
            // snapshot keys alongside the real ones.
            if (!Services.UsageEventCounterService.IsValidKey(key))
            {
                return BadRequest("Invalid feature key.");
            }
            if (!Services.UsageEventCounterService.IsKnownKey(key))
            {
                // Loud on purpose: a well-formed-but-unlisted key is almost
                // always a new client counter shipped without the matching
                // KnownKeys entry — silently 400ing it would read as "nobody
                // uses this feature" on the dashboard forever. (key already
                // passed the charset check above, so it's safe to log.)
                _logger.Warning($"[Analytics] Rejected unknown usage key '{key}' — new counters must be added to UsageEventCounterService.KnownKeys in the same change that emits them.");
                return BadRequest("Unknown feature key.");
            }

            _usageEventCounterService.Increment(key);
            return Ok();
        }

        /// <summary>
        /// Returns the exact payload a report would send right now, using the
        /// CURRENTLY DISPLAYED checkbox states from the request body, not
        /// necessarily the saved config, so toggling a checkbox on the
        /// config page and clicking Preview updates immediately, without
        /// requiring Save first. Also returns when/what was last actually
        /// sent (that part always reflects the real saved state). Admin-only
        /// since it reflects the server's full config-flag snapshot.
        ///
        /// Deliberately does NOT call EnsureRegisteredAsync: registering
        /// mints a real row on the backend, and a preview click is not
        /// consent to opt in. If this install has never actually sent a real
        /// report, InstallId is shown as an unregistered placeholder rather
        /// than silently registering just to fill in the preview. Only a
        /// genuine send (config saved with analytics on, or the scheduled
        /// task) ever registers.
        /// </summary>
        [HttpPost("usage/preview")]
        [Authorize]
        public IActionResult PreviewUsageReport([FromBody] JsonElement requestBody)
        {
            if (!IsAdminUser())
            {
                return Forbid();
            }

            var config = JellyfinEnhanced.Instance?.Configuration;
            if (config == null)
            {
                return StatusCode(503);
            }

            bool ReadBool(string name, bool fallback) =>
                requestBody.TryGetProperty(name, out var el) && el.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? el.GetBoolean()
                    : fallback;

            var shareFeatureFlags = ReadBool("shareFeatureFlags", config.AnalyticsShareFeatureFlags);
            var shareUsageCounts = ReadBool("shareUsageCounts", config.AnalyticsShareUsageCounts);
            var shareDataSizes = ReadBool("shareDataSizes", config.AnalyticsShareDataSizes);

            var payload = _analyticsReportingService.BuildPayload(config, shareFeatureFlags, shareUsageCounts, shareDataSizes);
            var displayInstallId = string.IsNullOrEmpty(payload.InstallId)
                ? "(not registered yet; assigned on first real send)"
                : payload.InstallId;

            return new JsonResult(new
            {
                Payload = new
                {
                    InstallId = displayInstallId,
                    payload.PluginVersion,
                    payload.JellyfinVersion,
                    payload.JellyfinTarget,
                    payload.Config,
                    payload.Settings,
                    payload.DataFileSizes,
                    payload.Period,
                    payload.Events,
                },
                LastReportedAt = config.AnalyticsLastReportedAt,
                LastPayloadJson = config.AnalyticsLastPayloadJson,
            });
        }
    }
}
