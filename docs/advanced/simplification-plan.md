# Composition and workflow simplification

## Objective and baseline

Keep the twenty feature owners under `src/features/`, while reducing the machinery a developer must understand to change a feature. Preserve UI, API, resources, initialization behavior, configuration and saved data. This is a continuation of the feature-layout work, not a replacement directory scheme.

The starting revision is `cfa35a78986fa692a940214010563c44a7270710`, with the existing uncommitted maintainability and feature-layout changes included. The complete source snapshot, Git status and revision are preserved at `/tmp/je-simplification-baseline`; it excludes build outputs, virtual environments and runtime results. Its working tree is the comparison baseline, rather than the original Git revision alone. Previously validated immutable DLLs are under `/tmp/je-feature-layout-final/{jf10,jf12}/`.

The previous gate passed 200 Node-run tests, twelve C# projects, both target builds and eleven Docker/browser groups per host. A fresh `npm run check` from the snapshot also passed: 200 tests, twelve C# projects, both Release builds with zero warnings/errors, resource contracts and translation checks. No pre-existing failure was found in this gate.

## Confirmed friction

- Dashboard JavaScript includes lexical and array fragments. Feature load/read behavior depends on surrounding variables and include position.
- Feature descriptors repeat physical source names, full embedded-resource identities, public paths and global numeric order. Private startup factories repeat numeric positions and defer simple statements through arrays of callbacks.
- Flat configuration properties already belong to features, but constructor helper dispatch separates many literal defaults from their declarations.
- Ordinary `npm run generate` and metadata tests invoke Python, despite the rest of the standard-library tooling using Node.

## Implementation stages and ownership

1. **Baseline and characterization (root/runtime/review):** capture source and artifact evidence, run existing checks, characterize risky dashboard/default/startup boundaries before edits.
2. **Dashboard (configuration):** replace lexical fragments with complete feature/editor factory modules exposing explicit load/read/dependency/lifecycle methods. Host owns composition, fetching, saving and whole-form state. Retain HTML/CSS composition and existing timing/guards.
3. **Registration and startup (frontend integrations):** isolate stable delivery aliases from ordinary feature declarations; remove redundant metadata where possible. Replace scattered numeric startup callbacks with named feature initialization and a visible ordered host coordinator. Retain strict registration/ownership/order checks.
4. **Defaults (backend services):** move independent defaults to property initializers, retain helpers only where needed, and verify missing-field deserialization plus per-instance mutable defaults.
5. **Node tooling (frontend bootstrap):** replace Python metadata generation with a small standard-library Node implementation, preserve output exactly, and update generation/CI/test commands.
6. **Guidance and independent review (frontend features/backend controllers):** document actual final contracts, provide a concrete Spoiler Guard change walkthrough and independently inspect for hidden coupling, behavioral drift and unnecessary abstraction.
7. **Integration (root/runtime):** regenerate, build both targets, run focused/full checks, execute final Docker/browser comparisons, fix findings and repeat affected checks. Keep final artifact hashes and limitations in a validation record.

Agents own distinct source boundaries; root coordinates shared contracts and generated artifact integration. No pushes, releases or live deployment are part of this work.

## Target developer workflow

Existing feature logic stays in its current owner. Settings behavior has explicit function arguments and private state; configuration defaults are visible beside properties. Compatibility aliases remain stable when source changes. Startup order is readable in one small composition point. Standard generation and checks need Node and .NET; Python remains optional for runtime/docs environments.

Do not replace these problems with a framework, arbitrary auto-discovery or one large context object that merely recreates the old shared scope. Keep necessary explicit ordering and document any retained mechanism whose replacement would add risk without reducing work.

## Progress

