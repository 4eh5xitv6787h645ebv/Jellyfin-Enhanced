# Feature layout: implementation and validation record

This is the second maintainability pass: feature ownership now determines source locations across the backend, browser, dashboard and tests. The [feature map](feature-layout.md) and [CONTRIBUTING](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/CONTRIBUTING.md) describe the resulting development workflow. The earlier [validation record](maintainability-validation.md) documents the first refactor separately.

## Plan and progress

1. **Complete:** capture the entire pre-layout source tree and both previously validated DLLs before making changes. Preserve existing local work based on revision `cfa35a78986fa692a940214010563c44a7270710`.
2. **Complete:** move all feature-specific API, server, client, settings, event, integration and test responsibilities into twenty owners under `src/features/`. Keep plugin composition in `src/host/` and common mechanisms in `src/shared/`.
3. **Complete:** give features ownership of service registration, flat configuration schema parts, dashboard controls/load/save behavior and private startup factories. Preserve cross-feature execution and registration order.
4. **Complete:** generate stable delivery maps from feature descriptors; migrate locales, build tools, test discovery, workflows and contributor guides. Remove the old layer-oriented source roots.
5. **Complete:** run independent reviews, fix integration findings and validate the combined source/build contracts.
6. **Complete:** both final server/browser comparisons and documentation regression checks pass; final review closure is recorded below.

Independent agents owned backend controllers, backend configuration/services, dashboard composition, frontend integration/startup, test migration, documentation/tooling review and disposable runtime validation. Ownership boundaries and immutable baselines allowed those changes to be compared and integrated without discarding unrelated local work.

## Resulting boundaries

A Spoiler Guard change starts in `src/features/spoiler-guard/`: its `api/` contains routes, `server/` contains image/metadata/identity/watch-state policy, `client/` contains browser behavior, `settings/` contains persisted fields and dashboard controls, and `tests/` contains regression coverage. Its Seerr bridge lives in `integrations/seerr/`. The same ownership rule applies throughout JE; features only have directories they actually need.

The source layout does not define public URLs. Each feature's `feature.json` declares legacy resource names, module paths, dependencies and its private startup factory. Checked-in outputs under `artifacts/generated/` preserve .NET-only builds. Source files, test projects and dashboard fragments remain editable beside their owner; generated bundles are delivery artifacts.

## Compatibility and executed checks

The complete local gate is `npm run check`. This run uses Node 26.2.0, .NET SDK 10.0.302 and matching .NET/ASP.NET 10.0.10 runtimes from the user SDK installation. CI provisions Node 22 and .NET SDK 10; the metadata checks also require Python 3. The default-target security restore/audit command completed and reported no vulnerable packages in its current sources.

- **200 Node-run regression tests pass**, including seven Python metadata-generator cases; no tests are skipped.
- **Twelve executable C# regression projects pass**, covering whole-plugin contracts and the affected backend feature boundaries.
- Release builds for `jf12` (.NET 10) and `jf10` (.NET 9) pass with zero warnings and errors.
- Both assemblies preserve all 200 original and all 258 pre-layout resource names; every current resource matches its registered source bytes.
- The 200-module pre-layout delivery sequence is retained exactly, together with the original 152-module relative-order contract. All 33 feature startup steps retain their order.
- All 149 original HTTP action contracts retain routes, verbs, authorization, binding and defaults.
- Whole-plugin schema and storage tests preserve property names, types, defaults, original XML deserialization and nested collection order. Root XML property emission order is grouped differently by feature; this is not a byte-identical serialization claim.
- The dashboard stylesheet remains byte-identical to the pre-layout version. Composed HTML differs only by the intentional locale-path fallback: existing upstream locations are tried first and the new root location is tried on HTTP 404 only. Focused tests cover both discovery clients and the backend locale proxy.
- Strict MkDocs generation, documentation metadata parity, workflow YAML parsing and `git diff --check` pass.
- Feature registration review confirms the same 63 flattened service/filter/client registrations and order. Configuration review confirms all 463 properties and 375 default assignments remain accounted for.

