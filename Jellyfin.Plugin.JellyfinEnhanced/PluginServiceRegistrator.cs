using System;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using Jellyfin.Plugin.JellyfinEnhanced.Configuration;
using Jellyfin.Plugin.JellyfinEnhanced.Helpers;
using Jellyfin.Plugin.JellyfinEnhanced.Services;
using Jellyfin.Plugin.JellyfinEnhanced.ScheduledTasks;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using MediaBrowser.Controller;

namespace Jellyfin.Plugin.JellyfinEnhanced
{
    public class PluginServiceRegistrator : IPluginServiceRegistrator
    {
        /// <summary>
        /// Name of the SSRF-hardened HttpClient. Resolve with
        /// <c>IHttpClientFactory.CreateClient(ArrSafeHttpClientName)</c> for any outbound call to
        /// admin-supplied URLs (Sonarr/Radarr/Seerr/validation probes). The primary handler
        /// disables automatic redirect following and re-validates the resolved IP in its
        /// ConnectCallback — closes the redirect-follow + DNS-rebinding TOCTOU gap that
        /// <see cref="ArrUrlGuard"/> alone cannot cover.
        /// </summary>
        public const string ArrSafeHttpClientName = "arr-safe";

        public void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost)
        {
            serviceCollection.AddSingleton<StartupService>();
            serviceCollection.AddHttpClient();
            serviceCollection.AddHttpClient(ArrSafeHttpClientName)
                .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
                {
                    AllowAutoRedirect = false,
                    ConnectCallback = ArrSafeConnectCallback
                });
            serviceCollection.AddSingleton<Logger>();
            serviceCollection.AddSingleton<UserConfigurationManager>();
            serviceCollection.AddSingleton<AutoSeasonRequestService>();
            serviceCollection.AddSingleton<AutoSeasonRequestMonitor>();
            serviceCollection.AddSingleton<AutoMovieRequestService>();
            serviceCollection.AddSingleton<AutoMovieRequestMonitor>();
            serviceCollection.AddSingleton<WatchlistMonitor>();
            serviceCollection.AddSingleton<TagCacheService>();
            serviceCollection.AddSingleton<TagCacheMonitor>();
            serviceCollection.AddTransient<ArrTagsSyncTask>();
            serviceCollection.AddTransient<BuildTagCacheTask>();
            serviceCollection.AddTransient<JellyseerrWatchlistSyncTask>();
            serviceCollection.AddTransient<JellyseerrUserImportTask>();
            serviceCollection.AddTransient<ClearTranslationCacheTask>();
        }

        private static async System.Threading.Tasks.ValueTask<Stream> ArrSafeConnectCallback(
            SocketsHttpConnectionContext context,
            System.Threading.CancellationToken ct)
        {
            var host = context.DnsEndPoint.Host;
            IPAddress[] addresses;

            // Accept pre-resolved literals quickly (guard has already validated them).
            if (IPAddress.TryParse(host, out var literal))
            {
                addresses = new[] { literal };
            }
            else
            {
                try
                {
                    addresses = await Dns.GetHostAddressesAsync(host, ct).ConfigureAwait(false);
                }
                catch (SocketException ex)
                {
                    throw new IOException($"SSRF guard: DNS resolution failed for {host}: {ex.Message}", ex);
                }
            }

            if (addresses.Length == 0)
                throw new IOException($"SSRF guard: no addresses for {host}");

            foreach (var addr in addresses)
            {
                if (ArrUrlGuard.IsBlockedIp(addr))
                    throw new IOException($"SSRF guard: blocked outbound connection to {addr}");
            }

            var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
            try
            {
                await socket.ConnectAsync(addresses, context.DnsEndPoint.Port, ct).ConfigureAwait(false);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch
            {
                socket.Dispose();
                throw;
            }
        }
    }
}
