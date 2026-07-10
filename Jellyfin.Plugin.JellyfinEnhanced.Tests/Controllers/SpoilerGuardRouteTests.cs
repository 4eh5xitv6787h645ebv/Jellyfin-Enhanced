using System.Reflection;
using Jellyfin.Plugin.JellyfinEnhanced.Controllers;
using Microsoft.AspNetCore.Mvc.Routing;
using Xunit;

namespace Jellyfin.Plugin.JellyfinEnhanced.Tests.Controllers
{
    public sealed class SpoilerGuardRouteTests
    {
        [Fact]
        public void DedicatedController_OwnsEveryMainSpoilerRoute()
        {
            var routes = typeof(SpoilerGuardController)
                .GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
                .SelectMany(method => method.GetCustomAttributes<HttpMethodAttribute>())
                .SelectMany(attribute => attribute.HttpMethods.Select(
                    verb => $"{verb} {attribute.Template}"))
                .ToHashSet(StringComparer.Ordinal);

            var expected = new HashSet<string>(StringComparer.Ordinal)
            {
                "GET user-settings/{userId}/spoilerblur.json",
                "POST user-settings/{userId}/spoilerblur.json",
                "GET spoiler-blur/health",
                "DELETE spoiler-blur/health/{targetUserId}",
                "GET spoiler-blur/series",
                "GET spoiler-blur/user-prefs",
                "POST spoiler-blur/user-prefs",
                "POST spoiler-blur/series/{seriesId}",
                "DELETE spoiler-blur/series/{seriesId}",
                "POST spoiler-blur/movies/{movieId}",
                "DELETE spoiler-blur/movies/{movieId}",
                "POST spoiler-blur/collections/{collectionId}",
                "DELETE spoiler-blur/collections/{collectionId}",
                "POST spoiler-blur/pending/{mediaType}/{tmdbId}",
                "DELETE spoiler-blur/pending/{mediaType}/{tmdbId}",
            };

            Assert.Equal(expected, routes);
            Assert.Null(typeof(SpoilerGuardController).Assembly.GetType(
                "Jellyfin.Plugin.JellyfinEnhanced.Controllers.JellyfinEnhancedController"));
        }
    }
}
