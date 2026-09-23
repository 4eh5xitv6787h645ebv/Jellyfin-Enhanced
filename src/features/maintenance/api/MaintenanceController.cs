using Microsoft.AspNetCore.Mvc;
using Jellyfin.Data;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Extensions;
using Microsoft.EntityFrameworkCore;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class MaintenanceController : UserControllerBase
    {
        private readonly MediaBrowser.Controller.Session.ISessionManager _sessionManager;
        private readonly Services.MaintenanceModeService _maintenanceModeService;

        public MaintenanceController(
            IUserManager userManager,
            MediaBrowser.Controller.Session.ISessionManager sessionManager,
            Services.MaintenanceModeService maintenanceModeService) : base(userManager)
        {
            _sessionManager = sessionManager;
            _maintenanceModeService = maintenanceModeService;
        }

        // ── Maintenance Mode ────────────────────────────────────────────────────

        [Authorize]
        [HttpGet("MaintenanceMode/Status")]
        public IActionResult GetMaintenanceStatus()
        {
            if (!IsAdminUser()) return Forbid();
            var state = _maintenanceModeService.GetStatus();
            return Ok(new
            {
                state.IsActive,
                state.Message,
                state.Action,
                state.StartedAt,
                state.EndsAt,
                AccountDisabledCount = state.AccountDisabledUserIds.Count,
                RemoteDisabledCount  = state.RemoteDisabledUserIds.Count
            });
        }

        [Authorize]
        [HttpPost("MaintenanceMode/Enable")]
        public async Task<IActionResult> EnableMaintenanceMode([FromBody] MaintenanceModeRequest request)
        {
            if (!IsAdminUser()) return Forbid();
            await _maintenanceModeService.EnableAsync(
                request.Message ?? string.Empty,
                request.DurationMinutes,
                request.Action ?? "disable_accounts",
                request.AffectedUserIds).ConfigureAwait(false);
            return Ok(new { success = true });
        }

        [Authorize]
        [HttpPost("MaintenanceMode/Disable")]
        public async Task<IActionResult> DisableMaintenanceMode()
        {
            if (!IsAdminUser()) return Forbid();
            await _maintenanceModeService.DisableAsync().ConfigureAwait(false);
            return Ok(new { success = true });
        }

        [Authorize]
        [HttpGet("MaintenanceMode/Users")]
        public IActionResult GetMaintenanceModeUsers()
        {
            if (!IsAdminUser()) return Forbid();
            var users = _userManager.GetAllUsers()
                .Where(u => !u.HasPermission(Jellyfin.Database.Implementations.Enums.PermissionKind.IsAdministrator))
                .Select(u => new { Id = u.Id.ToString(), u.Username })
                .OrderBy(u => u.Username)
                .ToList();
            return Ok(users);
        }

        [Authorize]
        [HttpPost("MaintenanceMode/Broadcast")]
        public async Task<IActionResult> BroadcastMaintenanceMessage([FromBody] MaintenanceBroadcastRequest request)
        {
            if (!IsAdminUser()) return Forbid();
            if (request == null || string.IsNullOrWhiteSpace(request.Text))
                return BadRequest("Message text is required.");

            var controllingSessionId = string.Empty;
            try
            {
                var adminSession = _sessionManager.Sessions.FirstOrDefault(s => s.UserId == GetCurrentUserId());
                controllingSessionId = adminSession?.Id ?? string.Empty;
            }
            catch { /* non-fatal */ }

            var command = new MediaBrowser.Model.Session.MessageCommand
            {
                Header = request.Header ?? "Server Maintenance",
                Text = request.Text,
                TimeoutMs = request.TimeoutMs > 0 ? request.TimeoutMs : 30000
            };

            var sent = 0; var skipped = 0; var errors = new List<string>();
            foreach (var session in _sessionManager.Sessions)
            {
                if (string.IsNullOrWhiteSpace(session.UserName) ||
                    string.Equals(session.UserName, "Unknown", StringComparison.OrdinalIgnoreCase))
                { skipped++; continue; }
                try
                {
                    await _sessionManager.SendMessageCommand(controllingSessionId, session.Id, command, CancellationToken.None).ConfigureAwait(false);
                    sent++;
                }
                catch (Exception ex)
                {
                    skipped++;
                    errors.Add($"{session.UserName}: {ex.Message}");
                }
            }

            return Ok(new { sent, skipped, errors });
        }

        public class MaintenanceBroadcastRequest
        {
            public string? Header { get; set; }
            public string Text { get; set; } = string.Empty;
            public long TimeoutMs { get; set; } = 30000;
        }
    }
}
