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
        private readonly ReviewStore _reviews;

        // Compatibility facade: callers keep the established manager API while each
        // server-wide store owns its file format, write lock, and corruption policy.
        public AllReviewsStore GetAllReviews() => _reviews.GetAllReviews();

        public void UpsertReview(string userIdN, string mediaType, string tmdbId,
                                 string content, double? rating, string nowIso)
            => _reviews.UpsertReview(userIdN, mediaType, tmdbId, content, rating, nowIso);

        public bool DeleteReview(string userIdN, string mediaType, string tmdbId)
            => _reviews.DeleteReview(userIdN, mediaType, tmdbId);
    }
}
