# Lane L-G: harden three safety gates (review M1, M2, M4) + M3 audit

Branch `restructure/gates-hardening`, from `2abd5e3d` (step 8 merged). Test tooling only: no plugin or client code
changed. Existing snapshots (`route-auth`, `auth-helper-calls`, `service-registrations`, `feature-dependencies.json`)
are byte-identical to `2abd5e3d`; the new expected files are additions.

| SHA | Commit |
|---|---|
| `73d81f83` | test(backend): harden Gate B to transitive auth reads (review M1) |
| `adc909af` | test(backend): ratchet Shared/Infrastructure references into Features (review M2) |
| `46a6de9a` | test(backend): snapshot factory registrations and HttpClient handlers (review M4) |
| (this file) | docs(restructure): lane L-G log |

## Base anchoring (M1, M4)

`tests/backend/Architecture/BaseAnchoredSnapshots.cs` lets a test analyse any build of the plugin DLL in place of
the plugin the test project references:

- `JE_ARCH_PLUGIN_DLL=<path to Jellyfin.Plugin.JellyfinEnhanced.dll>`: the DLL loads in its own
  `AssemblyLoadContext`. Only the plugin assembly comes from that path. Framework, Jellyfin and NuGet dependencies fall
  back to the default context, so `ControllerBase`, `IServiceCollection` and the rest are the same types the tests use.
- `JE_ARCH_WRITE_BASE=1`: writes the `*.base.json` files instead of comparing them. This is refused unless
  `JE_ARCH_PLUGIN_DLL` is set and `JE_ARCH_BASE_LABEL` starts with `restructure-base`.
- The file's `"anchor"` line records that label and is not compared. Compare mode requires the line to be present.
  `JE_UPDATE_SNAPSHOTS` never touches these files.

What was done:

1. `git worktree add --detach /var/lib/jebench/projects/je-rs-gh-base restructure-base` (`837635b9`), with
   `node_modules` symlinked from this clone. `package.json` and `package-lock.json` are identical, and the build's
   `client-build.mjs --check` passed.
2. `nice dotnet build Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12 -maxcpucount:8`.
3. Ran the new tests with `JE_ARCH_PLUGIN_DLL=<base>/Jellyfin.Plugin.JellyfinEnhanced/bin/Release/net10.0/Jellyfin.Plugin.JellyfinEnhanced.dll JE_ARCH_WRITE_BASE=1 JE_ARCH_BASE_LABEL="restructure-base 837635b9 (Jellyfin.Plugin.JellyfinEnhanced.dll, Release, jf12)"`
   and `--filter "FullyQualifiedName~AuthReadClosureSnapshotTests|FullyQualifiedName~ServiceFactorySnapshotTests"`.
   This wrote `auth-reads-by-route.base.json` and `service-factories.base.json`.
4. Ran the same tests without the env vars, which compares the current tree: **both match base exactly**.
5. Confirmed the subject really was the base DLL. Its test output lists the controllers as `CatchUpController`,
   `JellyfinEnhancedController`; the current tree lists 13 `Je*Controller` types plus `JellyfinEnhancedController`.
   `RoutesMatchGateA` also passes against base: base's reflected routes equal Gate A's 202 endpoints.
6. Removed the worktree at the end (`git worktree remove`).

## M1: Gate B transitive (`AuthReadClosureSnapshotTests`, `auth-reads-by-route.base.json`)

- **Closure:** follows the full call closure from each routed action, with a visited set, so cycles and shared
  helpers terminate. It descends into:
  - the async/iterator `MoveNext` (via `StateMachineAttribute`);
  - any plugin method on a compiler-generated type, or with a compiler-generated name (lambdas, closures, local
    functions);
  - any member, of any visibility, of the action's controller type or a plugin base class of it (`JeControllerBase`);
  - any static plugin method.

  Instance methods of services are not followed; `ServicesDoNotReadUserTests` covers those.
- **Leaves (the counted reads):** `ControllerBase.User`, `HttpContext.User`, `IsAdminUser`, `GetCurrentUserId` and
  `AuthorizeUser*` (on any plugin `ControllerBase` type), every `UserHelper.*`, and `RequestIdentityService.Resolve`.
- **Methods are identified by metadata token** (open generic definitions), not by name. This means overloads and
  closure naming cannot merge two methods into one.
- **Key:** the route, `"VERB template"`, built from `[Route]` and `[Http*]` with MVC's
  `AttributeRouteModel.CombineTemplates`. The key does not depend on the controller, file or action name, and
  `RoutesMatchGateA` checks the key set equals Gate A's.
