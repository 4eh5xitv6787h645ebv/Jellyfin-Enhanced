using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public string CalendarDisplayMode { get; set; } = "list";
        public string CalendarDefaultViewMode { get; set; } = "agenda";
    }
}
