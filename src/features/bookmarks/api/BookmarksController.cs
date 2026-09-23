using Microsoft.AspNetCore.Mvc;
using MediaBrowser.Controller.Library;
using Microsoft.AspNetCore.Authorization;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;

namespace Jellyfin.Plugin.JellyfinEnhanced.Controllers
{
    [Route("JellyfinEnhanced")]
    [ApiController]
    public sealed class BookmarksController : UserControllerBase
    {
        private readonly Logger _logger;
        private readonly UserConfigurationManager _userConfigurationManager;

        public BookmarksController(
            Logger logger,
            UserConfigurationManager userConfigurationManager,
            IUserManager userManager) : base(userManager)
        {
            _logger = logger;
            _userConfigurationManager = userConfigurationManager;
        }

        [HttpGet("user-settings/{userId}/bookmark.json")]
        [Authorize]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        [Produces("application/json")]
        public IActionResult GetUserBookmark(string userId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            var userConfig = _userConfigurationManager.GetUserConfiguration<UserBookmark>(authorizedUserId, "bookmark.json");
            return Ok(userConfig);
        }

        [HttpPost("user-settings/{userId}/bookmark.json")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult SaveUserBookmark(string userId, [FromBody] UserBookmark userConfiguration)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            try
            {
                _userConfigurationManager.SaveUserConfiguration(authorizedUserId, "bookmark.json", userConfiguration);
                _logger.Info($"Saved enhanced bookmarks for {ResolveUserDisplay(authorizedUserId)} to bookmark.json");
                return Ok(new { success = true, file = "bookmark.json" });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to save enhanced bookmarks for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to save enhanced bookmarks." });
            }
        }

        public sealed class AddBookmarkPayload
        {
            public string ItemId { get; set; } = string.Empty;
            public string TmdbId { get; set; } = string.Empty;
            public string TvdbId { get; set; } = string.Empty;
            public string MediaType { get; set; } = string.Empty;
            public string Name { get; set; } = string.Empty;
            public double Timestamp { get; set; }
            public string Label { get; set; } = string.Empty;
            public string SyncedFrom { get; set; } = string.Empty;
            public int? SeasonNumber { get; set; }
            public int? EpisodeNumber { get; set; }
        }

        [HttpPost("user-settings/{userId}/bookmark.json/add")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult AddUserBookmark(string userId, [FromBody] AddBookmarkPayload payload)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            if (payload == null || string.IsNullOrWhiteSpace(payload.ItemId))
            {
                return BadRequest(new { success = false, message = "ItemId is required." });
            }

            var now = DateTime.UtcNow.ToString("o");
            var bookmarkId = $"Bm_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N").Substring(0, 9)}";

            try
            {
                _userConfigurationManager.RmwUserConfiguration<UserBookmark>(authorizedUserId, "bookmark.json", config =>
                {
                    config.Bookmarks[bookmarkId] = new BookmarkItem
                    {
                        ItemId = payload.ItemId,
                        TmdbId = payload.TmdbId ?? string.Empty,
                        TvdbId = payload.TvdbId ?? string.Empty,
                        MediaType = payload.MediaType ?? string.Empty,
                        Name = payload.Name ?? string.Empty,
                        Timestamp = payload.Timestamp,
                        Label = payload.Label ?? string.Empty,
                        CreatedAt = now,
                        UpdatedAt = now,
                        SyncedFrom = payload.SyncedFrom ?? string.Empty,
                        SeasonNumber = payload.SeasonNumber,
                        EpisodeNumber = payload.EpisodeNumber
                    };
                    return 1;
                });
                _logger.Info($"Added bookmark {bookmarkId} for {ResolveUserDisplay(authorizedUserId)}");
                return Ok(new { success = true, id = bookmarkId });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to add bookmark for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to add bookmark." });
            }
        }

        [HttpDelete("user-settings/{userId}/bookmark.json/{bookmarkId}")]
        [Authorize]
        [Produces("application/json")]
        public IActionResult RemoveUserBookmark(string userId, string bookmarkId)
        {
            var authorizationResult = AuthorizeUserConfigAccess(userId, out var authorizedUserId);
            if (authorizationResult != null)
            {
                return authorizationResult;
            }

            if (string.IsNullOrWhiteSpace(bookmarkId))
            {
                return BadRequest(new { success = false, message = "bookmarkId is required." });
            }

            try
            {
                var removed = false;
                _userConfigurationManager.RmwUserConfiguration<UserBookmark>(authorizedUserId, "bookmark.json", config =>
                {
                    removed = config.Bookmarks.Remove(bookmarkId);
                    return removed ? 1 : 0;
                });

                if (!removed)
                {
                    return NotFound(new { success = false, removed = false, message = "No matching bookmark to remove." });
                }

                _logger.Info($"Removed bookmark {bookmarkId} for {ResolveUserDisplay(authorizedUserId)}");
                return Ok(new { success = true, removed = true });
            }
            catch (Exception ex)
            {
                _logger.Error($"Failed to remove bookmark {bookmarkId} for {ResolveUserDisplay(authorizedUserId)}: {ex.Message}");
                return StatusCode(500, new { success = false, message = "Failed to remove bookmark." });
            }
        }
    }
}