- **Value:** read sites per kind, summed over the distinct methods of the closure.
- **Result: base == current.** 202 routes; 169 have reads; 546 read sites (IsAdminUser 306, User 107,
  UserHelper.GetCurrentUserId 101, AuthorizeUserConfigAccess 25, AuthorizeUserAccess 5, GetCurrentUserId 2).
  No differences, so there was nothing to investigate.
- **Where it sees more than the one-level gate.** These four routes, all identical at base and current:
  - `GET JellyfinEnhanced/public-config` (**anonymous**): `{"User":1}` → `{"User":3,"UserHelper.GetCurrentUserId":1}`.
    These are the `BuildPublicConfig → VisibleItemLooks` reads from the review.
  - `GET JellyfinEnhanced/bootstrap`: `{"IsAdminUser":2,"User":2,"UserHelper.GetCurrentUserId":1}` → `{"IsAdminUser":2,"User":4,"UserHelper.GetCurrentUserId":2}`
  - `GET JellyfinEnhanced/jellyseerr/discover/tv/studio/{studioId}`: `{"User":1,"UserHelper.GetCurrentUserId":1}` → `{"IsAdminUser":5,"User":2,"UserHelper.GetCurrentUserId":2}`
  - `GET JellyfinEnhanced/user-settings/{userId}/settings.json`: `{"AuthorizeUserConfigAccess":1}` → `{"AuthorizeUserConfigAccess":1,"IsAdminUser":1}`
- **Mutation check (reverted):** deleted the `User?.Identity?.IsAuthenticated` check in `VisibleItemLooks` and
  rebuilt. The old `AuthHelperCallsPerActionMatchTheSnapshot` still passed; the new test failed on `public-config`.

## M4: concrete factories (`ServiceFactorySnapshotTests`, `service-factories.base.json`)

The snapshot is keyed by service identity (the namespace-free service type) and by HttpClient name. It contains:

- **`factories`:** per service type, the sorted `<lifetime> <delegate>` of each factory registration.
- **`options`:** per options type, every `Configure`/`PostConfigure` instance as `<name> <type> <delegate>`. This
  includes the HttpClient builder configuration and `Configure<MvcOptions>`.
- **`httpClients`:** per name (`""`, `JellyfinEnhanced.Maintainerr`, `JellyfinEnhancedSeerr`):
  - the `HttpClientFactoryOptions`: handler lifetime, `SuppressHandlerScope`, and the handler-builder and client
    actions with their count and targets;
  - what `IHttpMessageHandlerFactory` and `IHttpClientFactory` actually build: the handler chain (for example
    `LifetimeTracking → LoggingScope → SeerrCsrfHandler → Logging → HttpClientHandler`);
  - every public setting of the primary handler (AllowAutoRedirect, AutomaticDecompression, UseCookies,
    MaxConnectionsPerServer, MaxAutomaticRedirections, the proxy and certificate settings and the rest), plus its
    underlying `SocketsHttpHandler`'s settings (ConnectTimeout, PooledConnectionLifetime and IdleTimeout,
    ResponseDrainTimeout, KeepAlive*);
  - the client's settings (Timeout, BaseAddress, buffer size, version policy, default headers).

How delegates are described:

- **Framework delegates:** `DeclaringType.Method` with the delegates and simple values each one captured, recursively.
  This reaches the user lambda inside `ConfigurePrimaryHttpMessageHandler`.
- **Plugin lambdas:** written as `lambda{…}`, the members their IL references, in order. For example the hosted
  service factory is `lambda{ServiceProviderServiceExtensions.GetRequiredService<NativeStatusRefreshService>}`.
- **Why plugin lambdas are not written by name (an analysis artefact, fixed):** a compiler-generated lambda name
  encodes its enclosing method and an ordinal. At base this lambda is `PluginServiceRegistrator+<>c.<RegisterServices>b__0_N`;
  today it is `MediaTagsServiceRegistration+<>c.<AddJeMediaTags>b__0_0`, because registrations are grouped by
  feature. Recording that name would make the expected file differ for a pure regrouping.
- `SeerrClientKeepsRedirectsAndCookiesOff` states the reason for the gate in code.
- **Second artefact, found by the first `be` run and fixed in `46a6de9a` (amended before the push):** T runs with
  `--collect:"XPlat Code Coverage"`. Coverlet rewrites the plugin IL and inserts `<assembly>_<guid>.RecordHit` calls,
  which then showed up inside each `lambda{…}`. The listing now skips coverlet's tracker type. All 16 Architecture
  tests pass with and without coverage, and regenerating from base gives a byte-identical file. M1 and M2 were not
  affected: M1 counts only auth reads, and the tracker is not a `Features.*` type.

**Result: base == current.** No differences.

**Mutation check (reverted):** added `AutomaticDecompression = GZip` to the Seerr handler. The old registration
snapshot still passed; the new test failed.

