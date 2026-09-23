# Seerr parental filtering regression checks

Run from the repository root:

```sh
dotnet run --project src/features/seerr/tests/server/parental-filter/SeerrParentalFilter.Tests.csproj
```

This package-free .NET 10 console suite links production code and exercises the
public `SeerrParentalFilter` entry points. `HostStubs.cs` substitutes only the
Jellyfin user/configuration/localization interfaces and plugin singleton/logger;
HTTP responses come from a controlled `HttpMessageHandler`. No live service,
credentials, Docker container, or Jellyfin installation is needed.

The scenarios cover TMDB passthrough classification; unrestricted short circuits;
country and subscore decisions; unchanged JSON bytes; list, request, watchlist,
collection and filmography shapes; nested `knownFor`; tag verification and failed
upgrades; positive/negative caches; request coalescing and cancellation; the shared
16-fetch list pool; fallback authentication; and parent-title gates. Assertions
use observable output and outbound requests rather than private implementation.
The same scenarios were run against the original monolithic filter during the
refactor to establish that these behaviors are preserved.

This harness does not replace compiling both supported Jellyfin targets. Host
stubs do not prove binary/API compatibility with Jellyfin. Real provider behavior,
12-second budget exhaustion, and multi-hour cache expiry are not exercised here.
