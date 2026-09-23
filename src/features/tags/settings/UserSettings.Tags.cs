using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserSettings
    {
        public bool QualityTagsEnabled { get; set; }
        public bool ShowResolutionTag { get; set; } = true;
        public bool ShowSourceTag { get; set; } = true;
        public bool ShowDynamicRangeTag { get; set; } = true;
        public bool ShowSpecialFormatTag { get; set; } = true;
        public bool ShowVideoCodecTag { get; set; } = true;
        public bool ShowAudioInfoTag { get; set; } = true;
        public int? ResolutionTagOrder { get; set; }
        public int? SourceTagOrder { get; set; }
        public int? DynamicRangeTagOrder { get; set; }
        public int? SpecialFormatTagOrder { get; set; }
        public int? VideoCodecTagOrder { get; set; }
        public int? AudioInfoTagOrder { get; set; }
        public bool GenreTagsEnabled { get; set; }
        public bool LanguageTagsEnabled { get; set; }
        public bool RatingTagsEnabled { get; set; }
        public bool PeopleTagsEnabled { get; set; }
        public bool TagsHideOnHover { get; set; }
        public string QualityTagsPosition { get; set; } = "top-left";
        public string GenreTagsPosition { get; set; } = "top-right";
        public string LanguageTagsPosition { get; set; } = "bottom-left";
        public string RatingTagsPosition { get; set; } = "bottom-right";
    }
}
