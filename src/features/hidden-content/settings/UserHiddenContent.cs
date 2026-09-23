using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class UserHiddenContent
    {
        public Dictionary<string, HiddenContentItem> Items { get; set; } = new Dictionary<string, HiddenContentItem>();
        public HiddenContentSettings Settings { get; set; } = new HiddenContentSettings();
    }
}