## M2: Shared/Infrastructure → Features ratchet (`FeatureBoundaryTests.SharedAndInfrastructureFeatureReferencesDoNotGrow`)

- **Scope:** every top-level `Shared.*` and `Infrastructure.*` type, with nested and compiler-generated types counted
  with their outermost type.
- **What is counted:** each occurrence of a `Features.*` type in its signatures (base type, interfaces, fields,
  properties, parameters, returns) and in its IL tokens.
- **Baseline:** `tests/backend/Architecture/shared-feature-references.baseline.json`, keyed
  `referencing type -> referenced type` with counts.
- **Rules:**
  - A new edge or a higher count fails.
  - A lower count or a vanished edge is a note, so shrink the file when that happens.
  - `JE_UPDATE_SNAPSHOTS=1` rewrites the file. Gates never set it, and the coordinator must review any regeneration.
- **Build configuration:** the counts come from the Release build that the gates use.

Today: **30 edges, 426 occurrences** (7 referencing types).

| Referencing type | Referenced type | Count |
|---|---|---|
| Infrastructure.Http.JeControllerBase | Features.DetailsProviders.Services.ReviewAuthorCache | 1 |
| Infrastructure.Http.JeControllerBase | Features.Settings.Services.SettingsDefaults | 1 |
| Infrastructure.Http.JeControllerBase | Features.Settings.Services.SettingsDocumentService | 2 |
| Shared.MediaTags.MediaTagsPageFields | Features.MediaTags.PosterTags.PosterTagSettings | 1 |
| Shared.MediaTags.MediaTagsPageFields | Features.MediaTags.PosterTags.TagStyleKeys | 1 |
| Shared.MediaTags.MediaTagsPageFields | Features.MediaTags.PosterTags.TagStyleSet | 3 |
| Shared.MediaTags.MediaTagsPageFields | Features.MediaTags.Services.LeavingSoonService | 2 |
| Shared.MediaTags.MediaTagsPortable | Features.MediaTags.PosterTags.TagStyleKeys | 1 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagCacheEntry | 9 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagMediaSource | 4 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagMediaStream | 30 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagQualityCategory | 57 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagQualitySummary | 21 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.Models.TagStreamData | 31 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.PosterTags.Resolution.LanguageFlagRules | 7 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.PosterTags.Resolution.LanguageFlagRules+ParsedTag | 7 |
| Shared.MediaTags.SeriesQualityAggregation | Features.MediaTags.PosterTags.Resolution.QualityTagRules | 22 |
| Shared.SpoilerGuard.SpoilerPendingService | Features.SpoilerGuard.Services.SpoilerSeerrPendingPromoter | 5 |
| Shared.SpoilerGuard.SpoilerSeerrRedactor | Features.SpoilerGuard.Services.SpoilerFieldStripFilter | 10 |
| Shared.SpoilerGuard.SpoilerSeerrRedactor | Features.SpoilerGuard.Services.SpoilerFieldStripFilter+CategoryReveal | 19 |
| Shared.SpoilerGuard.SpoilerSeerrRedactor | Features.SpoilerGuard.Services.SpoilerNextUnwatchedService | 4 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagAwards | 1 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagCacheEntry | 75 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagMediaSource | 17 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagMediaStream | 47 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagQualityCategory | 16 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagQualitySummary | 21 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagSourceRatings | 1 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.Models.TagStreamData | 9 |
| Shared.SpoilerGuard.SpoilerTagDataStripper | Features.MediaTags.PosterTags.Resolution.QualityTagRules | 1 |

Notes for planning the reduction:

- **Launders back to the owning feature (A → Shared → A).** The SpoilerGuard ones are
  `SpoilerPendingService → SpoilerSeerrPendingPromoter` and
  `SpoilerSeerrRedactor → SpoilerFieldStripFilter/SpoilerNextUnwatchedService`. The MediaTags ones are
  `MediaTagsPageFields`, `MediaTagsPortable` and `SeriesQualityAggregation → MediaTags.*`.
- **Real cross-feature edges via Shared:**
  - `SpoilerTagDataStripper → MediaTags.Models` is SpoilerGuard → MediaTags. It is on the allow-list, but the list
    no longer sees it because the stripper is in Shared.
  - `JeControllerBase → Settings`/`DetailsProviders` services is every controller → Settings/DetailsProviders,
    through the base class.
- **Likely fix:** move the MediaTags DTOs (`Features.MediaTags.Models.Tag*`) and the `*Rules` statics they share into
  `Shared/MediaTags` as pure renames. That alone removes 18 of the 30 edges.

## M3 audit (read-only): frontend boundary-baseline pairs added after S1

