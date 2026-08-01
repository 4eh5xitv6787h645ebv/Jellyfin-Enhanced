# Seerr parental controls

Jellyfin Enhanced enforces Jellyfin parental policy on the server before Seerr
or TMDB data reaches the browser. Browser filtering is only presentation and is
not part of the security boundary.

The caller is resolved from the authenticated `Jellyfin-UserId` claim. A user
ID in a query string, request body, or arbitrary client header is never used to
select a parental policy. The existing Jellyfin-to-Seerr user mapping and
`X-Api-User` forwarding remain unchanged.

## Settings

The controls are in **Dashboard → Plugins → Jellyfin Enhanced → Seerr →
Parental Controls**.

| Setting | Default | Effect |
| --- | --- | --- |
| `SeerrRespectParentalRatings` | Enabled | Master gate for this feature. Applies the authenticated Jellyfin user's maximum rating score and sub-score, regional certification mapping, and `BlockUnratedItems` policy. Disabling it bypasses all Seerr/TMDB parental filtering, including tag checks. |
| `SeerrRespectBlockedTags` | Enabled | When the master gate is enabled, also applies Jellyfin blocked-tag and allowed-tag policy to the external metadata available for a title. |
| `SeerrParentalRatingCacheTtlMinutes` | 1440 | Caches title certification and tag metadata. The configuration page accepts 1–10080 minutes. Saving plugin configuration invalidates the cache immediately. |

Administrators follow Jellyfin's normal parental-control bypass. A non-admin
with no applicable rating, unrated-item, blocked-tag, or allowed-tag restriction
receives the normal response. Disabling `SeerrRespectParentalRatings` leaves
Seerr and TMDB responses unchanged regardless of the tag setting.

Policy is read from the Jellyfin user for each request, so changing a user's
restriction does not require rebuilding or restarting the plugin.

### Tag matching limits

Seerr titles do not have Jellyfin library-item tags. The plugin therefore uses
the external title metadata that can be resolved from Seerr/TMDB:

- blocked tags match keyword names and genre names;
- allowed tags match keyword names and are a strict allow-list when the
  Jellyfin user has any;
- blocked tags win over allowed tags;
- both policy tags and title metadata are normalized with Jellyfin's
  `GetCleanValue`, including case, diacritic, punctuation, and whitespace
  normalization, before exact comparison;
- wildcards, tag hierarchy, aliases, and Jellyfin-only local tags are not
  available for titles that are not yet in the Jellyfin library.

People and other non-title entities are retained merely for lacking movie or TV
certification. Movie or TV entries embedded in a person's `knownFor`, cast, or
crew data are still evaluated.

## Protected surfaces

The policy is applied to every plugin route that can expose a Seerr or TMDB
movie or television title, or create or approve access to one.

| Surface | Behaviour for a restricted caller |
| --- | --- |
| Lists | Filters search; movie and TV discovery; trending and upcoming rows; genre, network, studio, tag, and keyword discovery; watchlists; collection parts; person credits and `knownFor`; similar and recommended titles; Seerr request lists; and the Requests page's `/arr/requests` data. |
| Details | Returns `403` for a blocked movie, series, season, ratings response, or other title sub-resource. Similar and recommendation routes gate their parent title and also filter their returned rows. |
| Raw TMDB proxy | Gates movie and TV details and their sub-resources, including reviews, watch providers, ratings, releases, credits, seasons, and episodes. Ambiguous paths, dot-segment paths, title-enumerating searches, and compound `append_to_response` requests are denied for restricted callers. Metadata-only endpoints required by the UI remain available. |
| Mutations | Validates a movie/TV type and positive TMDB ID before forwarding a request. This includes season requests, request approval, and automatic movie/season requests. A blocked or unverifiable title is not forwarded. Declining a request remains possible because it cannot grant access. |

Seerr account, quota, status, genre metadata, service configuration, user-import,
issue creation, and administrator maintenance routes do not create title access
and are not removed by the mutation gate. Title-bearing issue list and detail
responses are still filtered, and Seerr's existing issue permissions remain in
force.

## Failure and cache behaviour

