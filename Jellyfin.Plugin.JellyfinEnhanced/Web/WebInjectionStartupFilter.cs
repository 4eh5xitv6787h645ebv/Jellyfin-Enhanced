using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    /// <summary>
    /// Inserts <see cref="WebInjectionMiddleware"/> at the FRONT of the ASP.NET Core request pipeline.
    ///
    /// ASP.NET Core's generic host resolves every <see cref="IStartupFilter"/> from the application's
    /// DI container and applies them around Jellyfin's own <c>Startup.Configure</c>. Because the plugin
    /// registers this filter in <c>IPluginServiceRegistrator</c> — which runs inside
    /// <c>Host.CreateDefaultBuilder().ConfigureServices(appHost.Init)</c>, i.e. while the SAME service
    /// collection is still open (verified on 10.11 at Jellyfin.Server/Program.cs:168-170 and
    /// Emby.Server.Implementations/ApplicationHost.cs:462) — the filter is picked up automatically.
    /// Jellyfin itself contains zero references to IStartupFilter; this is pure framework behaviour.
    ///
    /// Filters registered first wrap outermost, so the middleware added here (via <c>app.UseMiddleware</c>
    /// BEFORE calling <c>next</c>) runs ahead of Jellyfin's <c>UseResponseCompression</c> (Startup.cs:167)
    /// and <c>UseStaticFiles</c> (Startup.cs:191/208), letting it buffer and rewrite the served
    /// <c>/web/index.html</c> without ever touching the file on disk.
    /// </summary>
    public sealed class WebInjectionStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                app.UseMiddleware<WebInjectionMiddleware>();
                next(app);
            };
        }
    }
}
