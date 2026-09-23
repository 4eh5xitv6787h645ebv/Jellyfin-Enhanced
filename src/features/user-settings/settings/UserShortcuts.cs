using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class UserShortcuts
    {
        public List<Shortcut> Shortcuts { get; set; } = new List<Shortcut>();
    }
}