- [x] Source/working-tree baseline captured; repository instructions and current architecture reviewed.
- [x] Ownership assigned and concrete dashboard contract agreed.
- [x] Fresh baseline checks and runtime characterization completed: both immutable baseline DLLs pass twelve expanded browser/API groups, including three dashboard visits and unknown-field save preservation.
- [x] Dashboard conversion implemented: complete feature/editor factories, explicit dependencies and a shared ordered feature list replace lexical fragments. Lifecycle fixes and final independent review are complete.
- [x] Registration/startup simplification implemented and verified: explicit aliases and named dependencies preserve 258 resource identities, 200 module URLs/order and dependency ancestry; 24 named calls preserve 33 original startup behavior steps. Forty-five focused tests pass; independent review closed without findings.
- [x] Configuration defaults simplified and verified: twenty-one helpers removed, 295 assignments moved inline; the same extended deserialization/collection-isolation tests pass before and after.
- [x] Ordinary tooling converted to Node: eight native metadata cases pass and generated output remains byte-identical; independent review closed without findings.
- [x] Contributor guides and concrete Spoiler Guard walkthrough updated; strict documentation build and runnable walkthrough example pass.
- [x] Integrated checks and both final runtime targets pass after the dependency-rule review fix.
- [x] Independent review/fix loop closed and limitations recorded.

## Deliberately retained boundaries

Browser-visible settings continue to require explicit projection in `src/host/api/ConfigurationController.cs`. This host contract is a security boundary: automatically exposing every feature schema property would risk leaking credentials. Server-only settings and edits to already-projected properties do not require this registration.

## Characterization findings

The baseline whole-repository gate passed, but deeper dashboard characterization exposed four pre-existing defects: rejected initial loads lack recovery; repeated `pageshow` adds field listeners; apply-to-all-users bypasses the save concurrency guard; and shortcut overrides not present in the default list are dropped. The replacement module design will fix these within its lifecycle/data-preservation scope and test the intended differences explicitly. Historical characterization remains labeled as baseline evidence, not a requirement to retain defects.

Additional review found delayed callbacks could update disposed/reloaded editors and that Seerr import awaited a submit handler that did not report save success. The affected modules now own request generations/disposal checks; server mutations already requested by the user continue. Import receives an explicit save-success operation. Independent tests distinguish stale UI suppression from preserving successful server-side effects.

The first isolated candidate (`/tmp/je-simplification-candidate-1`) passed thirteen groups on Jellyfin 12, including exact comparison with the baseline across 291 default controls, 292 seeded controls and complete save payloads across four visits. This is interim evidence; final artifact validation follows after all sources are frozen.

## Final implementation and review

The current feature-first directory layout is retained. Dashboard JavaScript is now 48 complete factories with explicit arguments, feature-owned load/read/dependency operations, and lifecycle scopes only for modules that own side effects. HTML includes and the CSS cascade remain unchanged. The host coordinates fetching, normalization, fresh-configuration merging and saves through one ordered feature list. The generated stylesheet and configuration metadata are byte-identical to the starting snapshot.

Feature descriptors now contain source paths and named prerequisites. Historical delivery names live separately in `src/host/compatibility/asset-aliases.json`; historical module sequencing lives in `src/host/bootstrap/module-order.json`. New ordinary modules require only their owning descriptor and consumer dependency, not entries in those compatibility files. Explicit named startup calls replace numbered factories. Mechanical checks retain path, ownership, duplicate, dependency-cycle, complete-composition and generated-freshness enforcement.

Independent reviews covered dashboard boundaries and phase ordering, registration/compatibility, defaults, metadata generation, asynchronous editor behavior and the final integrated lifecycle. Findings were fixed and affected tests rerun. In addition to the baseline defects above, fixes prevent retired callbacks from modifying replacement controls, avoid duplicate locale options and banner/preview handlers on same-DOM reentry, remove active preview overlays on disposal, and require a confirmed successful save before Seerr import. Final integration review caught a host teardown path that skipped persistence-owned spinner/button cleanup; the host now invokes that cleanup before disposing the remaining scopes. Regression tests exercise replacement-page ownership while an older request is still pending. Already-started server mutations still complete.

Final dependency-rule review found the Metadata Icons gate for Arr text links missing from the collected rules. The exact predicate, explanatory hint and icon are restored. Regression coverage compares all 63 baseline descriptors (2 sections, 20 individual controls, 35 parents, 6 Custom Tabs hints) and all 22 predicates across 96 scenarios: 2,112 comparisons, with both true and false exercised for each predicate. An actual dependency-engine test verifies the checkbox/hint and interaction with its Arr parent gate. Twenty feature configuration roundtrips also matched the baseline. No known unresolved findings remain within the reviewed scope; this does not prove the absence of every possible bug or interaction.

