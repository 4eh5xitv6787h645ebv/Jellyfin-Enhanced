using System;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    /// <summary>
    /// Thrown by arr service helpers when an upstream fetch fails (SSRF guard reject, non-2xx,
    /// network/JSON error). Callers that iterate multiple instances should catch and record
    /// the failure so that destructive post-processing (e.g. <c>clearOldTags</c>) can be
    /// skipped — an empty result from the service must not be mistaken for "the instance
    /// genuinely has zero items".
    /// </summary>
    public class ArrFetchFailedException : Exception
    {
        public ArrFetchFailedException(string message) : base(message) { }
        public ArrFetchFailedException(string message, Exception inner) : base(message, inner) { }
    }
}
