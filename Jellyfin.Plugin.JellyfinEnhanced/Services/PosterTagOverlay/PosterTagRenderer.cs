using System;
using System.Threading.Tasks;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using MediaBrowser.Controller.Library;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagRenderer
    {
        private readonly Logger _logger;
        private readonly ILibraryManager _libraryManager;
        private readonly PosterTagComposer _composer;
        private readonly PosterTagCache _cache;
        private readonly PosterTagResolver _resolver;

        public PosterTagRenderer(
            Logger logger,
            ILibraryManager libraryManager,
            PosterTagComposer composer,
            PosterTagCache cache,
            PosterTagResolver resolver)
        {
            _logger = logger;
            _libraryManager = libraryManager;
            _composer = composer;
            _cache = cache;
            _resolver = resolver;
        }

        public Task<byte[]> RenderAsync(
            Guid itemId,
            byte[] sourceBytes,
            string contentType,
            PluginConfiguration adminConfig,
            UserSettings? userSettings,
            Guid? userId)
        {
            // Skia disabled (probe failed at startup) → bypass everything; do
            // NOT spend cache cycles caching unmodified bytes under our key.
            if (PosterTagComposer.Disabled)
            {
                return Task.FromResult(sourceBytes);
            }

            var item = _libraryManager.GetItemById(itemId);
            if (item == null)
            {
                return Task.FromResult(sourceBytes);
            }

            var settings = EffectivePosterTagSettings.Compose(adminConfig, userSettings);
            var tags = _resolver.Resolve(item, settings);
            if (tags.IsEmpty)
            {
                return Task.FromResult(sourceBytes);
            }

            var cacheKey = _cache.BuildKey(itemId, sourceBytes, tags, settings.Fingerprint, userId);
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
                _logger.Warning($"[PosterTags] Skia compose failed for {itemId} ({ex.GetType().Name}): {ex.Message}");
                return Task.FromResult(sourceBytes);
            }

            _cache.Put(cacheKey, composed);
            return Task.FromResult(composed);
        }
    }
}
