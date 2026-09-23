# Maintainability overhaul: validation record

> Historical record of the first maintainability pass. Its layer-based directory layout has been superseded by the [feature-first layout](feature-layout.md). Paths and executed checks below describe that earlier pass; they are not current build instructions or validation evidence for the later move.

This refactor starts from `cfa35a78986fa692a940214010563c44a7270710`.
The authoritative developer guide is [project structure](project-structure.md).
The work plan and ownership record are in [the plan](maintainability-plan.md).

## What changed

| Area | Result |
| --- | --- |
| HTTP backend | The 10,562-line controller becomes 28 feature controllers, narrow shared HTTP bases, and application collaborators. The largest feature controller is 833 lines. |
| Backend services | Feature directories separate caches, upstream clients, policies, persistence and response transformations. Existing public service namespaces and lifetimes remain. |
| Admin dashboard | Eleven tab templates, 42 script sources and focused stylesheet sections compose the original page. Generated HTML and CSS are byte-identical to the starting revision. |
| Client startup | Six private source factories plus an ordered dependency manifest generate the established `js/plugin.js` entry point. |
| Browser features | Playback, bookmarks, quality tags, active streams, Seerr API/search/discovery/detail actions/issues, Elsewhere/reviews and Arr links have separate policy/data/view/lifecycle owners. |
| Persistence | UserConfigurationManager retains its public API; review and activity stores own their respective server-wide files. |
| Plugin integration | Sidebar registration uses one tested reconciliation policy instead of six repeated add/remove implementations. |
| Developer workflow | Root solution, dependency-free Node commands, executable regression projects, generated-resource checks, CI and local ownership guides. |

Already focused code remains intact. In particular, serialized configuration
schemas stay flat, CSS-only feature files remain together, and tag-cache locking
and publication remain in one coordinator. Existing scheduled tasks, event
handlers, models, extensions, helper policies, locale assets, security workflows
and release metadata were reviewed; moving them for visual symmetry would not
improve their ownership boundaries.

## Executed checks

Final unified command:

```sh
npm run check
```

The local run used Node 26.2.0 and .NET SDK 10.0.302 with matching .NET/ASP.NET
10.0.10 runtimes. The system-installed SDK had mismatched runtime patch versions;
the already-installed user SDK supplied a complete environment. CI provisions
.NET SDK 10 and Node 22 independently.

- **162 Node tests passed**, with no skipped tests.
- **Both Release builds passed**, `jf12` / .NET 10 and `jf10` / .NET 9, each with
  zero warnings and zero errors.
- The packaged artifacts retain **all 200 original embedded-resource names**;
  **258 current resources** match their source bytes on each target.
- The client manifest registers **200 components** and preserves all **152
  original component URLs in their original relative order**. Missing, duplicate,
  unordered, unregistered and resource-unsafe paths are rejected.
- All **149 original HTTP action contracts** retain their routes, verbs, binding,
  authorization, limits, cache attributes and defaults. Tests also reject public
  helper methods that MVC could accidentally discover as actions.
- **Eleven executable C# projects** cover artifact contracts, HTTP/Seerr status,
  assets, hidden content, ratings/analytics, automatic requests, parental filters,
  spoiler responses, tag snapshots, configuration storage, and sidebar integration.
- Configuration fixtures compare actual original JSON schemas/defaults, XML
  serialization and XML round-trip behavior. Storage tests exercise concurrent
  updates, corruption handling, normalized user paths and retention.
- All translations validate; runtime JavaScript and JSON parse successfully.
- `mkdocs build --strict` passes using the same documentation dependencies as CI.
- Regenerating documentation metadata also restores the existing playback-rating
  setting's missing label/group/tab/default entries; no setting behavior changed.

Characterization scenarios were also run against original implementations for
bootstrap, bookmarks, player, quality tags, Seerr API/search/discovery, parental
filters, automatic requests, ratings and analytics. Quality-tag review included
20,000 deterministic baseline/refactor comparisons. These are additional
development-time comparisons, not a claim that every live feature was exercised.

## Real server and browser validation

The optional harness is documented in the repository's `tests/runtime/README.md`.
It uses pinned Jellyfin 10.11.11 and 12.0.0 Docker images, temporary configuration,
fresh administrator/viewer accounts and random localhost ports. No existing
server, user data or media library is used.

The original artifacts passed on both hosts: plugin activation, host compatibility,
all original component URLs, web injection, static resources, locales, all feature
pages, authorization and cross-user isolation, configuration round trips, actual
Chromium login/dashboard hydration/form submission, and persistence through a
container restart.

Both baseline artifacts were built from an isolated `git archive cfa35a7`
snapshot, not the working checkout. The final four baseline/refactor browser
runs reported no browser exceptions. All harness-created containers were removed;
pre-existing containers were left untouched.

**Both final artifacts passed all nine smoke groups**, including the same server
and browser flows, all 200 live component URLs in exactly the manifest order,
`JE.initialized` completion, and repeated keyboard settings-panel open/close.
The original 152-component bootstrap also passes the comparison flows.

| Target | Validated host | Final DLL SHA-256 |
| --- | --- | --- |
| `jf10` | Jellyfin 10.11.11 | `2a20a2a24141f5da799134e1f999f64e83567cdcdd3de0289de74baa02ed7936` |
| `jf12` | Jellyfin 12.0.0 | `c53782110aab21a55cfe520242f983a190669702d3ac966132eb3803a89e3eaa` |

Runtime reports, screenshots, and server logs from this workspace are under
`/tmp/je-maintainability-runtime/{baseline,final}-{jf10,jf12}/`. Reports record
the pinned image digest, artifact hash and individual checks. Fresh reports can
be reproduced without those temporary files:

```sh
# After installing the optional browser dependencies described in tests/runtime/README.md:
tests/runtime/.venv/bin/python tests/runtime/smoke.py --target jf12 \
  --artifact Jellyfin.Plugin.JellyfinEnhanced/bin/Release/net10.0/Jellyfin.Plugin.JellyfinEnhanced.dll \
  --module-manifest frontend/module-manifest.json --browser \
  --output tests/runtime/results/jf12

tests/runtime/.venv/bin/python tests/runtime/smoke.py --target jf10 \
  --artifact Jellyfin.Plugin.JellyfinEnhanced/bin/Release/net9.0/Jellyfin.Plugin.JellyfinEnhanced.dll \
  --module-manifest frontend/module-manifest.json --browser \
  --output tests/runtime/results/jf10
```

The optional `runtime-smoke.yml` workflow runs the Docker/API checks for both
targets on manual dispatch. Browser smoke checks are available locally through
the documented opt-in dependency environment.

## Review and limitations

Independent reviews compared controller method bodies and service extractions
against the baseline and reviewed bootstrap request/initialization traces. Issues
found during integration were corrected: resource-unsafe directory naming,
mutable converter binding, an analytics exception boundary, and an incidental
log-string change. Import cleanup was rebuilt after resolving incomplete tool
reference context.

The checks do not prove every playback, device, theme, library-size, or network
scenario. Live Seerr, Sonarr, Radarr, TMDB, MDBList, translation-provider and CDN
accounts were not used; these boundaries use controlled responses where covered.
Browser validation uses Chromium, not the complete Firefox/Edge/mobile/TV matrix.
CI workflow files were updated locally; no remote workflow or release was run.
No changes were pushed or deployed to a live server.
