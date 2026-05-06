using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    // Derives a per-item TagSet by combining the user's UserSettings (per-user
    // toggles + corner positions + quality category order) with the admin
    // PluginConfiguration defaults and the item's metadata. Mirrors the
    // categorization logic in js/tags/qualitytags.js / genretags.js / etc.
    public sealed class PosterTagResolver
    {
        // Within-category sort orders cribbed from qualitytags.js — lower
        // index = higher within-category priority.
        private static readonly string[] ResolutionOrder = { "8K", "4K", "1440p", "1080p", "720p", "480p", "LOW-RES", "SD" };
        private static readonly string[] DynamicRangeOrder = { "Dolby Vision", "HDR10+", "HDR10", "HDR" };
        private static readonly string[] CodecOrder = { "AV1", "HEVC", "H265", "VP9", "H264", "VP8", "XVID", "DIVX", "WMV", "MPEG2", "MPEG4", "MJPEG", "THEORA" };
        private static readonly string[] AudioOrder = { "ATMOS", "DTS-X", "TRUEHD", "DTS", "Dolby Digital+", "7.1", "5.1" };
        private static readonly string[] SourceOrder = { "BluRay", "HD DVD", "DVD", "VHS", "HDTV", "Physical" };
        private static readonly string[] SpecialFormatOrder = { "IMAX", "3D" };

        private readonly Logger? _logger;

        public PosterTagResolver(Logger logger)
        {
            _logger = logger;
        }

        public PosterTagSet Resolve(BaseItem item, EffectivePosterTagSettings settings)
        {
            var chips = new List<TagChip>();

            if (settings.GenreEnabled)
            {
                var genre = item.Genres?.FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(genre))
                {
                    chips.Add(new TagChip
                    {
                        Kind = TagKind.Genre,
                        Label = genre.ToUpperInvariant(),
                        Corner = settings.GenreCorner,
                        Style = ChipStyle.Neutral,
                        Order = 1,
                    });
                }
            }

            if (settings.RatingEnabled && item.CommunityRating.HasValue)
            {
                var rating = item.CommunityRating.Value;
                chips.Add(new TagChip
                {
                    Kind = TagKind.Rating,
                    Label = rating.ToString("0.0", CultureInfo.InvariantCulture),
                    Corner = settings.RatingCorner,
                    Style = rating >= 7.5f ? ChipStyle.RatingHigh : ChipStyle.RatingNormal,
                    Order = 1,
                });
            }

            if (settings.LanguageEnabled)
            {
                var langs = ExtractLanguages(item);
                int order = 1;
                foreach (var lang in langs.Take(2))
                {
                    chips.Add(new TagChip
                    {
                        Kind = TagKind.Language,
                        Label = lang.ToUpperInvariant(),
                        Corner = settings.LanguageCorner,
                        Style = ChipStyle.Language,
                        Order = order++,
                    });
                }
            }

            if (settings.QualityEnabled)
            {
                var qualityChips = ResolveQualityChips(item, settings);
                chips.AddRange(qualityChips);
            }

            return new PosterTagSet
            {
                Chips = chips,
                Fingerprint = settings.Fingerprint,
            };
        }

        private IReadOnlyList<TagChip> ResolveQualityChips(BaseItem item, EffectivePosterTagSettings settings)
        {
            var detected = DetectQualityLabels(item);
            if (detected.Count == 0)
            {
                return Array.Empty<TagChip>();
            }

            // Bucket by category, drop disabled categories, keep best-priority
            // per category (resolution: top 1; others: top 1 to avoid clutter
            // on a poster — the web UI shows full list but burning all of them
            // would dominate the image).
            var buckets = new Dictionary<QualityCategory, List<string>>();
            foreach (var label in detected)
            {
                var cat = Categorize(label);
                if (cat == null) continue;
                if (!IsCategoryEnabled(cat.Value, settings)) continue;
                if (!buckets.TryGetValue(cat.Value, out var list))
                {
                    list = new List<string>();
                    buckets[cat.Value] = list;
                }
                list.Add(label);
            }

            var chips = new List<TagChip>();
            foreach (var pair in buckets)
            {
                var sorted = pair.Value.OrderBy(t => CategoryPriority(pair.Key, t)).ToList();
                var topLabel = sorted[0];
                chips.Add(new TagChip
                {
                    Kind = TagKind.Quality,
                    Label = topLabel,
                    Corner = settings.QualityCorner,
                    Style = ChipStyle.Quality,
                    Order = CategoryStackOrder(pair.Key, settings),
                });
            }

            return chips;
        }

        private static int CategoryStackOrder(QualityCategory cat, EffectivePosterTagSettings s) => cat switch
        {
            QualityCategory.Resolution => s.QualityResolutionOrder,
            QualityCategory.Source => s.QualitySourceOrder,
            QualityCategory.DynamicRange => s.QualityDynamicRangeOrder,
            QualityCategory.SpecialFormat => s.QualitySpecialFormatOrder,
            QualityCategory.VideoCodec => s.QualityVideoCodecOrder,
            QualityCategory.Audio => s.QualityAudioOrder,
            _ => 99,
        };

        private static bool IsCategoryEnabled(QualityCategory cat, EffectivePosterTagSettings s) => cat switch
        {
            QualityCategory.Resolution => s.QualityResolution,
            QualityCategory.Source => s.QualitySource,
            QualityCategory.DynamicRange => s.QualityDynamicRange,
            QualityCategory.SpecialFormat => s.QualitySpecialFormat,
            QualityCategory.VideoCodec => s.QualityVideoCodec,
            QualityCategory.Audio => s.QualityAudio,
            _ => false,
        };

        private static int CategoryPriority(QualityCategory cat, string label)
        {
            var order = cat switch
            {
                QualityCategory.Resolution => ResolutionOrder,
                QualityCategory.DynamicRange => DynamicRangeOrder,
                QualityCategory.VideoCodec => CodecOrder,
                QualityCategory.Audio => AudioOrder,
                QualityCategory.Source => SourceOrder,
                QualityCategory.SpecialFormat => SpecialFormatOrder,
                _ => Array.Empty<string>(),
            };
            var idx = Array.IndexOf(order, label);
            return idx == -1 ? 999 : idx;
        }

        private static QualityCategory? Categorize(string label)
        {
            if (Array.IndexOf(ResolutionOrder, label) >= 0) return QualityCategory.Resolution;
            if (Array.IndexOf(DynamicRangeOrder, label) >= 0) return QualityCategory.DynamicRange;
            if (Array.IndexOf(CodecOrder, label) >= 0) return QualityCategory.VideoCodec;
            if (Array.IndexOf(AudioOrder, label) >= 0) return QualityCategory.Audio;
            if (Array.IndexOf(SourceOrder, label) >= 0) return QualityCategory.Source;
            if (Array.IndexOf(SpecialFormatOrder, label) >= 0) return QualityCategory.SpecialFormat;
            // Bare channel layout like "2.0" → audio
            if (label.Length >= 3 && label[1] == '.' && char.IsDigit(label[0]) && char.IsDigit(label[2]))
            {
                return QualityCategory.Audio;
            }
            return null;
        }

        private List<string> DetectQualityLabels(BaseItem item)
        {
            var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            try
            {
                var sources = item.GetMediaSources(false);
                foreach (var src in sources)
                {
                    if (src.MediaStreams == null) continue;

                    foreach (var s in src.MediaStreams)
                    {
                        if (s.Type == MediaStreamType.Video)
                        {
                            AddResolutionLabel(s, found);
                            AddCodecLabel(s, found);
                            AddDynamicRangeLabel(s, found);
                        }
                        if (s.Type == MediaStreamType.Audio)
                        {
                            AddAudioLabel(s, found);
                        }
                    }

                    if (!string.IsNullOrEmpty(src.Path))
                    {
                        DetectSourceFromPath(src.Path, found);
                        DetectSpecialFormatFromPath(src.Path, found);
                    }
                    if (!string.IsNullOrEmpty(src.Name))
                    {
                        DetectSourceFromPath(src.Name, found);
                        DetectSpecialFormatFromPath(src.Name, found);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger?.Warning($"[PosterTags] DetectQualityLabels failed for {item.Id:N} ({ex.GetType().Name}): {ex.Message}");
            }

            // Stable order so the cache key built from these labels is reproducible
            // across HashSet rehashes / runtime restarts (per v2-H1 review).
            var list = found.ToList();
            list.Sort(StringComparer.Ordinal);
            return list;
        }

        private static void AddResolutionLabel(MediaStream s, HashSet<string> found)
        {
            int? h = s.Height;
            if (!h.HasValue) return;
            var label = h switch
            {
                >= 4320 => "8K",
                >= 2000 => "4K",
                >= 1300 => "1440p",
                >= 900 => "1080p",
                >= 650 => "720p",
                >= 400 => "480p",
                >= 240 => "SD",
                _ => "LOW-RES",
            };
            found.Add(label);
        }

        private static void AddCodecLabel(MediaStream s, HashSet<string> found)
        {
            var codec = (s.Codec ?? string.Empty).ToUpperInvariant();
            switch (codec)
            {
                case "AV1": found.Add("AV1"); break;
                case "HEVC":
                case "H265":
                    found.Add("HEVC"); break;
                case "VP9": found.Add("VP9"); break;
                case "H264":
                case "AVC":
                    found.Add("H264"); break;
                case "VP8": found.Add("VP8"); break;
                case "XVID": found.Add("XVID"); break;
                case "DIVX": found.Add("DIVX"); break;
                case "WMV":
                case "WMV3":
                case "VC1":
                    found.Add("WMV"); break;
                case "MPEG2":
                case "MPEG2VIDEO":
                    found.Add("MPEG2"); break;
                case "MPEG4": found.Add("MPEG4"); break;
                case "MJPEG": found.Add("MJPEG"); break;
                case "THEORA": found.Add("THEORA"); break;
            }
        }

        private static void AddDynamicRangeLabel(MediaStream s, HashSet<string> found)
        {
            var range = (s.VideoRangeType.ToString() ?? string.Empty).ToUpperInvariant();
            // VideoRangeType is the modern field; common values: SDR, HDR10, HDR10Plus, DOVI, DOVIWithHDR10, HLG.
            if (range.Contains("DOVI")) found.Add("Dolby Vision");
            if (range.Contains("HDR10PLUS")) found.Add("HDR10+");
            if (range.Contains("HDR10") && !range.Contains("HDR10PLUS")) found.Add("HDR10");
            if (range.Contains("HLG")) found.Add("HDR");
        }

        private static void AddAudioLabel(MediaStream s, HashSet<string> found)
        {
            var profile = (s.Profile ?? string.Empty).ToUpperInvariant();
            var codec = (s.Codec ?? string.Empty).ToUpperInvariant();
            var disp = (s.DisplayTitle ?? string.Empty).ToUpperInvariant();
            var channels = s.Channels;

            if (profile.Contains("ATMOS") || disp.Contains("ATMOS")) found.Add("ATMOS");
            if (profile.Contains("DTS-X") || profile.Contains("DTS:X") || disp.Contains("DTS-X") || disp.Contains("DTS:X")) found.Add("DTS-X");
            if (codec == "TRUEHD" || disp.Contains("TRUEHD")) found.Add("TRUEHD");
            if (codec == "DTS" || codec == "DCA") found.Add("DTS");
            if (codec == "EAC3" || disp.Contains("DOLBY DIGITAL+") || disp.Contains("E-AC-3")) found.Add("Dolby Digital+");

            if (channels == 8) found.Add("7.1");
            else if (channels == 6) found.Add("5.1");
        }

        private static readonly (string Pattern, string Label)[] SourceMarkers =
        {
            ("BLURAY", "BluRay"),
            ("BLU-RAY", "BluRay"),
            ("BD25", "BluRay"),
            ("BD50", "BluRay"),
            ("HDDVD", "HD DVD"),
            ("HD-DVD", "HD DVD"),
            ("DVDRIP", "DVD"),
            (".DVD.", "DVD"),
            ("VHSRIP", "VHS"),
            (".VHS.", "VHS"),
            ("HDTV", "HDTV"),
            ("PDTV", "HDTV"),
        };

        private static void DetectSourceFromPath(string path, HashSet<string> found)
        {
            var name = Path.GetFileName(path)?.ToUpperInvariant() ?? string.Empty;
            foreach (var (pat, label) in SourceMarkers)
            {
                if (name.Contains(pat))
                {
                    found.Add(label);
                    return;
                }
            }
        }

        private static void DetectSpecialFormatFromPath(string path, HashSet<string> found)
        {
            var name = Path.GetFileName(path)?.ToUpperInvariant() ?? string.Empty;
            if (name.Contains("IMAX")) found.Add("IMAX");
            if (name.Contains(".3D.") || name.Contains(" 3D ") || name.Contains("-3D-")) found.Add("3D");
        }

        private List<string> ExtractLanguages(BaseItem item)
        {
            var languages = new List<string>();
            try
            {
                foreach (var src in item.GetMediaSources(false))
                {
                    if (src.MediaStreams == null) continue;
                    foreach (var s in src.MediaStreams)
                    {
                        if (s.Type != MediaStreamType.Audio) continue;
                        var lang = (s.Language ?? string.Empty).ToLowerInvariant();
                        if (string.IsNullOrEmpty(lang) || lang == "und" || lang == "root") continue;
                        if (!languages.Contains(lang)) languages.Add(lang);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger?.Warning($"[PosterTags] ExtractLanguages failed for {item.Id:N} ({ex.GetType().Name}): {ex.Message}");
            }
            return languages;
        }

        private enum QualityCategory
        {
            Resolution,
            Source,
            DynamicRange,
            SpecialFormat,
            VideoCodec,
            Audio,
        }
    }

    // Effective per-poster settings after merging UserSettings → PluginConfiguration → defaults.
    public sealed class EffectivePosterTagSettings
    {
        public bool GenreEnabled { get; init; } = true;
        public bool RatingEnabled { get; init; } = true;
        public bool LanguageEnabled { get; init; }
        public bool QualityEnabled { get; init; }

        public TagCorner GenreCorner { get; init; } = TagCorner.BottomRight;
        public TagCorner RatingCorner { get; init; } = TagCorner.BottomRight;
        public TagCorner LanguageCorner { get; init; } = TagCorner.BottomLeft;
        public TagCorner QualityCorner { get; init; } = TagCorner.TopLeft;

        public bool QualityResolution { get; init; } = true;
        public bool QualitySource { get; init; } = true;
        public bool QualityDynamicRange { get; init; } = true;
        public bool QualitySpecialFormat { get; init; } = true;
        public bool QualityVideoCodec { get; init; } = true;
        public bool QualityAudio { get; init; } = true;

        public int QualityResolutionOrder { get; init; } = 1;
        public int QualitySourceOrder { get; init; } = 2;
        public int QualityDynamicRangeOrder { get; init; } = 3;
        public int QualitySpecialFormatOrder { get; init; } = 4;
        public int QualityVideoCodecOrder { get; init; } = 5;
        public int QualityAudioOrder { get; init; } = 6;

        public string Fingerprint { get; init; } = "v1";

        public static EffectivePosterTagSettings Compose(PluginConfiguration admin, UserSettings? user)
        {
            // Native clients (Swiftfin, Plethorafin, Findroid, Roku, etc.) hit
            // Jellyfin's image endpoint anonymously — no Authorization header,
            // no api_key — because Jellyfin allows anonymous image fetches.
            // We can't resolve the user, so admin's PluginConfiguration becomes
            // the authoritative source. Admin's existing tag toggles + position
            // strings (the same ones the web client falls back to) drive the
            // burn-in for every native client. Authenticated callers (rare but
            // possible) can still override via UserSettings.
            bool? userGenre = user?.GenreTagsEnabled;
            bool? userRating = user?.RatingTagsEnabled;
            bool? userLanguage = user?.LanguageTagsEnabled;
            bool? userQuality = user?.QualityTagsEnabled;

            var s = new EffectivePosterTagSettings
            {
                GenreEnabled = (userGenre ?? admin.GenreTagsEnabled) && admin.EnablePosterTags,
                RatingEnabled = (userRating ?? admin.RatingTagsEnabled) && admin.EnablePosterTags,
                LanguageEnabled = (userLanguage ?? admin.LanguageTagsEnabled) && admin.EnablePosterTags,
                QualityEnabled = (userQuality ?? admin.QualityTagsEnabled) && admin.EnablePosterTags,

                GenreCorner = PosterTagSet.ParseCorner(user?.GenreTagsPosition ?? admin.GenreTagsPosition, TagCorner.BottomRight),
                RatingCorner = PosterTagSet.ParseCorner(user?.RatingTagsPosition ?? admin.RatingTagsPosition, TagCorner.BottomRight),
                LanguageCorner = PosterTagSet.ParseCorner(user?.LanguageTagsPosition ?? admin.LanguageTagsPosition, TagCorner.BottomLeft),
                QualityCorner = PosterTagSet.ParseCorner(user?.QualityTagsPosition ?? admin.QualityTagsPosition, TagCorner.TopLeft),

                QualityResolution = user?.ShowResolutionTag ?? admin.ShowResolutionTag,
                QualitySource = user?.ShowSourceTag ?? admin.ShowSourceTag,
                QualityDynamicRange = user?.ShowDynamicRangeTag ?? admin.ShowDynamicRangeTag,
                QualitySpecialFormat = user?.ShowSpecialFormatTag ?? admin.ShowSpecialFormatTag,
                QualityVideoCodec = user?.ShowVideoCodecTag ?? admin.ShowVideoCodecTag,
                QualityAudio = user?.ShowAudioInfoTag ?? admin.ShowAudioInfoTag,

                QualityResolutionOrder = user?.ResolutionTagOrder ?? admin.ResolutionTagOrder,
                QualitySourceOrder = user?.SourceTagOrder ?? admin.SourceTagOrder,
                QualityDynamicRangeOrder = user?.DynamicRangeTagOrder ?? admin.DynamicRangeTagOrder,
                QualitySpecialFormatOrder = user?.SpecialFormatTagOrder ?? admin.SpecialFormatTagOrder,
                QualityVideoCodecOrder = user?.VideoCodecTagOrder ?? admin.VideoCodecTagOrder,
                QualityAudioOrder = user?.AudioInfoTagOrder ?? admin.AudioInfoTagOrder,

                Fingerprint = BuildFingerprint(admin, user),
            };
            return s;
        }

        private static string BuildFingerprint(PluginConfiguration admin, UserSettings? user)
        {
            var sb = new StringBuilder(64);
            sb.Append(admin.PosterTagFingerprint).Append('|');
            sb.Append((user?.GenreTagsEnabled ?? admin.GenreTagsEnabled) ? '1' : '0');
            sb.Append((user?.RatingTagsEnabled ?? admin.RatingTagsEnabled) ? '1' : '0');
            sb.Append((user?.LanguageTagsEnabled ?? admin.LanguageTagsEnabled) ? '1' : '0');
            sb.Append((user?.QualityTagsEnabled ?? admin.QualityTagsEnabled) ? '1' : '0');
            sb.Append('|');
            sb.Append(user?.GenreTagsPosition ?? string.Empty).Append('-');
            sb.Append(user?.RatingTagsPosition ?? string.Empty).Append('-');
            sb.Append(user?.LanguageTagsPosition ?? string.Empty).Append('-');
            sb.Append(user?.QualityTagsPosition ?? string.Empty);
            sb.Append('|');
            // Quality category enables + order. Each category contributes one
            // hex byte with bits for enable + 4-bit order.
            AppendQuality(sb, user?.ShowResolutionTag ?? admin.ShowResolutionTag, user?.ResolutionTagOrder ?? admin.ResolutionTagOrder);
            AppendQuality(sb, user?.ShowSourceTag ?? admin.ShowSourceTag, user?.SourceTagOrder ?? admin.SourceTagOrder);
            AppendQuality(sb, user?.ShowDynamicRangeTag ?? admin.ShowDynamicRangeTag, user?.DynamicRangeTagOrder ?? admin.DynamicRangeTagOrder);
            AppendQuality(sb, user?.ShowSpecialFormatTag ?? admin.ShowSpecialFormatTag, user?.SpecialFormatTagOrder ?? admin.SpecialFormatTagOrder);
            AppendQuality(sb, user?.ShowVideoCodecTag ?? admin.ShowVideoCodecTag, user?.VideoCodecTagOrder ?? admin.VideoCodecTagOrder);
            AppendQuality(sb, user?.ShowAudioInfoTag ?? admin.ShowAudioInfoTag, user?.AudioInfoTagOrder ?? admin.AudioInfoTagOrder);
            return sb.ToString();
        }

        private static void AppendQuality(StringBuilder sb, bool enabled, int order)
        {
            sb.Append(enabled ? '1' : '0');
            sb.Append((order & 0xF).ToString("X"));
        }
    }
}