The review counted 9 commits. Across every ref (`git log --all restructure-base.. -- tests/frontend/architecture/boundary-baseline.json`)
I found only **6** non-merge commits that add (file, violation) pairs to the file after S1 (`24ee629e`) created it.
The two merges that touched it (`448fd53b`, `5adf5d6a`) add nothing against either parent, and the C4 commit
`bfb0b643` deletes the file. In total there are 96 added pairs, and **all 96 are relocations; none is a new
violation**. No commit raised the file's total violation count:

| Commit | Added pairs | Classification | Total violations |
|---|---|---|---|
| `ba8164a6` A1 move ui-panel-hidden-content | 1 | file moved, same violation and count | 536 → 536 |
| `8285ef67` A2 move the tag panels | 5 | file moved, same violation and count | 536 → 528 |
| `52137381` A3 fold admin-tags into media-tags/admin | 3 | file moved, same violation and count | 528 → 502 |
| `26bc60eb` B1 media-tags pipeline/editor/types/layout | 71 | 46 file moved (git rename), 1 file moved (`rules/status-vocabulary-entry.ts` → `types/status/`, a 3-line file git saw as delete+add; same `import host/tag-rules-host.ts` = 1), 24 `host-import` targets moved (`media-tags/rules|runtime/*` → `layout/`, `pipeline/`, `editor/`, `types/*`; same importing host file, same count, old label removed) | 502 → 502 |
| `a2633099` B2 generated media-tags modules into types/ | 5 | `host-import` targets moved (`rules/media-language`, `rules/status-vocabulary` → `types/language`, `types/status`) | 502 → 502 |
| `dc511b54` C1 feature hosts into features/<f>/ | 11 | import targets moved (`host/activity-host.ts` → `features/activity/host.ts` ×5 files, `host/settings-panel-host.ts` → `features/settings-panel/host.ts` ×6 files); same count, old label removed | 502 → 106 |

## Gates

Each command was run on the final tree with `JE_UPDATE_SNAPSHOTS` unset.

- `scripts/restructure-gates.sh be`: **passed**. Results by gate:
  - B: no new warnings.
  - G: 16/16 Architecture tests, including the 5 new ones.
  - T: total 3198, passed 3197; the 1 failure is the listed `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`. Coverage floors were met.
  - F: frontend 3787 total, 3778 passed, the 9 listed failures; the client-build, contracts and path readers passed.
  - INV and TOOL passed.

  The first `be` run failed only on the coverlet artefact described under M4.
- `scripts/restructure-gates.sh inv`: **passed**.
- `scripts/restructure-gates.sh tool`: **passed**.

## Applying the hardened gates to later trees

- **In the gates:** all three run in gate G (`dotnet test --filter FullyQualifiedName~Architecture`) and in T, so
  `restructure-gates.sh be` enforces them on every later tree with no extra step.
- **Never regenerate `*.base.json` from a later tree.** They are proof against `restructure-base`.
  - **If a step 9+ change makes one fail:** treat it as a behaviour change and investigate. Typical causes:
    - a helper that reads `User` moved into a service (M1);
    - an auth check deleted or duplicated (M1);
    - an HttpClient handler setting changed (M4);
    - a factory lambda now resolves something else (M4).
  - **If the difference is an analysis artefact** (a construct the analysis does not follow): fix the analysis, then
    regenerate from a fresh `restructure-base` build with the recipe above.
  - **If the change is intentional** (a deliberate contract change): change the expected file in a reviewed PR that
    says why, as for Gate A. Keep the anchor line, and add the reason to that line or to the PR.
- **Checking a tree without the test project's referenced build** (another clone, or a release DLL): run the same
  filter with `JE_ARCH_PLUGIN_DLL=<that tree's Release jf12 DLL>` and no `JE_ARCH_WRITE_BASE`.
- **Step 9 (Seerr/Platform moves) and M2:**
  - Renaming the legacy Seerr types into `Features.Seerr.*` will make existing `Shared`/`Infrastructure` references to
    them new ratchet edges. The same goes for moving a type into `Shared/` (for example `SeerrParentalFilter` →
    `Shared/Parental`, §7.7) when that type references `Features.*`.
  - The test lists each new edge. The step must remove the edge, or the coordinator adds it to
    `shared-feature-references.baseline.json` in the same PR, visibly, as with `feature-dependencies.json`.
- **Step 9 and M1/M4:**
  - Route keys and service keys do not depend on controller, file or namespace, so pure moves leave them unchanged.
  - Moving `ProxyJellyseerrRequest` and similar helpers to `JeSeerrController`, `JeControllerBase` or a static
    `Shared` helper keeps the M1 counts. Moving one into an injected service changes them, which is the intended
    failure (§3).
  - Moving the Seerr `AddHttpClient` into `AddJeSeerr()` keeps M4, provided the name constant and handler lambdas
    stay the same.
