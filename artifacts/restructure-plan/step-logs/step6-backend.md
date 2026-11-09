# Step 6 log, backend track: S2.1 → S2.2 → S2.3 → S2.5, merged and re-gated (2026-11-09)

Plan: [PLAN.md](../PLAN.md) step-order row 6, gates BE, INV and TOOL; [backend.md](../backend.md) §1 (route inventory), §2 (DI), §3, §4 Phase 2 rows S2.1/S2.2/S2.3/S2.5, §5, §6, §8 briefs; [step5.md](step5.md) "Notes for S2.1+". Machine: Lenovo worker, main checkout. One dotnet build or test ran at a time, in the foreground. No containers. The frontend track (A4, B3, B4), BROWSER and the step-6 HOST checkpoint are not part of this log.

## Commits

Branch `restructure/be-s2-a`, from `restructure/integration` `44752665`:

| Step | Commit | Content |
|---|---|---|
| S2.1 | `51cbea5f` | `CatchUpController` → `JeCatchupController` (class and constructor names only), namespace `…Features.Catchup`; `CatchUpLogService.cs` → `…Features.Catchup.Services`. Class-level `[Route("JellyfinEnhanced/catchup")]` and `[ApiController]` kept exactly (review-r2 F9). New `Features/Catchup/CatchupServiceRegistration.AddJeCatchup()` replaces `AddSingleton<CatchUpLogService>()` at its position. `ControllerActivationTests` assertion message updated to the new name. Docs: the `Controllers/` tree line in `docs/advanced/project-structure.md` (stale since P1-a) removed; the api.md source link text renamed. |
| S2.2 | `7bee6e16` | New `Features/Activity/JeActivityController.cs` (`GetActivityFeed`, with its section comment). `Features/Activity/**` → `…Features.Activity.Services` / `.Events`. `ActivityServiceRegistration.AddJeActivity()` replaces the two Activity lines (the consumer stays in `EventConsumerRegistration`, which gets a `using`). Qualifier/`using` fixes: `UserConfigurationManager.cs:1039` (`Features.Activity.Services.ActivityService.ActivityTypeFavorited`), `StartupService.cs`, `ReviewActivityVisibilityTests.cs` (stays in `Privacy/`; §5 maps it to DetailsProviders). |
| S2.3 | `54795e2d` | New `Features/Bookmarks/JeBookmarksController.cs` (the 6 bookmark routes and the nested `AddBookmarkPayload`, one contiguous block). `BookmarkDocumentService.cs` → `…Features.Bookmarks.Services`; the three `new Features.Bookmarks.BookmarkDocumentService(` qualifiers (2 moved actions + the Platform bootstrap) gained `.Services`. **`baselines/build-warnings.txt`: the CS8604 path re-keyed to `Features/Bookmarks/JeBookmarksController.cs`** (path only, same code, still 1 line; PLAN.md gate B). Test moved: `Api/BookmarkDocumentTests.cs` → `Features/Bookmarks/` (namespace `JE.Tests.Features.Bookmarks`), constructing `JeBookmarksController`; `BootstrapContractTests` reads the bookmark document through a `JeBookmarksController` that shares the principal. |
| S2.5 | `13323cb5` | New `Features/Calendar/JeCalendarController.cs`: `GetCalendarEvents`, `GetCalendarUserDataForEvents`, `GetItemIdByProviders`, the calendar-only helpers `RedactCalendarEvents`, `FetchSonarrCalendar`, `FetchRadarrCalendar`, `FetchShokoCalendar` and the nested `CalendarUserDataRequest`/`CalendarEventInfo` (three ranges cut, kept in source order). Builds its own `ArrInstanceClient` (step 5 decision 1). Test moved: `Integrations/IntegrationCalendarTests.cs` → `Features/Calendar/` (namespace `JE.Tests.Features.Calendar`) with a `Calendar(core, …)` helper; `ApiSeerrTests`' guarded-calendar test uses a new `SeerrFixture.Calendar()` (same services, shares the fixture controller's `ControllerContext`). The four `tests` entries naming the old test path in `tests/history/early-triage.json` were rewritten in place (assessments untouched). |
| merge | `2e0fbd9c` | `merge: restructure step 6 backend (S2.1–S2.5)` (`--no-ff` into `restructure/integration`, no conflicts) |

Every step also regenerated `tests/docs/production-inventory.json` (step action), added its feature to `"enforced"` in `tests/backend/Architecture/feature-dependencies.json` (now `["Catchup", "Activity", "Bookmarks", "Calendar"]`; no allow-list edge added), and extended the implementation-note sentence at the end of `docs/advanced/api.md` that names which controller holds which routes. No tags were created and nothing was pushed.

