using System;
using System.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.Requests
{
    internal static class AutoRequestUrls
    {
        public static string[] GetConfiguredUrls(string? urls)
        {
            return (urls ?? string.Empty)
                .Split(new[] { '\r', '\n', ',' }, StringSplitOptions.RemoveEmptyEntries)
                .Select(url => url.Trim().TrimEnd('/'))
                .Where(url => !string.IsNullOrWhiteSpace(url))
                .ToArray();
        }

    }
}
