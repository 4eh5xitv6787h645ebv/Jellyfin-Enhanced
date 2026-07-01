using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>
    /// Single source of truth for the per-user settings "groups" surfaced in the
    /// Jellyfin Enhanced settings panel. Each group maps to a set of <see cref="UserSettings"/>
    /// property names. An admin can mark a group as <b>locked</b>
    /// (<see cref="PluginConfiguration.LockedUserSettingGroups"/>), which:
    /// <list type="bullet">
    ///   <item>hides the group from the per-user settings panel (client side), and</item>
    ///   <item>forces every field in that group back to the admin default whenever a user's
    ///   <c>settings.json</c> is saved (server side, via <see cref="EnforceLockedGroups"/>).</item>
    /// </list>
    /// The exact same group→field mapping is mirrored on the client in
    /// <c>js/enhanced/config.js</c> (<c>JE.SETTING_GROUPS</c>); keep the two in sync.
    /// </summary>
    public static class UserSettingsGroups
    {
        /// <summary>
        /// Ordered group key → governed <see cref="UserSettings"/> property names.
        /// Group keys are stable identifiers shared with the client and the admin config page;
        /// do not rename an existing key without migrating stored
        /// <see cref="PluginConfiguration.LockedUserSettingGroups"/> values.
        /// </summary>
        private static readonly IReadOnlyList<KeyValuePair<string, string[]>> _groups = new List<KeyValuePair<string, string[]>>
        {
            new("playback", new[]
            {
                nameof(UserSettings.AutoPauseEnabled), nameof(UserSettings.AutoResumeEnabled),
                nameof(UserSettings.AutoPipEnabled), nameof(UserSettings.LongPress2xEnabled),
                nameof(UserSettings.PauseScreenEnabled), nameof(UserSettings.PauseScreenDelaySeconds)
            }),
            new("autoskip", new[]
            {
                nameof(UserSettings.AutoSkipIntro), nameof(UserSettings.AutoSkipOutro)
            }),
            // The subtitle colour/custom-colour/position fields (see PreserveOnlyFields) have no
            // admin default. When the group is locked they are FROZEN at the user's stored value
            // rather than forced to a hard-coded POCO default — this both prevents the user from
            // changing them (a locked control the UI hides) and avoids resetting their personal
            // values. The style/size/font presets + disable-styles toggle DO have admin defaults
            // and are forced to them.
            new("subtitles", new[]
            {
                nameof(UserSettings.DisableCustomSubtitleStyles), nameof(UserSettings.SelectedStylePresetIndex),
                nameof(UserSettings.SelectedFontSizePresetIndex), nameof(UserSettings.SelectedFontFamilyPresetIndex),
                nameof(UserSettings.CustomSubtitleTextColor), nameof(UserSettings.CustomSubtitleBgColor),
                nameof(UserSettings.UsingCustomColors), nameof(UserSettings.SubtitleVerticalPosition),
                nameof(UserSettings.SubtitleHorizontalPosition)
            }),
            new("random", new[]
            {
                nameof(UserSettings.RandomButtonEnabled), nameof(UserSettings.RandomUnwatchedOnly),
                nameof(UserSettings.RandomIncludeMovies), nameof(UserSettings.RandomIncludeShows)
            }),
            new("watchprogress", new[]
            {
                nameof(UserSettings.ShowWatchProgress), nameof(UserSettings.WatchProgressMode),
                nameof(UserSettings.WatchProgressTimeFormat)
            }),
            new("filesizes", new[] { nameof(UserSettings.ShowFileSizes) }),
            new("audiolanguages", new[] { nameof(UserSettings.ShowAudioLanguages) }),
            new("qualitytags", new[]
            {
                nameof(UserSettings.QualityTagsEnabled), nameof(UserSettings.ShowResolutionTag),
                nameof(UserSettings.ShowSourceTag), nameof(UserSettings.ShowDynamicRangeTag),
                nameof(UserSettings.ShowSpecialFormatTag), nameof(UserSettings.ShowVideoCodecTag),
                nameof(UserSettings.ShowAudioInfoTag), nameof(UserSettings.ResolutionTagOrder),
                nameof(UserSettings.SourceTagOrder), nameof(UserSettings.DynamicRangeTagOrder),
                nameof(UserSettings.SpecialFormatTagOrder), nameof(UserSettings.VideoCodecTagOrder),
                nameof(UserSettings.AudioInfoTagOrder), nameof(UserSettings.QualityTagsPosition),
                nameof(UserSettings.TagsHideOnHover)
            }),
            new("genretags", new[]
            {
                nameof(UserSettings.GenreTagsEnabled), nameof(UserSettings.GenreTagsPosition)
            }),
            new("languagetags", new[]
            {
                nameof(UserSettings.LanguageTagsEnabled), nameof(UserSettings.LanguageTagsPosition)
            }),
            new("ratingtags", new[]
            {
                nameof(UserSettings.RatingTagsEnabled), nameof(UserSettings.RatingTagsPosition),
                nameof(UserSettings.ShowRatingInPlayer)
            }),
            new("peopletags", new[] { nameof(UserSettings.PeopleTagsEnabled) }),
            new("removecontinuewatching", new[] { nameof(UserSettings.RemoveContinueWatchingEnabled) }),
            new("language", new[] { nameof(UserSettings.DisplayLanguage) })
        };

        /// <summary>Ordered list of all valid group keys.</summary>
        public static IReadOnlyList<string> GroupKeys => _groups.Select(g => g.Key).ToList();

        /// <summary>True when <paramref name="key"/> is a recognised group key.</summary>
        public static bool IsValidGroupKey(string? key)
            => !string.IsNullOrWhiteSpace(key) && _groups.Any(g => g.Key == key);

        /// <summary>
        /// Filters an arbitrary (possibly client-supplied) collection of group keys down to the
        /// recognised, de-duplicated set. Used when persisting
        /// <see cref="PluginConfiguration.LockedUserSettingGroups"/> so unknown keys can't creep in.
        /// </summary>
        public static List<string> SanitizeLockedGroups(IEnumerable<string>? keys)
        {
            if (keys == null) return new List<string>();
            var valid = new HashSet<string>(GroupKeys, StringComparer.Ordinal);
            return keys.Where(k => k != null && valid.Contains(k)).Distinct(StringComparer.Ordinal).ToList();
        }

        // Reflection metadata for the UserSettings POCO, cached once. UserSettings is a flat
        // POCO with public get/set properties, so property-name copy is safe and cheap.
        private static readonly Dictionary<string, PropertyInfo> _props =
            typeof(UserSettings)
                .GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.CanRead && p.CanWrite)
                .ToDictionary(p => p.Name, StringComparer.Ordinal);

        /// <summary>
        /// Per-user fields that have NO admin-config default. When their group is locked they are
        /// FROZEN at the user's stored value (from <c>existing</c>) rather than forced to a
        /// hard-coded POCO default — that prevents the user changing them while avoiding data loss.
        /// (These are the subtitle colour/custom-colour/on-screen-position fields.)
        /// </summary>
        private static readonly HashSet<string> _preserveOnlyFields = new(StringComparer.Ordinal)
        {
            nameof(UserSettings.CustomSubtitleTextColor), nameof(UserSettings.CustomSubtitleBgColor),
            nameof(UserSettings.UsingCustomColors), nameof(UserSettings.SubtitleVerticalPosition),
            nameof(UserSettings.SubtitleHorizontalPosition)
        };

        /// <summary>
        /// Server-side enforcement of a lock: a user (or an admin acting as a user) cannot persist
        /// a change to a locked setting. For each field of a locked group:
        /// <list type="bullet">
        ///   <item>fields WITH an admin default are forced to <paramref name="adminDefaults"/>;</item>
        ///   <item><see cref="_preserveOnlyFields"/> (no admin default) are frozen to the value in
        ///   <paramref name="existing"/> — the currently-stored value — so a POST cannot change them
        ///   and they are never reset.</item>
        /// </list>
        /// Mutates <paramref name="target"/> in place. On a read path pass the loaded config as both
        /// <paramref name="target"/> and <paramref name="existing"/>. Returns the number of fields overwritten.
        /// </summary>
        public static int EnforceLockedGroups(UserSettings target, UserSettings adminDefaults, UserSettings existing, IEnumerable<string>? lockedGroups)
        {
            if (target == null || adminDefaults == null || lockedGroups == null) return 0;
            var locked = new HashSet<string>(lockedGroups, StringComparer.Ordinal);
            if (locked.Count == 0) return 0;
            var existingSource = existing ?? target;

            var changed = 0;
            foreach (var group in _groups)
            {
                if (!locked.Contains(group.Key)) continue;
                foreach (var fieldName in group.Value)
                {
                    if (!_props.TryGetValue(fieldName, out var prop)) continue;
                    var enforcedValue = _preserveOnlyFields.Contains(fieldName)
                        ? prop.GetValue(existingSource)   // freeze at stored value
                        : prop.GetValue(adminDefaults);   // force admin default
                    var currentValue = prop.GetValue(target);
                    if (!Equals(enforcedValue, currentValue))
                    {
                        prop.SetValue(target, enforcedValue);
                        changed++;
                    }
                }
            }
            return changed;
        }
    }
}
