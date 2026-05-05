using System;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagRenderer
    {
        private readonly Logger _logger;
        private readonly ILibraryManager _libraryManager;
        private readonly PosterTagComposer _composer;
        private readonly PosterTagCache _cache;

        public PosterTagRenderer(Logger logger, ILibraryManager libraryManager, PosterTagComposer composer, PosterTagCache cache)
        {
            _logger = logger;
            _libraryManager = libraryManager;
            _composer = composer;
            _cache = cache;
        }

        public Task<byte[]> RenderAsync(Guid itemId, byte[] sourceBytes, string contentType, PluginConfiguration config)
        {
            var item = _libraryManager.GetItemById(itemId);
            if (item == null)
            {
                return Task.FromResult(sourceBytes);
            }

            var tags = ResolveTags(item, config);
            if (tags.IsEmpty)
            {
                return Task.FromResult(sourceBytes);
            }

            var cacheKey = _cache.BuildKey(itemId, sourceBytes, tags, config.PosterTagFingerprint);
            var cached = _cache.TryGet(cacheKey);
            if (cached != null)
            {
                return Task.FromResult(cached);
            }

            byte[] composed;
            try
            {
                composed = _composer.Compose(sourceBytes, tags, contentType);
            }
            catch (Exception ex)
            {
                _logger.Warning($"[PosterTags] Skia compose failed for {itemId}: {ex.Message}");
                return Task.FromResult(sourceBytes);
            }

            _cache.Put(cacheKey, composed);
            return Task.FromResult(composed);
        }

        private static PosterTagSet ResolveTags(BaseItem item, PluginConfiguration config)
        {
            var genre = config.PosterTagGenre && item.Genres != null && item.Genres.Length > 0
                ? item.Genres[0]
                : null;

            float? rating = null;
            if (config.PosterTagRating && item.CommunityRating.HasValue)
            {
                rating = item.CommunityRating.Value;
            }

            return new PosterTagSet(genre, rating);
        }
    }

    public readonly struct PosterTagSet
    {
        public string? Genre { get; }
        public float? Rating { get; }

        public PosterTagSet(string? genre, float? rating)
        {
            Genre = genre;
            Rating = rating;
        }

        public bool IsEmpty => string.IsNullOrEmpty(Genre) && !Rating.HasValue;
    }
}
