using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.JellyfinEnhanced.Web
{
    // Inserts WebInjectionMiddleware at the FRONT of the ASP.NET Core request pipeline.
    //
    // ASP.NET Core's generic host resolves every IStartupFilter from the application's DI
    // container and applies them around Jellyfin's own Startup.Configure. Because the plugin
    // registers this filter in IPluginServiceRegistrator — which runs while the SAME service
    // collection is still open (verified on 10.11: Jellyfin.Server/Program.cs builds the host
    // with appHost.Init inside ConfigureServices) — the filter is picked up automatically.
    // Jellyfin itself contains zero references to IStartupFilter; this is pure framework
    // behaviour.
    //
    // Filters registered first wrap outermost, so the middleware added here (via
    // app.UseMiddleware BEFORE calling next) runs ahead of Jellyfin's UseResponseCompression
    // and UseStaticFiles, letting it buffer and rewrite the served /web/index.html without
    // ever touching the file on disk.
    public sealed class WebInjectionStartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return app =>
            {
                // Visible breadcrumb that the injection path is wired up at all — without it,
                // a future hosting change that drops plugin IStartupFilters would leave the
                // plugin dead with completely clean logs.
                app.ApplicationServices
                    .GetService<ILoggerFactory>()?
                    .CreateLogger<WebInjectionStartupFilter>()
                    .LogInformation("Jellyfin Enhanced: request-time web injection middleware registered.");

                app.UseMiddleware<WebInjectionMiddleware>();
                next(app);
            };
        }
    }
}