For restricted users, title details, title sub-resources, unsafe TMDB paths, and
mutations fail closed when the title cannot be classified or its policy decision
cannot be resolved authoritatively. They return a controlled authorization or
upstream-availability response rather than forwarding the operation or causing
an unhandled `500`. Administrators and callers for whom no parental gate applies
continue through the normal upstream error path.

The shared proxy cache stores verified raw upstream JSON before any user-specific
filter is applied. Every cache hit is filtered afresh for the current caller.
Filtered JSON is never written back to the shared cache, and the cached JSON is
not mutated in place. Certification metadata is title-specific rather than
user-specific; its cache key includes the title, media type, region, and source
configuration generation. Duplicate lookups are coalesced and list fan-out is
bounded.

Filtering preserves the response object shape, surviving row order, current
page, and unrelated fields. A restricted title list is therefore an ordered
subset of the corresponding unrestricted list. Because the plugin evaluates the
returned page rather than crawling the entire upstream result set, upstream
`totalResults`, `totalPages`, and `pageInfo` totals are preserved as upper
bounds. A `jellyfinEnhancedPagination` marker makes that contract explicit when
a page is filtered. The page is not silently filled with rows from a later page.
Nested arrays are adjusted without removing their non-title parent.

## Setup

1. Configure and enable Seerr in Jellyfin Enhanced, including its URL and API
   key. Configure the TMDB key and default region if TMDB-backed features are in
   use.
2. Enable **Respect Jellyfin parental controls for Seerr and TMDB results** and,
   if wanted, **Respect Jellyfin blocked and allowed tags**. Save the plugin
   configuration.
3. In Jellyfin's user administration, set each restricted user's maximum
   parental rating, unrated-item policy, blocked tags, and allowed tags.
4. Test with an administrator, an unrestricted non-admin, and a restricted
   non-admin. Use authenticated plugin API responses as well as the UI.
5. After changing a policy, repeat the same request. Previously blocked titles
   should become visible as soon as the restriction is removed.

## Standalone acceptance verifier

`tools/verify-seerr-parental-controls.mjs` uses only Node's built-in APIs. It has
no npm dependency and does not require a JavaScript or TypeScript build pipeline.
It never accepts a caller-supplied Jellyfin user ID; each token is sent using the
standard Jellyfin authentication headers.

First validate the verifier without making network requests:

```bash
node --check tools/verify-seerr-parental-controls.mjs
node tools/verify-seerr-parental-controls.mjs --check
```

For a live run, supply generated test credentials and title IDs through the
environment. Do not put them in shell history, source files, or Git:

```bash
export JE581_BASE_URL='<jellyfin-base-url>'
export JE581_ADMIN_TOKEN='<generated-admin-test-token>'
export JE581_UNRESTRICTED_TOKEN='<generated-unrestricted-test-token>'
export JE581_RESTRICTED_TOKEN='<generated-restricted-test-token>'
export JE581_LIST_PATH='/JellyfinEnhanced/jellyseerr/search?query=<encoded-test-query>&page=1'
export JE581_BLOCKED_MEDIA_TYPE='movie'
export JE581_BLOCKED_TMDB_ID='<blocked-test-title-id>'
export JE581_ALLOWED_MEDIA_TYPE='movie'
export JE581_ALLOWED_TMDB_ID='<allowed-test-title-id>'

node tools/verify-seerr-parental-controls.mjs --live
```

Set `JE581_CHECK_TMDB=1` to include raw TMDB detail checks. The blocked-request
POST is deliberately skipped unless both `JE581_CHECK_BLOCKED_REQUEST=1` and
`JE581_ALLOW_MUTATION=1` are set: if the server is vulnerable, that test could
reach Seerr and create a real request. Set `JE581_SEERR_BASE_URL` and
`JE581_SEERR_API_KEY` as well to snapshot the isolated Seerr request list before
and after the POST, proving that the `403` occurred before any upstream
mutation. The verifier never prints the API key.

To test live policy removal, first run `--live`, remove the same restricted
user's policy in Jellyfin without restarting the server, and then run:

```bash
export JE581_RESTRICTION_REMOVED_TOKEN='<same-user-token-after-policy-removal>'
node tools/verify-seerr-parental-controls.mjs --restriction-removed
```

Optional checks always print `SKIP` with the missing opt-in or environment
variable. A skip is not reported as a pass.
