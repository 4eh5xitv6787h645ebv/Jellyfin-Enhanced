using System;
using System.Collections.Generic;
using Jellyfin.Data;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Features.Settings.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Transport;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.JellyfinEnhanced.Infrastructure.Http
{
    /// <summary>
    /// Shared base of the JE controllers (artifacts/restructure-plan/backend.md §3 "Shared base"). No class-level
    /// attributes, so anonymous routes stay anonymous. The helpers read <c>User</c> or <see cref="IsAdminUser"/> and
    /// must stay controller members; their bodies were moved verbatim from JellyfinEnhancedController.
    /// </summary>
    public abstract class JeControllerBase : ControllerBase
    {
        protected readonly Logger _logger;
        protected readonly IUserManager _userManager;
        protected readonly UserConfigurationManager _userConfigurationManager;

        protected JeControllerBase(IUserManager userManager, Logger logger, UserConfigurationManager userConfigurationManager)
        {
            _userManager = userManager;
            _logger = logger;
            _userConfigurationManager = userConfigurationManager;
        }

        protected IActionResult? AuthorizeUserConfigAccess(string requestedUserId, out string authorizedUserId)
        {
            authorizedUserId = string.Empty;

            if (string.IsNullOrWhiteSpace(requestedUserId))
            {
                return BadRequest(new { message = "userId is required." });
            }

            if (!Guid.TryParse(requestedUserId, out var parsedUserId) && !Guid.TryParseExact(requestedUserId, "N", out parsedUserId))
            {
                return BadRequest(new { message = "Invalid userId format." });
            }

            var effectiveUserId = UserHelper.GetUserId(User, parsedUserId);
            if (!effectiveUserId.HasValue)
            {
                return Forbid();
            }

            // UserConfigurationManager expects folder names in N format (without dashes).
            authorizedUserId = effectiveUserId.Value.ToString("N");
            return null;
        }

        protected IActionResult? AuthorizeUserAccess(Guid requestedUserId, out JUser user)
        {
            user = null!;
            var effectiveUserId = UserHelper.GetUserId(User, requestedUserId);
            if (!effectiveUserId.HasValue)
            {
                return Forbid();
            }

            var resolvedUser = _userManager.GetUserById(effectiveUserId.Value);
            if (resolvedUser is null)
            {
                return NotFound();
            }

            user = resolvedUser;
            return null;
        }

        // previously a single `User.IsInRole("Administrator")`
        // magic-string check. Cross-check against the IUserManager-resolved
        // Jellyfin user's actual `IsAdministrator` permission so a future
        // Jellyfin core role-name rename can't silently downgrade JE's
        // admin gates. Falls back to the role claim if the user lookup
        // fails (which would be a programmer error since `[Authorize]`
        // gates every admin endpoint).
        protected bool IsAdminUser()
        {
            if (User.IsInRole("Administrator")) return true;
            try
            {
                var jfUserId = UserHelper.GetCurrentUserId(User);
                if (!jfUserId.HasValue) return false;
                var u = _userManager.GetUserById(jfUserId.Value);
                return u != null && u.HasPermission(Jellyfin.Database.Implementations.Enums.PermissionKind.IsAdministrator);
            }
            catch { return false; }
        }

        protected RevisionedSettingsResponse LoadRevisionedSettings(string userId)
            => new Features.Settings.Services.SettingsDocumentService(_userConfigurationManager).Read(userId, SettingsDefaults.Create, IsAdminUser());

        /// <summary>
        /// Per-request state for deciding which reviews a viewer may see.
        /// Shared by <see cref="GetItemReviews"/> and <see cref="GetReviewRatings"/>
        /// so the list and the poster rating chips can never disagree. Authors
        /// are resolved at most once per request.
        /// </summary>
        protected sealed class ReviewVisibilityContext
        {
            public bool ViewerIsAdmin { get; init; }
            public string? ViewerUserIdN { get; init; }
            public bool HideHiddenAuthors { get; init; }
            public bool HideDisabledAuthors { get; init; }
            public Dictionary<Guid, Jellyfin.Database.Implementations.Entities.User?> Authors { get; } = new();
        }

        protected ReviewVisibilityContext CreateReviewVisibilityContext(string endpoint, string target)
        {
            var config = JellyfinEnhanced.Instance?.Configuration;

            // Resolve the current viewer's "N"-format user id so we can
            // always show their OWN review back to them, even when the
            // viewer themselves is hidden/disabled in Jellyfin and the
            // hide filters would otherwise drop their author record.
            // Without this, a hidden non-admin user posting a review would
            // immediately lose visibility of their own content (issue 546).
            var viewerUserIdN = UserHelper.GetCurrentUserId(User)?.ToString("N");
            if (string.IsNullOrEmpty(viewerUserIdN))
            {
                // Anomalous: [Authorize] passed but the Jellyfin-UserId
                // claim is missing or unparseable. The self-review bypass
                // below will silently no-op, so warn here to give a
                // diagnostic trail if a hidden user reports the symptom
                // again with no obvious cause.
                _logger.Warning($"{endpoint}: could not resolve viewer user id from claims on {target}; self-review bypass disabled.");
            }

            return new ReviewVisibilityContext
            {
                ViewerIsAdmin = IsAdminUser(),
                ViewerUserIdN = viewerUserIdN,
                HideHiddenAuthors = config?.HideReviewsFromHiddenUsers ?? true,
                HideDisabledAuthors = config?.HideReviewsFromDisabledUsers ?? true,
            };
        }

        protected Guid GetCurrentUserId()
        {
            var claim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)
                     ?? User.FindFirst("sub")
                     ?? User.FindFirst("Sid");
            if (claim != null && Guid.TryParse(claim.Value, out var id))
                return id;
            return Guid.Empty;
        }
    }
}