**Verbatim check.** Over `44752665..13323cb5`, every line removed from `JellyfinEnhancedController.cs` reappears in the three new controllers, except the three `Features.Bookmarks.BookmarkDocumentService` qualifiers above; the only line added to `JellyfinEnhancedController.cs` is the bootstrap's re-qualified call. Bodies, attributes, method names and route templates are unchanged; constructors are new and take only what the moved code uses.

## Routes moved and sizes

| Controller | Routes | Lines |
|---|---:|---:|
| `Features/Catchup/JeCatchupController.cs` (renamed, already separate) | 3 | 144 |
| `Features/Activity/JeActivityController.cs` | 1 | 63 |
| `Features/Bookmarks/JeBookmarksController.cs` | 6 | 201 |
| `Features/Calendar/JeCalendarController.cs` | 3 | 807 |
| `Controllers/JellyfinEnhancedController.cs` | 189 (was 199) | **12,402** (was 13,358; −956) |

Total still 202 routes, 12 anonymous (none of the moved routes is anonymous).

## Gates

Per sub-step, on the tree then committed unchanged: `python3 tests/inventory/generate.py` (step action), then `scripts/restructure-gates.sh inv`, `tool`, `r <old names/paths>`, then `be` (under `env -u JE_UPDATE_SNAPSHOTS`); all exited 0. R patterns: S2.1 `CatchUpController|…Services\.CatchUpLogService`; S2.2 `JellyfinEnhanced\.Services\.Activity|[( !=<]Services\.Activity|EventHandlers\.ActivityPlayback`; S2.3 `Features\.Bookmarks\.BookmarkDocumentService|Api/BookmarkDocumentTests`; S2.5 `Integrations/IntegrationCalendarTests`. H not run: no MediaTags/PosterTags namespace moved (PLAN.md gate BE). Each sub-step gave the same counts as the merged tree. `be` on the merged tree (`2e0fbd9c`), tail:
```
    1 Warning(s)                                         (the baselined CS8604, now Features/Bookmarks/JeBookmarksController.cs(50,45))
    0 Error(s)
G: Passed!  - Failed: 0, Passed: 11, Skipped: 0, Total: 11
T: Failed!  - Failed: 1, Passed: 3192, Skipped: 0, Total: 3193
T (dotnet test): total 3193 (baseline 2980), passed 3192 (baseline 2979), failed 1 (baseline list 1)
coverage-jf12: passed
npm test: total 3787 (baseline 3745), passed 3778 (baseline 3736), failed 9 (baseline list 9)
Production inventory is current (this does not assert behavioral coverage).
== INV: route list vs artifacts/restructure-plan/baselines/inventory-routes.txt   (no diff)
Ran 16 tests ... OK
tooling: passed
restructure-gates: be passed
```
The one dotnet failure is the baselined `ApiAssetTests.BundleSourceMapPreservesTypedMappingsAndLegacyModuleLinesInManifestOrder`; the 9 npm failures are the baselined ones. Test counts equal step 5's (3193 dotnet, 3787 npm): the two moved test classes kept every test.

**Snapshots unchanged: yes.** `JE_UPDATE_SNAPSHOTS` was never set (`env | grep -c` = 0; the `no_snapshot_updates` guard passed every run). `git diff 44752665 2e0fbd9c -- tests/backend/Architecture` touches only `ControllerActivationTests.cs` (message string) and `feature-dependencies.json` (`enforced`); `route-auth.snapshot.json`, `auth-helper-calls.snapshot.json` and `service-registrations.snapshot.json` are byte-identical, and G passed at every step. `client/src`, `client/` and `Jellyfin.Plugin.JellyfinEnhanced/js` are untouched (`git diff --quiet 2e0fbd9c^1 2e0fbd9c -- Jellyfin.Plugin.JellyfinEnhanced/js client` exits 0, and `ClientScriptBundle.cs` is untouched), which is HOST bundle rule (b)(2) for this backend merge. The only `baselines/*` edit is the CS8604 path in S2.3.

## Deviations and decisions

