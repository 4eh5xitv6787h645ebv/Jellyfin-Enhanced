# Disposable Jellyfin runtime checks

These checks load a **previously built DLL** into real Jellyfin 10.11 or 12, create a fresh server and two test users, then remove the container and temporary configuration. Docker binds only a random localhost port. No existing Jellyfin configuration, credentials, or media is used. Images are pinned by digest in `smoke.py`.

For before/after comparisons, build the original revision in an isolated worktree
or `git archive` snapshot. Do not capture a baseline DLL from a checkout while
refactoring it: embedded JavaScript can change during an otherwise successful
C# build. Keep the artifact hash with each report. The harness derives component
URLs from the served bootstrap; use `--module-manifest artifacts/generated/module-manifest.json`
for the current implementation to compare the entire live registration order.

Build each target independently using the repository build instructions. Then run:

```sh
python3 tests/runtime/smoke.py --target jf10 \
  --artifact /absolute/path/to/jf10/Jellyfin.Plugin.JellyfinEnhanced.dll \
  --output tests/runtime/results/jf10
python3 tests/runtime/smoke.py --target jf12 \
  --artifact /absolute/path/to/jf12/Jellyfin.Plugin.JellyfinEnhanced.dll \
  --output tests/runtime/results/jf12
```

API checks require Python 3 and Docker. For browser checks, install the optional isolated dependencies:

```sh
python3 -m venv tests/runtime/.venv
tests/runtime/.venv/bin/pip install -r tests/runtime/requirements.txt
tests/runtime/.venv/bin/playwright install chromium
# Linux hosts may additionally require: playwright install-deps chromium
```

Use the virtual environment's Python and add `--browser` to the command to check real Chromium login, injected frontend initialization, repeated keyboard settings-panel open/close, and the hydrated administrator configuration form, including its real save handler across one default and three seeded SPA visits. Each visit submits twice immediately and checks that the in-flight guard produces one write. A controlled response fixture adds an unknown configuration field and verifies that each outgoing browser save preserves it; this does not assert that the server’s typed schema persists unknown fields. Results include an artifact SHA-256, pinned image identity, passed checks, server logs, and (with browser checks) a screenshot and browser exception list. Result directories and the virtual environment are ignored by Git. Jellyfin can emit a bare `CancelledError` while changing routes; the browser check records but ignores this expected navigation cancellation, and fails on all other uncaught exceptions.

The checks cover plugin activation and target compatibility, script injection, public static resources, locales, every component registered by the served bootstrap, all six feature page registrations and the configuration page, anonymous and ordinary-user access restrictions, cross-user preference isolation, configuration round-trips, enabled Spoiler Guard nullable preference overrides and user isolation, and persistence through an actual container restart. Spoiler Guard checks exercise preference storage and access control without media; image blurring, field stripping, and watched-state behavior require separate media fixtures. They do not exercise media playback or live Seerr, Sonarr, Radarr, TMDB, MDBList, translation providers, or CDN availability. Those services require separate controlled integration fixtures or explicit manual validation.

For the refactored build, add `--module-manifest artifacts/generated/module-manifest.json` to verify that the live bootstrap registers exactly the manifest components in the declared order. Omit this option when characterizing an older baseline DLL; its own served registration list is still checked in full.

The manual `runtime-smoke.yml` workflow runs both targets with these browser checks enabled. It installs the pinned dependencies in an isolated virtual environment.

Browser runs also write `dashboard-snapshots.json` (every form input/select/textarea state and each complete outgoing save payload), `dashboard-fixture.json` (default/seeded inputs and normalization rules), and `dashboard-checks.json`. The seeded configuration exercises metadata/text conflicts, nullable Spoiler Guard inheritance, an out-of-range intensity, shortcut overrides, tag ordering, and ownership flags without enabling external integrations. Snapshots retain all control and configuration values; only the two exact disposable user IDs (both GUID formats), localhost server URL, and unchanged startup translation-cache timestamp are replaced by stable labels. A changed timestamp remains visible to the comparison.

To compare a refactor with a prior run on the same Jellyfin target, add `--dashboard-baseline /path/to/baseline/dashboard-snapshots.json` with `--browser`. Any difference fails the run and is recorded in `dashboard-diff.json`. Build and run the baseline from an immutable source snapshot before changing production code.
