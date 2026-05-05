using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.JellyfinEnhanced.Services.PosterTagOverlay
{
    public sealed class PosterTagStartupFilter : IStartupFilter
    {
        private readonly Logger _logger;

        public PosterTagStartupFilter(Logger logger)
        {
            _logger = logger;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                _logger.Info("[PosterTags] Installing image overlay middleware");
                app.UseMiddleware<PosterTagMiddleware>();
                next(app);
            };
        }
    }
}
