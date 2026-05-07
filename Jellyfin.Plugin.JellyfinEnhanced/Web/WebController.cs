using System.Reflection;
using System.Text;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Endpoints for the JE web subsystem. The bootstrap script and the
    /// version probe are intentionally unauthenticated so they can be loaded
    /// before the user signs in. Sidebar and tab metadata require auth.
    /// </summary>
    [ApiController]
    [Route("JellyfinEnhanced/web")]
    public sealed class WebController : ControllerBase
    {
        [HttpGet("bootstrap.js")]
        [AllowAnonymous]
        public ActionResult Bootstrap()
        {
            var stream = Assembly.GetExecutingAssembly()
                .GetManifestResourceStream("Jellyfin.Plugin.JellyfinEnhanced.js.web.bootstrap.js");
            if (stream is null) return NotFound();
            Response.Headers[HeaderNames.CacheControl] = "no-cache";
            return File(stream, "application/javascript");
        }

        [HttpGet("version")]
        [AllowAnonymous]
        public ActionResult<object> Version()
        {
            var topics = ConfigVersion.Topics();
            return new
            {
                versions = new
                {
                    sidebar = topics.Sidebar,
                    tabs = topics.Tabs,
                    config = topics.Config,
                    translations = topics.Translations
                }
            };
        }

        [HttpGet("sidebar")]
        [Authorize]
        public ActionResult<object> Sidebar()
        {
            var c = JellyfinEnhanced.Instance?.Configuration;
            var entries = new List<object>();

            if (c is null) return new { entries };

            if (c.CalendarPageEnabled && c.CalendarUsePluginPages)
            {
                entries.Add(new { id = "calendar", title = "Calendar", icon = "calendar_today", url = "#/JellyfinEnhanced/calendar" });
            }
            if (c.DownloadsPageEnabled && c.DownloadsUsePluginPages)
            {
                entries.Add(new { id = "downloads", title = "Requests", icon = "download", url = "#/JellyfinEnhanced/downloads" });
            }
            if (c.BookmarksEnabled && c.BookmarksUsePluginPages)
            {
                entries.Add(new { id = "bookmarks", title = "Bookmarks", icon = "bookmark", url = "#/JellyfinEnhanced/bookmarks" });
            }
            if (c.HiddenContentEnabled && c.HiddenContentUsePluginPages)
            {
                entries.Add(new { id = "hiddenContent", title = "Hidden Content", icon = "visibility_off", url = "#/JellyfinEnhanced/hiddenContent" });
            }

            return new { entries };
        }

        [HttpGet("tabs")]
        [Authorize]
        public ActionResult<object> Tabs()
        {
            var c = JellyfinEnhanced.Instance?.Configuration;
            var entries = new List<object>();

            if (c is null) return new { entries };

            if (c.CalendarPageEnabled && c.CalendarUseCustomTabs)
            {
                entries.Add(new { id = "calendar", title = "Calendar", icon = "calendar_today" });
            }
            if (c.DownloadsPageEnabled && c.DownloadsUseCustomTabs)
            {
                entries.Add(new { id = "downloads", title = "Requests", icon = "download" });
            }
            if (c.BookmarksEnabled && c.BookmarksUseCustomTabs)
            {
                entries.Add(new { id = "bookmarks", title = "Bookmarks", icon = "bookmark" });
            }
            if (c.HiddenContentEnabled && c.HiddenContentUseCustomTabs)
            {
                entries.Add(new { id = "hiddenContent", title = "Hidden Content", icon = "visibility_off" });
            }

            return new { entries };
        }
    }
}
