using Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.Services;
using Jellyfin.Plugin.JellyfinEnhanced.Shared.MediaTags;

namespace Jellyfin.Plugin.JellyfinEnhanced.Features.MediaTags.PublicApi
{
    /// <summary>
    /// The Media Tags feature's surface for other features (artifacts/restructure-plan/backend.md §7.7). Another
    /// feature may reference this namespace and nothing else in Features.MediaTags (FeatureBoundaryTests). Forwarding
    /// only: each member calls the existing implementation, with no logic of its own.
    /// </summary>
    public static class MediaTagsApi
    {
        /// <summary>Forwards to <see cref="TagCacheService.Instance"/> for the members other features call.</summary>
        public static class TagCache
        {
            /// <summary><c>TagCacheService.Instance?.OnLogoSettingsChanged()</c>.</summary>
            public static void OnLogoSettingsChanged() => TagCacheService.Instance?.OnLogoSettingsChanged();

            /// <summary><c>TagCacheService.Instance?.OnRatingSourceSettingsChanged()</c>.</summary>
            public static void OnRatingSourceSettingsChanged() => TagCacheService.Instance?.OnRatingSourceSettingsChanged();
        }

        /// <summary>Forwards to the static <see cref="LeavingSoonService"/> members other features call.</summary>
        public static class LeavingSoon
        {
            /// <summary><c>LeavingSoonSources.Configured(config)</c>.</summary>
            public static bool Configured(Configuration.PluginConfiguration? config) => LeavingSoonSources.Configured(config);
        }

        /// <summary>Forwards to the static Tag Styles members (<see cref="Shared.MediaTags.PosterTags.TagStyleSet"/>, <see cref="Shared.MediaTags.PosterTags.TagStyleKeys"/>) other features call.</summary>
        public static class TagStyles
        {
            /// <summary><c>TagStyleSet.Parse(json, preset).IsEmpty</c>.</summary>
            public static bool ParseIsEmpty(string? json, string? preset) => Shared.MediaTags.PosterTags.TagStyleSet.Parse(json, preset).IsEmpty;

            /// <summary><c>TagStyleKeys.NormalizePreset(preset)</c>.</summary>
            public static string NormalizePreset(string? preset) => Shared.MediaTags.PosterTags.TagStyleKeys.NormalizePreset(preset);
        }

        /// <summary>Forwards to the static <see cref="PosterTags.NativeClientPolicy"/> members other features read.</summary>
        public static class NativeClients
        {
            /// <summary><c>NativeClientPolicy.BuiltInWebClients</c> (the same list instance).</summary>
            public static System.Collections.Generic.IReadOnlyList<string> BuiltInWebClients => PosterTags.NativeClientPolicy.BuiltInWebClients;
        }
    }
}
