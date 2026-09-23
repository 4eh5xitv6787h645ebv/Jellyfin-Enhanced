using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{

    public class ElsewhereSettings
    {
        public string Region { get; set; } = string.Empty;
        public List<string> Regions { get; set; } = new List<string>();
        public List<string> Services { get; set; } = new List<string>();
    }
}
