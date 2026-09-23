using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public string LastOpenedTab { get; set; } = string.Empty;
        public string DisplayLanguage { get; set; } = string.Empty;
    }
}
