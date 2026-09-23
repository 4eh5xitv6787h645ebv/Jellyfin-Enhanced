# Parental filtering

`SeerrParentalFilter` remains the public entry point registered as a singleton.
Its namespace, constructor, `Policy`, `Result`, and TMDB access types are retained
for callers. It resolves the Jellyfin user's policy and coordinates response and
single-title authorization. The collaborators are owned by that singleton, so
moving code does not change cache or concurrency lifetimes.

| File | Responsibility |
| --- | --- |
| `SeerrEndpointClassifier.cs` | Seerr response plans and TMDB passthrough allowlist |
| `SeerrListFilter.cs` | Lists and nested `knownFor`, shared fetch pool, response budget |
| `SeerrResponseReader.cs` | JSON containers, media types, IDs, and cache keys |
| `SeerrParentalDecision.cs` | Combine rating and tag decisions, fail closed on unknown data |
| `SeerrParentalSignature.cs` | User-neutral rating and tag result |
| `SeerrSignatureProvider.cs` | Cache freshness, negative entries, tag upgrades, coalesced lookup, scoring |
| `SeerrParentalMetadataClient.cs` | TMDB lightweight lookups, Seerr detail fallback and URL failover |

To support another Seerr endpoint, classify its response shape and identify its
parent-title gate in `SeerrEndpointClassifier`. Add a public-entry-point regression
scenario under `src/features/seerr/tests/server/parental-filter`. If the response uses a new title
container, add its reader and list handling rather than bypassing policy checks.

Keep these distinctions when changing resolution:

- A missing signature is an unverified title; a signature with no rating is a
  successfully resolved unrated title. They have different policy/cache behavior.
- Missing tag data is unknown, not a verified empty set. Failed tag upgrades must
  not destroy a valid rating-only cache entry.
- Shared network tasks use their own timeout. Cancelling one caller must not
  cancel a fetch another caller uses. Abandoned queued list work is dropped;
  already active fetches can finish and warm the cache.
- Metadata requests omit `X-Api-User` because their results are user-neutral.
  Evaluate the caller's current policy after resolving metadata.
- If no rows change, return the original response bytes. If a paged feed's budget
  expires with pending titles, retain the retry signal instead of treating its
  partial safe page as a complete result.
