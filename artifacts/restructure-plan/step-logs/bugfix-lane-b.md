# Bug-fix lane B: test-suite debt (2026-11-10)

Fix lanes L2 (browser fixture defects) and L3 (stale and test-env dotnet and npm tests). Branch `bugfix/lane-b` from `restructure/integration-k` `e7f75cda`, clone `je-bfb`. Only tests, fixtures and baselines changed; no product code (`git diff e7f75cda -- Jellyfin.Plugin.JellyfinEnhanced client` is empty). Gates ran with `JE_UPDATE_SNAPSHOTS` unset. The browser gate used `JE_BROWSER_PORT=4202` in its own process group. From commit 2 on, every heavy gate ran under the shared `flock /var/lib/jebench/projects/je-gate.lock` (coordinator change).

## Commits

| Commit | Content | Baseline |
|---|---|---|
| `67f941d4` | dotnet, stale: the bundle cache-key test asserts the new key on the script's `sourceMappingURL` (every module ships a typed map now, so the key is no longer in the map). | dotnet 1 → 0 |
| `2ef7701f` | npm, stale: native tabs mount first and relabel when the Custom Tabs count arrives (intended: a hung optional request never blocks JE's tab). 3 tests updated, 1 renamed, 1 added. | npm 9 → 6 |
| `64c4a9a3` | npm, test-env: the plural tests run on `createTranslator` compiled from `translate.ts`, not on sliced plugin.js text. | npm 6 → 3 |
| `ee1130fb` | npm, test-env: the portable fixture's `switchUser` keeps `settingsRevision`, and its mock reads the body null-safely. | npm 3 → 0 |
| `f42932aa` | browser: new `tests/browser/helpers/loader-source.cjs` (esbuild of the loader's `translate.ts`/`keys.ts`). The settings-surfaces fixture gets the real `JE.t` and `settingsRevision`, plus a self-check. | browser 52 → 19 |
| `d614b141` | browser: the settings-panel fixture gets `t`, a revisioned `userConfig` and `provideFeatureContext`. | browser 19 → 13 |
| `b5d4d447` | browser: settings-panel-rewrite takes `toCamelCase`/`toPascalCase` from the helper. | browser 13 → 11 |
| `c43408f6` | browser: the chrome-rewrite fixture page has Jellyfin's viewport meta. | browser 11 → 9 |

## Baseline counts

| Suite | Failures before → after | Count floor before → after |
|---|---|---|
| dotnet | 1 → 0 | 2980 total / 2979 passed → 3212 / 3212 |
| npm | 9 → 0 | 3745 tests / 3736 pass → 3833 / 3833 |
| browser | 52 → 9 | (none) |

The old floors were stale against the tree (3212 dotnet and 3832 npm tests already existed). The new floors are the measured counts; npm has one new test. The 9 browser failures left are the three real product bugs: flows :29 ×3, seerr-details-rewrite :85 ×3, and seerr-core-rewrite :56/:69/:80 on firefox. Another lane fixes them.

## Gates

- `67f941d4`: `all`, `inv` and `tool` passed. Browser was run three times at load 33–50 from parallel lanes. Each run had 2–8 timeouts in specs this lane does not touch, and the isolated reruns passed. A clean full rerun was not reached before the coordinator made `browser` a gate for browser-fixture commits only; commits 5–8 below ran it clean.
- `2ef7701f`, `64c4a9a3`, `ee1130fb`: `fe`, `inv` and `tool` passed.
- `f42932aa`, `d614b141`, `b5d4d447`, `c43408f6`: `fe`, `inv`, `tool` and `browser` passed. Browser failures were exactly the shrunk list each time: 19, 13, 11 and 9 (693 tests, 3 skipped).
- Final tree `c43408f6`: `all` passed (dotnet 3212/3212, npm 3833/3833). The tree stayed clean (snapshots unchanged).
