using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Inserts JE's request-time middleware at the front of Jellyfin's pipeline.
    // Replaces the on-disk index.html mutation and the File Transformation
    // dependency with content rewriting at request time so install / update /
    // config-change cycles don't require a manual hard refresh.
    public sealed class JeStartupFilter : IStartupFilter
    {
        private readonly ILogger<JeStartupFilter> _logger;

        public JeStartupFilter(ILogger<JeStartupFilter> logger)
        {
            _logger = logger;
        }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                _logger.LogInformation("Jellyfin Enhanced web subsystem installed.");
                app.UseMiddleware<NoCacheHeaderMiddleware>();
                app.UseMiddleware<HtmlInjectionMiddleware>();
                app.UseMiddleware<BrandingAssetMiddleware>();
                next(app);
            };
        }
    }
}