## Final verification evidence

Executed on 2026-09-23 with Node 26.2.0 and .NET SDK 10.0.302; CI retains Node 22 and SDK 10. The final gate passed, with zero warnings/errors in both Release builds. No pre-existing gate failure or unresolved external blocker remained.

- `npm run check`: full generated/layout/syntax/translation checks, 317 Node tests, twelve C# executable test projects, and both supported Release targets. The resource project executes against both artifacts; route coverage preserves 149 HTTP action contracts.
- `npm run generate` and `npm run check:static` also pass with a restricted `PATH` containing only Node, npm and the shell: Python is unavailable to these commands.
- A separate `dotnet build src/JellyfinEnhanced.csproj --configuration Release -p:JellyfinTarget=jf12` passes with only the .NET executable on `PATH`, demonstrating that checked-in generated resources retain .NET-only build compatibility.
- Dashboard stylesheet SHA-256 remains `1f344c5b218c1553ae20c185315ca522238b60b9b845aebc9a3d13aca83df17c`; metadata SHA-256 remains `ca3384228137e71010add8c88547306583b93f27e338e151cf7e99a47711a9dc`.
- Generated dashboard markup outside its script blocks is byte-identical to the captured baseline. The strict MkDocs documentation build passes. `git diff --check` reports only whitespace inside dashboard fragments (trailing blank lines and one trailing space) that is kept on purpose so the composed page stays byte-identical; the pre-commit whitespace hooks exclude those fragment directories.
- Final isolated Jellyfin 10.11.11 and 12.0.0 Docker/Chromium runs each pass thirteen groups: activation, all 200 registered modules in order, public assets/pages/locales, authorization and user isolation, frontend initialization/repeated navigation, dashboard loading/saving and duplicate-submit guards, Spoiler Guard preference access and nullable values, and actual restart persistence. Both report zero dashboard baseline differences and zero browser exceptions. Comparison covers 291 default controls, 292 seeded controls and complete outgoing save payloads over four visits; exact fixture IDs/host addresses and unchanged startup timestamps are normalized.

| Target | Final artifact SHA-256 | Runtime evidence |
| --- | --- | --- |
| `jf10` | `2d0a149b014c2852b904d0a7fbf387baa55af1583e6bb0cf930c4f80e3aa9ce8` | `/tmp/je-simplification-runtime/final-jf10/` |
| `jf12` | `b041dd757ea9b08d14846fece0d1c8f1ce655e17bdb57f6bad0f58cf0cf1fd4e` | `/tmp/je-simplification-runtime/final-jf12/` |

Both immutable DLLs are under `/tmp/je-simplification-final/<target>/`. Each runtime directory contains the pinned host image, artifact hash, checks, snapshots, full-save comparisons, browser errors, screenshot and server logs. Earlier pre-cleanup runs are retained separately and do not stand in for these final artifacts. Runtime containers created for these tests are removed.

Local evidence: `/tmp/je-simplification-final-check.log`, `/tmp/je-simplification-node-only-check.log`, `/tmp/je-simplification-dotnet-only-build.log`, and `/tmp/je-simplification-final-docs.log`. Temporary paths are execution evidence for this workspace, not files required to develop or build JE.

## Developer workflow and limits

An ordinary existing-feature change starts and remains in `src/features/<owner>/`: schema/default, dashboard markup and load/read behavior, API, browser code and focused tests. Run `npm run generate`, then `npm run check`. The [Spoiler Guard walkthrough](spoiler-guard-development.md) follows an actual setting, endpoint and browser operation through its tests and enumerates the registration steps for genuinely new pieces. Shared host changes remain explicit when a change affects public configuration exposure, global composition or delivery contracts.

Docker fixtures use fresh configuration and disposable users, with controlled browser/API substitutes for external providers. Validation does not cover actual media playback, every Spoiler Guard image/watched-state interaction, exhaustive visual/browser combinations, or live Seerr, Sonarr, Radarr, TMDB, MDBList and translation services. Unit/contract checks of those boundaries use controlled responses; no live-service success is claimed. Changes remain local; no release, push or live deployment occurred.
