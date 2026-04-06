using System;
using System.Collections.Generic;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Logging;
using Microsoft.Net.Http.Headers;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    /// <summary>
    /// Global MVC action filter that adds Cache-Control: no-store to all
    /// plugin configuration endpoints. Registered via IPluginServiceRegistrator
    /// so it applies after routing — avoiding BaseUrl path-matching issues
    /// that affect IStartupFilter middleware.
    ///
    /// Targets both Jellyfin core endpoints (DashboardController, PluginsController)
    /// and Jellyfin Enhanced's own config endpoints.
    /// </summary>
    public sealed class NoCacheConfigFilter : IActionFilter
    {
        private readonly ILogger<NoCacheConfigFilter> _logger;

        /// <summary>
        /// Controller+action pairs whose responses must not be cached.
        /// Matched by RouteValues after routing has resolved the request,
        /// so BaseUrl prefixes are irrelevant.
        /// </summary>
        private static readonly HashSet<(string Controller, string Action)> NoCacheEndpoints
            = new(StringTupleComparer.Instance)
        {
            // Jellyfin core — plugin config page serving
            ("Dashboard", "GetConfigurationPages"),
            ("Dashboard", "GetDashboardConfigurationPage"),

            // Jellyfin core — plugin config JSON
            ("Plugins", "GetPluginConfiguration"),

            // Jellyfin Enhanced custom endpoints
            ("JellyfinEnhanced", "GetPublicConfig"),
            ("JellyfinEnhanced", "GetPrivateConfig"),
            ("JellyfinEnhanced", "GetConfigHash"),
        };

        public NoCacheConfigFilter(ILogger<NoCacheConfigFilter> logger)
        {
            _logger = logger;
        }

        public void OnActionExecuting(ActionExecutingContext context)
        {
            var routeValues = context.ActionDescriptor.RouteValues;

            if (routeValues.TryGetValue("controller", out var controller)
                && routeValues.TryGetValue("action", out var action)
                && controller is not null
                && action is not null
                && NoCacheEndpoints.Contains((controller, action)))
            {
                context.HttpContext.Response.Headers[HeaderNames.CacheControl]
                    = "no-store, no-cache, max-age=0, must-revalidate";
                context.HttpContext.Response.Headers[HeaderNames.Pragma]
                    = "no-cache";
                context.HttpContext.Response.Headers[HeaderNames.Expires]
                    = "0";
            }
        }

        public void OnActionExecuted(ActionExecutedContext context)
        {
            // No post-execution work needed.
        }

        /// <summary>
        /// Case-insensitive comparer for (controller, action) tuples.
        /// </summary>
        private sealed class StringTupleComparer : IEqualityComparer<(string, string)>
        {
            public static readonly StringTupleComparer Instance = new();

            public bool Equals((string, string) x, (string, string) y)
                => string.Equals(x.Item1, y.Item1, StringComparison.OrdinalIgnoreCase)
                && string.Equals(x.Item2, y.Item2, StringComparison.OrdinalIgnoreCase);

            public int GetHashCode((string, string) obj)
                => HashCode.Combine(
                    StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Item1 ?? string.Empty),
                    StringComparer.OrdinalIgnoreCase.GetHashCode(obj.Item2 ?? string.Empty));
        }
    }
}
