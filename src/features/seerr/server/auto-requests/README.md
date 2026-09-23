# Automatic movie and season requests

`AutoMovieRequestMonitor` and `AutoSeasonRequestMonitor` in `../../events` subscribe to Jellyfin playback events. The public monitor and service types retain the `Services` namespace and constructor signatures used by plugin startup.

The services coordinate eligibility and request reservations. Their collaborators use the internal `Services.Requests` namespace:

| Component | Responsibility |
| --- | --- |
| `AutoMovieRequestService` | Validate movie playback, reserve each user's next movie, submit and release failed reservations |
| `AutoSeasonRequestService` | Check episode thresholds and watched state, reserve the next season globally, submit and release failed reservations |
| `MovieCollectionClient` | Read TMDB collection membership and choose the next eligible Seerr collection movie |
| `MovieQualityProfileResolver` | Resolve default, original, and custom quality settings, including 4K fallback |
| `SeasonDetailsClient` | Cache series details for episode counts and fetch fresh season availability/request state |
| `AutoRequestClient` | Resolve Jellyfin users to Seerr users, cache successful mappings, submit requests with URL failover |
| `AutoRequestUrls` | Parse the existing newline/comma-separated Seerr URL configuration |

Keep eligibility rules in the services, API parsing beside its HTTP lookup, and per-feature payload construction beside submission in the service. Clients read the current plugin configuration on each operation, so they must not capture a configuration snapshot in their constructors.

Cache boundaries are intentional. Each automatic request service has its own user mapping cache; the movie reservation cache is per user and movie, while season reservations are shared across users. Movie reservations expire at one hour; season reservations and monitor event suppression expire after one hour. Failed submissions release reservations. Clearing movie requests does not clear user mappings. Season counts can use the configured response cache, but availability always bypasses it. Do not unify these caches without separately reviewing the behavioral change.

Run `dotnet run --project src/features/seerr/tests/server/automatic-requests/Requests.Contracts.csproj` from the repository root. The suite calls the public services with controlled HTTP responses and a small Jellyfin host substitute. It covers payloads and user headers, URL failover, cache boundaries, failed-request retries, concurrent movie reservations, collection eligibility, quality profiles, episode thresholds, and fresh season availability checks. It does not contact live TMDB or Seerr instances or exercise host event subscription.