## Review and fix record

| Finding | Correction and verification |
| --- | --- |
| Some settings and assets had inconsistent feature owners | Moved ratings, activity, appearance, playback, item-details and calendar responsibilities to their owning features; regenerated assets and reran contract checks. |
| Locale discovery assumed the old repository path | Added old-first, 404-only fallback for admin discovery, browser discovery and backend fetches; controlled success/failure tests preserve existing error behavior. |
| A locale descriptor inside `locales/` was treated as a translation | Moved registration to `src/shared/localization/resources.json`; kept only translation JSON in the locale directory. |
| Registration accepted ambiguous paths and private/public source overlap | Reject invalid public paths, duplicate physical sources, symlink escapes, test assets, duplicate startup factories/steps and state access during startup construction. Regression tests cover each boundary. |
| New locale files could be omitted from the assembly | Require every `locales/*.json` file to appear in the explicit resource map. |
| Generic `build/` ignore rule hid new source tools | Explicitly unignored `tools/build/` and checked source visibility. |
| Translation filename validation excluded existing three-letter locale codes | Updated the workflow filename check to preserve supported two- and three-letter codes. |
| Dependency update configuration targeted the deleted project directory | Pointed the existing daily NuGet job at `/src`. |
| Optional runtime CI covered APIs without browser configuration handlers | Added pinned Playwright setup and `--browser` to both target jobs. |
| Security audit installed .NET 9 for the default .NET 10 target (pre-existing) | Updated the SDK and added an explicit restore before the package audit. |
| Documentation metadata extraction missed feature-owned defaults | Aggregate schema partials and constructor-reachable initialization helpers, verify all 299 primitive defaults against the immutable compiled schema fixture, and regenerate metadata through `npm run generate`. The result matches the complete pre-layout metadata exactly. |

Final independent review rechecked the corrected layout generators, descriptors, build/workflow wiring and metadata extraction. All reported findings were fixed and their affected checks rerun; no known unresolved correctness findings remain within the reviewed scope.

## Runtime evidence

Immutable pre-layout artifacts passed all eleven expanded groups on Jellyfin 10.11.11 and 12.0.0 with Chromium. The cases cover plugin activation, public delivery and script order, page registration, authorization, cross-user isolation, configuration saves, settings-panel lifecycle, enabled Spoiler Guard nullable overrides and persistence through container restart.

Both final artifacts also passed all eleven groups. All four baseline/final runs reported zero browser exceptions. Harness-owned containers were removed; pre-existing containers were left untouched. The tested DLLs are frozen outside the build tree:

| Target | SHA-256 |
| --- | --- |
| `jf10` | `066470a3b34abe278fe699b931c85453358412966f974084a60cf6968f767fab` |
| `jf12` | `71c97804db0b12571ea063fa5c0288810d6eb540509414bd81aba13d2ee74669` |

Reports, screenshots and logs for this session are under `/tmp/je-feature-layout-runtime/{baseline,final}-{jf10,jf12}/`. Reproduce the checks using `tests/runtime/README.md` and the current generated module manifest.

## Limits and external follow-up

This work does not prove the absence of all bugs. Media playback, image blurring on a real library, every browser/device/theme and live Seerr, ARR, TMDB, MDBList, translation-provider and CDN services were not exhaustively exercised. Covered external-service boundaries use controlled responses; real-server checks use isolated empty libraries and synthetic users. No real user data or live Jellyfin installation is modified.

Before publishing the new source layout, the externally hosted Weblate component must use the `locales/*.json` mask and `locales/en.json` base. That account-side configuration is outside this repository and was not changed. Local translation checks, packaging and old/new source URL compatibility are covered here.

Changes remain local. Remote CI, publication and deployment have not been run.
