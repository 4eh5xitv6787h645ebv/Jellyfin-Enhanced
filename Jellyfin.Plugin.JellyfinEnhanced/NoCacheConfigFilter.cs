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
            try
            {
                var routeValues = context.ActionDescriptor.RouteValues;
                if (routeValues is null) return;

                if (routeValues.TryGetValue("controller", out var controller)
                    && routeValues.TryGetValue("action", out var action)
                    && controller is not null
                    && action is not null
                    && NoCacheEndpoints.Contains((controller, action)))
                {
                    var headers = context.HttpContext.Response.Headers;
                    headers[HeaderNames.CacheControl] = "no-store, no-cache, max-age=0, must-revalidate";
                    headers[HeaderNames.Pragma] = "no-cache";
                    headers[HeaderNames.Expires] = "0";
                }
            }
            catch (Exception ex)
            {
                // Never let a cache-header filter crash the request pipeline.
                // Log once and proceed — the underlying action can still run.
                // [R7] Guard the logger call itself: if the logger is disposed
                // (DI container tearing down during shutdown) or the provider
                // throws, swallow it so the request still completes.
                try { _logger.LogWarning(ex, "NoCacheConfigFilter failed to apply headers"); }
                catch { /* shutdown race — nothing we can do safely */ }
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
