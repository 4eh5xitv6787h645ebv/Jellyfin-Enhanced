using System.Collections.Generic;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    /// <summary>Request body for <c>POST admin/copy-user-settings</c> — copy one user's JE
    /// preferences onto one or more target users.</summary>
    public class CopyUserSettingsRequest
    {
        public string FromUserId { get; set; } = string.Empty;
        public List<string> ToUserIds { get; set; } = new List<string>();
        public bool IncludeSettings { get; set; } = true;
        public bool IncludeShortcuts { get; set; } = true;
        public bool IncludeHiddenContentSettings { get; set; } = true;
    }

    /// <summary>Request body for <c>POST admin/setting-profiles</c> — create/update a reusable
    /// profile. Either snapshot an existing user (<see cref="FromUserId"/>) or supply the bundle
    /// directly.</summary>
    public class SaveProfileRequest
    {
        public string Name { get; set; } = string.Empty;
        /// <summary>When set, the profile is snapshotted from this user's current stored settings.</summary>
        public string? FromUserId { get; set; }
        public UserSettings? Settings { get; set; }
        public List<Shortcut>? Shortcuts { get; set; }
        public HiddenContentSettings? HiddenContentSettings { get; set; }
    }

    /// <summary>Request body for <c>POST admin/apply-profile</c> — apply a stored profile to a set
    /// of users.</summary>
    public class ApplyProfileRequest
    {
        public string Name { get; set; } = string.Empty;
        public List<string> UserIds { get; set; } = new List<string>();
        public bool IncludeSettings { get; set; } = true;
        public bool IncludeShortcuts { get; set; } = true;
        public bool IncludeHiddenContentSettings { get; set; } = true;
    }

    /// <summary>Request body for <c>POST admin/user-settings/{userId}</c> — the admin "act as user"
    /// save. Only the two surfaces the editor manages; the user's hidden <em>items</em> are never
    /// sent (the server preserves them).</summary>
    public class AdminActAsSaveRequest
    {
        public UserSettings? Settings { get; set; }
        public HiddenContentSettings? HiddenContentSettings { get; set; }
    }
}
