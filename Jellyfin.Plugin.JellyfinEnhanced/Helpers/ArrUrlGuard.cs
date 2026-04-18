using System;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;

namespace Jellyfin.Plugin.JellyfinEnhanced.Helpers
{
    /// <summary>
    /// Shared URL guard for outbound requests to admin-supplied Sonarr/Radarr/Seerr URLs.
    /// Blocks non-HTTP schemes, known cloud metadata DNS names, loopback/any IPs (full ranges,
    /// not individual literals), link-local 169.254.0.0/16 (covers AWS/OCI/Azure/Alibaba metadata
    /// and their IPv4-mapped IPv6 equivalents), and IPv6 link-local. Private/LAN IPs (10/8,
    /// 172.16/12, 192.168/16, fc00::/7) are intentionally allowed because arr services run on
    /// local networks.
    ///
    /// All callers must also be admin-gated. For defense-in-depth against DNS rebinding and
    /// redirect-follow TOCTOU, use the <c>arr-safe</c> named HttpClient which re-validates
    /// the resolved IP in its ConnectCallback and disables AllowAutoRedirect.
    /// </summary>
    public static class ArrUrlGuard
    {
        private static readonly HashSet<string> _blockedHosts = new(StringComparer.OrdinalIgnoreCase)
        {
            "metadata.google.internal",
            "metadata.goog"
        };

        // Explicit metadata IPs kept as a fallback even though 169.254.0.0/16 now covers the
        // link-local ones. Intentional overlap — cheap, and survives if someone later narrows
        // the CIDR check.
        private static readonly HashSet<IPAddress> _blockedMetadataIps = new()
        {
            IPAddress.Parse("169.254.169.254"),  // AWS / OCI / Azure / GCP
            IPAddress.Parse("100.100.100.200"),  // Alibaba (CGNAT — not caught by CIDR since CGNAT is legit LAN elsewhere)
            IPAddress.Parse("169.254.170.2"),    // ECS task metadata
            IPAddress.Parse("fd00:ec2::254")     // EC2 IPv6
        };

        /// <summary>
        /// Canonicalize an IPv4-mapped IPv6 address (e.g., <c>::ffff:127.0.0.1</c>) to its
        /// IPv4 form so blocklist comparisons and CIDR checks work uniformly. Returns the
        /// original address unchanged for all other cases.
        /// </summary>
        private static IPAddress Canonicalize(IPAddress addr)
        {
            if (addr.AddressFamily == AddressFamily.InterNetworkV6 && addr.IsIPv4MappedToIPv6)
                return addr.MapToIPv4();
            return addr;
        }

        /// <summary>
        /// Defense-in-depth check: is this resolved IP in a blocked range? Exposed for use
        /// from HttpClient <c>ConnectCallback</c> so DNS rebinding between guard validation
        /// and socket connect cannot slip past.
        /// </summary>
        public static bool IsBlockedIp(IPAddress addr)
        {
            addr = Canonicalize(addr);

            if (IPAddress.IsLoopback(addr)) return true;
            if (addr.Equals(IPAddress.Any) || addr.Equals(IPAddress.IPv6Any)) return true;
            if (_blockedMetadataIps.Contains(addr)) return true;

            var bytes = addr.GetAddressBytes();

            if (addr.AddressFamily == AddressFamily.InterNetwork)
            {
                if (bytes[0] == 0) return true;                            // 0.0.0.0/8
                if (bytes[0] == 169 && bytes[1] == 254) return true;       // 169.254/16 link-local
            }
            else if (addr.AddressFamily == AddressFamily.InterNetworkV6)
            {
                if (addr.IsIPv6LinkLocal) return true;                     // fe80::/10
            }

            return false;
        }

        /// <summary>
        /// Runs scheme + blocked-host + IP-literal checks synchronously. Returns a definitive
        /// <c>false</c> for rejected cases, <c>true</c> for an allowed literal IP, or <c>null</c>
        /// when the host needs DNS resolution to decide.
        /// </summary>
        private static bool? TrySyncChecks(string? url, out string host)
        {
            host = string.Empty;
            if (string.IsNullOrWhiteSpace(url)) return false;
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;

            host = uri.Host.TrimEnd('.').ToLowerInvariant();
            if (_blockedHosts.Contains(host)) return false;

            if (IPAddress.TryParse(host, out var literalIp))
                return !IsBlockedIp(literalIp);

            return null;
        }

        /// <summary>
        /// Synchronous guard for non-request-path callers (config validation, scheduled tasks).
        /// Fails closed on DNS errors — if we cannot confirm the hostname resolves to a safe
        /// address, we refuse rather than let the subsequent HTTP call race against a rebinding
        /// response.
        /// </summary>
        public static bool IsAllowedUrl(string? url)
        {
            var sync = TrySyncChecks(url, out var host);
            if (sync.HasValue) return sync.Value;

            try
            {
                var addresses = Dns.GetHostAddresses(host);
                foreach (var addr in addresses)
                {
                    if (IsBlockedIp(addr)) return false;
                }
            }
            catch (SocketException)
            {
                // Fail closed. DNS rebinding relies on an unverifiable / unstable name; refusing
                // is safer than letting HttpClient perform a second independent resolution.
                return false;
            }
            catch (ArgumentException)
            {
                return false;
            }

            return true;
        }

        /// <summary>
        /// Async variant for request-path callers. Fails closed on DNS errors, same rationale
        /// as <see cref="IsAllowedUrl"/>.
        /// </summary>
        public static async Task<bool> IsAllowedUrlAsync(string? url, CancellationToken ct = default)
        {
            var sync = TrySyncChecks(url, out var host);
            if (sync.HasValue) return sync.Value;

            try
            {
                var addresses = await Dns.GetHostAddressesAsync(host, ct).ConfigureAwait(false);
                foreach (var addr in addresses)
                {
                    if (IsBlockedIp(addr)) return false;
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (SocketException)
            {
                return false;
            }
            catch (ArgumentException)
            {
                return false;
            }

            return true;
        }
    }
}
