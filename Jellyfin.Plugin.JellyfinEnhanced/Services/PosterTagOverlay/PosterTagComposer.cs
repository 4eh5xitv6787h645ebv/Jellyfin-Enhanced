using System;
using System.Globalization;
using System.IO;
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

        // One-shot Skia probe: attempt a tiny native call. If it throws a
        // DllNotFoundException / TypeInitializationException / BadImageFormat,
        // the host is missing libSkiaSharp.so or has the wrong arch — burn-in
        // cannot work and we should say so loudly, once.
        private void ProbeOnce()
        {
            if (Volatile.Read(ref _disabledFlag) != 0)
            {
                return;
            }
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
                // Other probe failures are unexpected but should not permanently
                // disable: log a warning and continue.
                _logger.Warning($"[PosterTags] Skia probe warning ({ex.GetType().Name}): {ex.Message}");
            }
        }

        private const float ChipPaddingFactor = 0.018f;       // padding from edge as fraction of min(w,h)
        private const float ChipHeightFactor = 0.060f;        // chip height as fraction of poster height
        private const float ChipMinHeight = 18f;
        private const float ChipMaxHeight = 64f;
        private const float CornerRadiusFactor = 0.30f;       // of chip height
        private const float TextPaddingFactor = 0.45f;        // horizontal padding inside chip as multiple of chip-h

        private static readonly SKColor GenreFill = new SKColor(20, 20, 28, 215);
        private static readonly SKColor GenreText = SKColors.White;
        private static readonly SKColor RatingFill = new SKColor(30, 100, 50, 220);
        private static readonly SKColor RatingHighFill = new SKColor(40, 130, 60, 235);
        private static readonly SKColor RatingText = SKColors.White;

        public byte[] Compose(byte[] sourceBytes, PosterTagSet tags, string contentType)
        {
            if (Disabled)
            {
                return sourceBytes;
            }

            using var input = SKBitmap.Decode(sourceBytes)
                ?? throw new InvalidDataException("SKBitmap.Decode returned null (unsupported or corrupt image bytes)");

            using var surface = SKSurface.Create(new SKImageInfo(input.Width, input.Height, SKColorType.Bgra8888, SKAlphaType.Premul))
                ?? throw new InvalidOperationException($"SKSurface.Create returned null for {input.Width}x{input.Height}");
            var canvas = surface.Canvas;
            canvas.DrawBitmap(input, 0, 0);

            var minDim = Math.Min(input.Width, input.Height);
            var chipHeight = Math.Clamp(input.Height * ChipHeightFactor, ChipMinHeight, ChipMaxHeight);
            var padding = minDim * ChipPaddingFactor;

            var nextBottom = input.Height - padding;

            if (tags.Rating.HasValue)
            {
                var label = tags.Rating.Value.ToString("0.0", CultureInfo.InvariantCulture);
                var fill = tags.Rating.Value >= 7.5f ? RatingHighFill : RatingFill;
                var height = chipHeight;
                var rect = MeasureChip(canvas, label, height, padding, nextBottom, alignLeft: false, posterWidth: input.Width);
                DrawChip(canvas, rect, fill, label, RatingText);
                nextBottom = rect.Top - padding * 0.4f;
            }

            if (!string.IsNullOrEmpty(tags.Genre))
            {
                var label = tags.Genre!.ToUpperInvariant();
                var height = chipHeight;
                var rect = MeasureChip(canvas, label, height, padding, nextBottom, alignLeft: false, posterWidth: input.Width);
                DrawChip(canvas, rect, GenreFill, label, GenreText);
            }

            using var image = surface.Snapshot();
            var format = SelectFormat(contentType);
            var quality = format == SKEncodedImageFormat.Jpeg ? 88 : 92;
            using var data = image.Encode(format, quality)
                ?? throw new InvalidOperationException($"SKImage.Encode returned null for format {format}");
            return data.ToArray();
        }

        private static SKRect MeasureChip(SKCanvas canvas, string label, float height, float padding, float bottom, bool alignLeft, int posterWidth)
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

            float left = alignLeft
                ? padding
                : posterWidth - padding - width;

            float top = bottom - height;
            return new SKRect(left, top, left + width, bottom);
        }

        private static void DrawChip(SKCanvas canvas, SKRect rect, SKColor fill, string label, SKColor textColor)
        {
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
                canvas.DrawText(label, rect.MidX, baselineY, textPaint);
            }
        }

        private static SKEncodedImageFormat SelectFormat(string contentType)
        {
            if (contentType.Contains("png", StringComparison.OrdinalIgnoreCase))
            {
                return SKEncodedImageFormat.Png;
            }
            if (contentType.Contains("webp", StringComparison.OrdinalIgnoreCase))
            {
                return SKEncodedImageFormat.Webp;
            }
            return SKEncodedImageFormat.Jpeg;
        }
    }
}
