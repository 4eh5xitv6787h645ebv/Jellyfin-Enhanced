using System;
using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Configuration;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Jellyfin.Plugin.JellyfinEnhanced.Configuration
{
    public partial class UserConfigurationManager
    {
        private readonly ActivityStore _activity;

        public AllActivityStore GetAllActivity() => _activity.GetAllActivity();

        public void RecordActivity(string userIdN, string itemIdN, string activityType,
                                   string nowIso, bool completed = false, double progress = 0)
            => _activity.RecordActivity(userIdN, itemIdN, activityType, nowIso, completed, progress);

        public void RemoveActivity(string userIdN, string itemIdN, string activityType)
            => _activity.RemoveActivity(userIdN, itemIdN, activityType);
    }
}
