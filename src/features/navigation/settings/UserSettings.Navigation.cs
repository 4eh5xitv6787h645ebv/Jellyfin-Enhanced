using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public bool RandomButtonEnabled { get; set; }
        public bool RandomUnwatchedOnly { get; set; }
        public bool RandomIncludeMovies { get; set; }
        public bool RandomIncludeShows { get; set; }
    }
}
