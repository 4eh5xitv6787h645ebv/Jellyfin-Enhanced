using System.Collections.Generic;
using MediaBrowser.Model.Dto;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services
{
    /// <summary>
    /// Scrubs title-bearing media metadata consistently in item and playback responses.
    /// Playback delivery URLs must survive unless they contain a raw external filename.
    /// </summary>
    internal static class SpoilerMediaSourceSanitizer
    {
        internal static void StripStreams(IEnumerable<MediaStream>? streams)
        {
            if (streams == null) return;
            foreach (var stream in streams)
            {
                if (stream == null) continue;
                stream.Title = null;
                stream.Comment = null;
                // Local external subtitles use an index-based DeliveryUrl that is
                // the client's only playback URL. Remote sources can instead use
                // a raw path containing the episode title; only remove that URL.
                if (stream.IsExternal)
                {
                    stream.Path = null;
                    if (stream.IsExternalUrl == true) stream.DeliveryUrl = null;
                }
            }
        }

        internal static void StripSources(IEnumerable<MediaSourceInfo>? sources, bool preserveVersionName)
        {
            if (sources == null) return;
            foreach (var source in sources)
            {
                if (source == null) continue;
                source.Path = null;
                // Movies retain labels such as "Director's Cut" in the version selector.
                if (!preserveVersionName) source.Name = null;
                StripStreams(source.MediaStreams);
                if (source.MediaAttachments == null) continue;
                foreach (var attachment in source.MediaAttachments)
                {
                    if (attachment == null) continue;
                    attachment.FileName = null;
                    attachment.Comment = null;
                }
            }
        }
    }
}
