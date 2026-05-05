using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using SkiaSharp;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagComposer
    {
        // Set once if SkiaSharp's native lib is unavailable. Subsequent calls
        // short-circuit instead of paying the throw-and-catch cost on every
        // poster request.
        private static int _disabledFlag;
        private static string? _disabledReason;
        public static bool Disabled => Volatile.Read(ref _disabledFlag) != 0;
        public static string? DisabledReason => _disabledReason;

        private readonly Logger _logger;

        public PosterTagComposer(Logger logger)
        {
            _logger = logger;
            ProbeOnce();
        }

        private void ProbeOnce()
        {
            if (Volatile.Read(ref _disabledFlag) != 0) return;
            try
            {
                var info = new SKImageInfo(2, 2, SKColorType.Bgra8888, SKAlphaType.Premul);
                using var surf = SKSurface.Create(info)
                    ?? throw new InvalidOperationException("SKSurface.Create returned null on probe");
                surf.Canvas.Clear(SKColors.Black);
            }
            catch (Exception ex) when (ex is DllNotFoundException || ex is TypeInitializationException || ex is BadImageFormatException)
            {
                _disabledReason = $"{ex.GetType().Name}: {ex.Message}";
                Interlocked.Exchange(ref _disabledFlag, 1);
                _logger.Error($"[PosterTags] SkiaSharp native library unavailable on this host — poster burn-in disabled. {_disabledReason}");
            }
            catch (Exception ex)
            {
                _logger.Warning($"[PosterTags] Skia probe warning ({ex.GetType().Name}): {ex.Message}");
            }
        }

        // Visual constants tuned for the typical poster aspect ratio range
        // (~0.6:1 to 1.5:1) at fillHeight values from 240 to 1200.
        private const float ChipPaddingFactor = 0.020f;
        private const float ChipHeightFactor = 0.058f;
        private const float ChipMinHeight = 16f;
        private const float ChipMaxHeight = 60f;
        private const float ChipGapFactor = 0.18f;
        private const float CornerRadiusFactor = 0.30f;
        private const float TextPaddingFactor = 0.45f;

        public byte[] Compose(byte[] sourceBytes, PosterTagSet tags, string contentType)
        {
            if (Disabled) return sourceBytes;
            if (tags.IsEmpty) return sourceBytes;

            using var input = SKBitmap.Decode(sourceBytes)
                ?? throw new InvalidDataException("SKBitmap.Decode returned null (unsupported or corrupt image bytes)");

            using var surface = SKSurface.Create(new SKImageInfo(input.Width, input.Height, SKColorType.Bgra8888, SKAlphaType.Premul))
                ?? throw new InvalidOperationException($"SKSurface.Create returned null for {input.Width}x{input.Height}");
            var canvas = surface.Canvas;
            canvas.DrawBitmap(input, 0, 0);

            DrawCornerStacks(canvas, input.Width, input.Height, tags.Chips);

            using var image = surface.Snapshot();
            var format = SelectFormat(contentType);
            var quality = format == SKEncodedImageFormat.Jpeg ? 88 : 92;
            using var data = image.Encode(format, quality)
                ?? throw new InvalidOperationException($"SKImage.Encode returned null for format {format}");
            return data.ToArray();
        }

        private static void DrawCornerStacks(SKCanvas canvas, int w, int h, IReadOnlyList<TagChip> chips)
        {
            var byCorner = chips
                .GroupBy(c => c.Corner)
                .ToDictionary(g => g.Key, g => g.OrderBy(c => c.Order).ThenBy(c => (int)c.Kind).ToList());

            var minDim = Math.Min(w, h);
            var chipHeight = Math.Clamp(h * ChipHeightFactor, ChipMinHeight, ChipMaxHeight);
            var padding = minDim * ChipPaddingFactor;
            var gap = chipHeight * ChipGapFactor;

            foreach (var pair in byCorner)
            {
                DrawStack(canvas, w, h, padding, chipHeight, gap, pair.Key, pair.Value);
            }
        }

        private static void DrawStack(SKCanvas canvas, int posterW, int posterH, float padding, float chipHeight, float gap, TagCorner corner, List<TagChip> stack)
        {
            // Top corners stack downward (each chip below the prior). Bottom
            // corners stack upward (each chip above the prior).
            var top = corner is TagCorner.TopLeft or TagCorner.TopRight;
            float cursorY = top ? padding : (posterH - padding - chipHeight);
            foreach (var chip in stack)
            {
                var rect = MeasureChip(chip.Label, chipHeight, padding, cursorY, corner, posterW);
                DrawChip(canvas, rect, chip);
                if (top)
                {
                    cursorY = rect.Bottom + gap;
                }
                else
                {
                    cursorY = rect.Top - gap - chipHeight;
                }
            }
        }

        private static SKRect MeasureChip(string label, float height, float padding, float cursorY, TagCorner corner, int posterW)
        {
            using var paint = new SKPaint
            {
                IsAntialias = true,
                Typeface = SKTypeface.FromFamilyName("Sans-Serif", SKFontStyle.Bold),
                TextSize = height * 0.55f,
            };
            var textWidth = paint.MeasureText(label);
            var textPadding = height * TextPaddingFactor;
            var width = textWidth + textPadding * 2f;

            var alignLeft = corner is TagCorner.TopLeft or TagCorner.BottomLeft;
            float left = alignLeft ? padding : posterW - padding - width;
            float top = cursorY;
            return new SKRect(left, top, left + width, top + height);
        }

        private static void DrawChip(SKCanvas canvas, SKRect rect, TagChip chip)
        {
            var (fill, textColor) = StyleColors(chip);
            var radius = rect.Height * CornerRadiusFactor;
            using (var bgPaint = new SKPaint { Color = fill, IsAntialias = true, Style = SKPaintStyle.Fill })
            {
                canvas.DrawRoundRect(rect, radius, radius, bgPaint);
            }
            using (var textPaint = new SKPaint
            {
                Color = textColor,
                IsAntialias = true,
                Typeface = SKTypeface.FromFamilyName("Sans-Serif", SKFontStyle.Bold),
                TextSize = rect.Height * 0.55f,
                TextAlign = SKTextAlign.Center,
            })
            {
                var metrics = textPaint.FontMetrics;
                var baselineY = rect.MidY - (metrics.Ascent + metrics.Descent) / 2f;
                canvas.DrawText(chip.Label, rect.MidX, baselineY, textPaint);
            }
        }

        private static (SKColor Fill, SKColor Text) StyleColors(TagChip chip) => chip.Style switch
        {
            ChipStyle.RatingNormal => (new SKColor(30, 100, 50, 220), SKColors.White),
            ChipStyle.RatingHigh => (new SKColor(40, 130, 60, 235), SKColors.White),
            ChipStyle.Language => (new SKColor(40, 70, 130, 220), SKColors.White),
            ChipStyle.Quality => QualityColor(chip.Label),
            _ => (new SKColor(20, 20, 28, 215), SKColors.White),
        };

        // Mirrors the qualityColors map in qualitytags.js so server-side burn-in
        // matches the web client's color scheme.
        private static (SKColor Fill, SKColor Text) QualityColor(string label) => label switch
        {
            "8K" => (new SKColor(220, 20, 60, 240), SKColors.White),
            "4K" => (new SKColor(189, 5, 232, 240), SKColors.White),
            "1440p" => (new SKColor(255, 20, 147, 230), SKColors.White),
            "1080p" => (new SKColor(0, 191, 255, 230), SKColors.White),
            "720p" => (new SKColor(255, 165, 0, 230), SKColors.Black),
            "480p" => (new SKColor(255, 193, 7, 220), SKColors.Black),
            "SD" => (new SKColor(108, 117, 125, 220), SKColors.White),
            "LOW-RES" => (new SKColor(108, 117, 125, 220), SKColors.White),
            "HDR" or "HDR10" or "HDR10+" => (new SKColor(255, 215, 0, 240), SKColors.Black),
            "Dolby Vision" => (new SKColor(139, 69, 19, 240), SKColors.White),
            "IMAX" => (new SKColor(0, 114, 206, 230), SKColors.White),
            "ATMOS" => (new SKColor(0, 100, 255, 230), SKColors.White),
            "DTS-X" => (new SKColor(255, 100, 0, 230), SKColors.White),
            "DTS" => (new SKColor(255, 140, 0, 220), SKColors.White),
            "Dolby Digital+" => (new SKColor(0, 150, 136, 230), SKColors.White),
            "TRUEHD" => (new SKColor(76, 175, 80, 230), SKColors.White),
            "7.1" => (new SKColor(156, 39, 176, 230), SKColors.White),
            "5.1" => (new SKColor(103, 58, 183, 230), SKColors.White),
            "3D" => (new SKColor(0, 150, 255, 230), SKColors.White),
            "AV1" => (new SKColor(255, 87, 34, 240), SKColors.White),
            "HEVC" or "H265" => (new SKColor(33, 150, 243, 230), SKColors.White),
            "VP9" => (new SKColor(156, 39, 176, 230), SKColors.White),
            "H264" => (new SKColor(76, 175, 80, 230), SKColors.White),
            "BluRay" => (new SKColor(20, 50, 130, 230), SKColors.White),
            "HD DVD" => (new SKColor(80, 30, 130, 230), SKColors.White),
            "DVD" => (new SKColor(60, 60, 60, 230), SKColors.White),
            "VHS" => (new SKColor(110, 80, 50, 230), SKColors.White),
            "HDTV" => (new SKColor(40, 100, 150, 230), SKColors.White),
            _ => (new SKColor(80, 80, 90, 220), SKColors.White),
        };

        private static SKEncodedImageFormat SelectFormat(string contentType)
        {
            if (contentType.Contains("png", StringComparison.OrdinalIgnoreCase)) return SKEncodedImageFormat.Png;
            if (contentType.Contains("webp", StringComparison.OrdinalIgnoreCase)) return SKEncodedImageFormat.Webp;
            return SKEncodedImageFormat.Jpeg;
        }
    }
}