1. **`JeCatchupController` still derives from `ControllerBase`.** The S2.1 brief says "rename `CatchUpController` only" (§4 row: "none (rename …)"). Moving it onto `JeControllerBase` would add two constructor parameters it doesn't use and replace its own `_userManager` field and private `IsAdmin()` (a different body from `IsAdminUser()`), which is more than a rename. Gates A/B and `ControllerActivationTests` are indifferent; change it later only as its own step.
2. **No `BookmarksServiceRegistration` / `CalendarServiceRegistration`.** Neither feature has a line in `PluginServiceRegistrator` (`BookmarkDocumentService` is built with `new`; Calendar has no services), so an empty `AddJe<F>()` would add nothing. Catchup and Activity got theirs.
3. **Calendar's private helpers came from outside the §1 line ranges.** `RedactCalendarEvents` sat in the Seerr/Downloads region (old L11057); it is used only by `GetCalendarEvents`, so it moved with it (§4 step 2: "private helpers used only by this feature"). `EnrichWithTmdbData` and `GetMediaStatus`, between the calendar DTOs and `proxy/avatar`, are not calendar code and stayed.
4. **Moved nested DTOs stay nested** (`AddBookmarkPayload` in `JeBookmarksController`, `CalendarUserDataRequest`/`CalendarEventInfo` in `JeCalendarController`): verbatim moves; the plan only promotes `ConfigurationPatchRequest` to a top-level type (S2.7).
5. **`JellyfinEnhancedController`'s constructor is unchanged**, including dependencies that only moved code used, so `ControllerActivationTests` and every test fixture that builds it keep working; trimming it belongs to S2.15.
6. Test moves follow §5 only for the tests whose classes belong wholly to the feature (`BookmarkDocumentTests`, `IntegrationCalendarTests`). The calendar case inside `ApiSeerrTests` stays with its Seerr fixture; `ReviewActivityVisibilityTests` stays in `Privacy/` (DetailsProviders per §5).

## Notes for S2.6+

- **Controller boundary findings ahead (needs a coordinator decision before S2.12/S2.13).** `FeatureBoundaryTests` treats any `ControllerBase` type as a controller, and controllers "may reference only their own feature … whatever this list says". `JeCalendarController` (enforced now) uses `Services.SpoilerSeerrRedactor` (SpoilerGuard, `Features/SpoilerGuard/Services/`) and `ProviderHelper` (DetailsProviders, `Features/DetailsProviders/Services/`, namespace `…Helpers`). Today both are in non-`Features` namespaces, so they are not findings. When **S2.12** renames DetailsProviders and **S2.13** renames SpoilerGuard into `…Features.*`, the Calendar controller fails the enforced test, and so will every other controller that injects `SpoilerSeerrRedactor` (Seerr, Downloads, Platform, …). Options: move `ProviderHelper` to `Shared/` in S2.12, and either move the Seerr/TMDB redactor to `Shared/` or let the rule allow controller edges that are on the allow-list. Don't add allow-list entries for controllers without that decision.
- **Remaining `typeof(JellyfinEnhancedController)` lookups** (none were in S2.1–S2.5): `ApiAssetTests:13` (asset helper, S2.15), `ApiMediaTagsPageTests:382` (`PatchConfiguration`, S2.7), `BootstrapContractTests:171` (`GetBootstrap`, S2.15), `ElsewhereDocumentTests:701–702` (`Get/SaveUserSettingsElsewhere`, S2.12).
- **Tests that call moved actions on a shared fixture's `Controller`:** build the new controller with `ApiAssetTests.Controller(typeof(Je<F>Controller), core, services…)` and share the fixture's `ControllerContext` (pattern: `SeerrFixture.Calendar()` in `ApiSeerrTests.cs`). `ApiAssetTests.Controller` fills `IUserManager`, `ILibraryManager` etc. from the passed services or null, exactly as for the old controller.
- **`JE.Tests.Features` now exists.** In files in namespace `JE.Tests`, a bare `Features.…` qualifier binds to the test namespace first; use `Jellyfin.Plugin.JellyfinEnhanced.Features.…` or a `using`.
- **Relative qualifiers resolve to the new feature namespace.** Inside `…Features.<F>`, `Services.X` binds to `…Features.<F>.Services.X` once that namespace exists (Activity relied on this, so `Services.ActivityFeedBuilder` stayed verbatim), otherwise to the root `…Services`. A feature that has its own `Services` namespace **and** uses root-`Services.` types (e.g. `Services.SpoilerSeerrRedactor`) needs those qualified or `using`'d.
- `docs/advanced/api.md`'s last paragraph before "Awards tag settings" lists the feature controllers by route; extend it in each later step. `docs/advanced/project-structure.md:139` still says feature folders don't match namespaces (true until S2.13/S2.14).
- `tests/history/*-triage.json` `tests` arrays name test files; when a step moves a test file named there, rewrite those entries in place, as here.
- The CS8604 baseline line now keys `Features/Bookmarks/JeBookmarksController.cs`; no later step moves that file.
- Step 6 HOST: build and install by hand as in step 1 (S1-d); `je deploy`'s `-warnaserror` still trips on the baselined CS8604.
