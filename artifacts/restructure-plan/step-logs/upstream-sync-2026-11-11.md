# Upstream sync, 2026-11-11: `0586df79` → `189a0a26` (one commit)

An unattended run of [`docs/upstream-sync-procedure.md`](../../../docs/upstream-sync-procedure.md). Branch
`sync/auto-20261111-0007`, on `restructure/integration` at `aacfc265`. The ledger is
[`docs/upstream-sync.json`](../../../docs/upstream-sync.json) (table: [`docs/upstream-sync.md`](../../../docs/upstream-sync.md)).
The earlier sync's log is [`upstream-sync.md`](upstream-sync.md).

## 1. The gap

`python3 scripts/upstream_sync.py update --fetch` moved upstream's `main` from `0586df79` to `189a0a26` and added
one entry. No release tag, no merge commit, nothing for Jellyfin 10.11 only.

| # | Upstream | Subject | Size | Status | Rewrite commit |
|---|---|---|---|---|---|
| 18 | `189a0a26` | feat(leaving-soon): show the Maintainerr key like the TMDB key, add a Maintainerr card and wider URL fields | 15 files, +60 −34 | **ported** | `47c7e3cd` |

After the run the ledger has 18 entries, all `ported`; `upstream_sync.py check` passes. Nothing is `pending`,
`deferred` or `not-applicable`.

"Already present" was checked by behaviour, on the lab, before any code changed (section 3, the "rewrite before"
column): the key was a password field that showed nothing, the save endpoint answered the key as an empty string and
ignored a stale `Expected` value, no box was wide, and the Services tab had no Maintainerr card.

## 2. The port (`47c7e3cd`, `Upstream: 189a0a26d2e9e84afab63bdd48f07b08183a6148`)

What upstream changed, and where each part went here:

| Upstream | Here | How |
|---|---|---|
| `Helpers/PluginConfigurationPatch.cs`: the Maintainerr key is no longer write-only in the Media Tags page save (returned in `values`, conflict-checked against `Expected`) | `Shared/MediaTags/PluginConfigurationPatch.cs` | the hunk, at the moved path |
| `Helpers/MediaTagsPortable.cs`: comment only (the key stays out of exports and imports) | `Shared/MediaTags/MediaTagsPortable.cs` | the hunk |
| `Services/CdnAssetService.cs`: `selfhst/svg/maintainerr.svg` joins the assets kept warm | `Features/Platform/Services/CdnAssetService.cs` | the hunk |
| `js/enhanced/admintags/admin-tags.css`: `.je-ta-masked`, `.je-ta-field-control--wide` | the same file (hand-written here too) | the hunk |
| `js/enhanced/admintags/admin-tags.js`: field options `wide` and `mask` | `client/src/features/media-tags/admin/types.ts`, `fields.ts` | re-implemented |
| `sections/awards.js`, `badges.js`, `language.js`: five fields marked `wide`, the key `mask` instead of `secret`, a new description | `client/src/features/media-tags/admin/sections/*.ts` | re-implemented |
| `Configuration/admin/sections.js`, `configPage.html`: the `svc-maintainerr` card on the Services tab | `client/src/admin/config/sections/about.ts`, `client/html/admin-config/configPage.html` | re-implemented |
| `docs/advanced/admin-media-tags.md`, `docs/advanced/api.md` | the same files | the same sentences (the hunks did not apply: this tree's pages name the moved C# types) |
| three test files | `tests/backend/Features/MediaTags/ApiMediaTagsPageTests.cs`, `tests/frontend/features/media-tags/admin/features-admin-tags-page-colours-status.test.mjs`, `tests/frontend/helpers/admin-tags-page.mjs` | the hunks, at the moved paths |

Differences from upstream, all in the ledger entry's `notes`:

- **`docs/enhanced/tags.md`** has the same paragraph as the two advanced pages. Upstream left it describing a
  write-only password field; it is corrected here with the other two. Filed as a found bug for upstream
  (`NEW-20261111-003541-upstream-docs-enhanced-tags-md-still-says-the-ma`).
- **Three tests added** for what upstream left untested: the five wide boxes, two short ones that must stay narrow and
  the four stylesheet rules; the Services card (title order, logo, text, link, no field of its own); the logo in
  `CdnAssetService.KnownAssets`.
- **`tests/fixtures/admin-config-baseline.json`** gains `svc-maintainerr` in `sections`, as
  `docs/rewrite/admin-config.md` prescribes for a schema change. The card has no setting, so the What's New index
  and every other list in that file are unchanged.

No route, authorization or DI registration changes, so there is no contract commit. No cached-output version applies
(nothing a tag or a composite is built from changed). No new setting.

Generated files (`Configuration/admin/sections.js`, `Configuration/configPage.html`, the four `admintags` outputs,
their maps, `client/generated-manifest.json`) were regenerated with `je12 regen` and are in the same commit.
`scripts/generate_config_flag_groups.py` was run and changed nothing.

## 3. Evidence

All files are in [`upstream-sync-evidence/`](upstream-sync-evidence/), prefix `p18-maintainerr-key`.

**Tests first.** Upstream's two updated tests and the three added here, run on the tree before the port
(`.tests-before.txt`): 3 of 3 node tests and 2 of 2 dotnet tests fail, each on the behaviour the port changes
(`'password' !== 'text'`; the control's class without `--wide`; no `Maintainerr` card; the answer
`"LeavingSoonMaintainerrApiKey":""`; the logo missing from the list). After the port `je12 test --dotnet` passes:
node 3133 of 3133 and dotnet 2008 of 2008 for the three touched features.

**Lab parity.** One script (`.mjs`), one lab (Jellyfin 12.4, Docker backend, no route out, Seerr/Sonarr/Radarr
mocked), three builds: the rewrite before the port, upstream's build of `189a0a26`
(`scripts/upstream_lab_deploy.py`), and the port. No Maintainerr address is set at any point, so nothing is called.
The command, as `je12 evidence` recorded it for both sides:

```
je12 browse '#/home' --script artifacts/restructure-plan/step-logs/upstream-sync-evidence/p18-maintainerr-key.mjs
```

| What the script reports | Rewrite before (`aacfc265`) | Upstream `189a0a26` | Rewrite after (`b6f03481`) |
|---|---|---|---|
| Save endpoint, key set to `lab-key-one` | `200 {"values":{…:""}}` | `200 {"values":{…:"lab-key-one"}}` | same as upstream |
| Save with a stale `Expected` for the key | `200`, the key is overwritten (`lab-key-two`) | `409 {"conflicts":{…:"lab-key-one"}}`, the key is kept | same as upstream |
| The key's box | `type=password`, `autocomplete=new-password`, empty | `type=text`, class `je-ta-masked`, `autocomplete=off`, holds `lab-key-one` | same as upstream |
| Its text when not hovered / when focused | dots / dots | dots / shown | same as upstream |
| Its description | "Optional. Kept on the server like the other keys and never sent to users." | "Optional. Only needed if Maintainerr has an API key set." | same as upstream |
| After typing `lab-key-typed` and the page's own save | box empty; stored `lab-key-typed` | box `lab-key-typed`; stored `lab-key-typed` | same as upstream |
| Maintainerr URL and key, the two MDBList lists, priority languages (1600 px window) | 184 px each, control `je-ta-field-control` | 392 px each, control `… je-ta-field-control--wide` | same as upstream |
| "Refresh every" (a short number box) | 91 px | 91 px | 91 px |
| Services tab cards | TMDB, AniList, MDBList Ratings, Content Warnings | the same four, then Maintainerr | same as upstream |
| The Maintainerr card | none | logo `selfhst/svg/maintainerr.svg`, the note, link "Set up Leaving soon", no field | same as upstream |
| Following the card's link | n/a | Status badges tab, the Leaving soon fields shown, still one view of the page | same as upstream |

The `SCRIPT` line of `.rewrite-after.txt` is byte-identical to the one in `.upstream.txt`.

Both builds also print one new console line the old rewrite build does not:
`404 /JellyfinEnhanced/cdn/selfhst/svg/maintainerr.svg`. The lab is offline on purpose, so the server cannot fetch
the logo, exactly as it cannot fetch `selfhst/svg/tmdb.svg` (in the baseline). The logo itself exists at the
source the server uses: a direct request for `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/maintainerr.svg` from
the build machine answers `200 image/svg+xml` (1,793 bytes).

**Smoke** (`.smoke.txt`), the port against the baseline `je12 up` recorded at `aacfc265`: 16 rows `ok`, **2 rows
`FAIL`, both that same missing logo and both expected in a lab without internet**:

- `page admin`: one new console error, the 404 above. Its sibling for `tmdb.svg` is in the baseline.
- `server log`: one new warning kind, `[CDN] Failed to refresh known asset 'selfhst/svg/maintainerr.svg'.` Its
  sibling for `tmdb.svg` is in the baseline. It comes from the one line added to `KnownAssets`.

Neither can pass offline without dropping the logo, which would differ from upstream. Nothing else changed: plugin
12.15.0.0 active, 16 JE tasks, OpenAPI 200 with 180 JE paths, bundle wire identical in all three encodings.

## 4. Gates

| # | Check | Commit | Where | Result |
|---|---|---|---|---|
| 1 | `je12 test --dotnet` | the port, before commit | shared worker | pass: node 3133 of 3133, dotnet 2008 of 2008 (features platform, admin, media-tags) |
| 2 | `je12 regen` | the port | shared worker | ok |
| 3 | `upstream_sync.py check` | `b6f03481` | shared worker | `18 entries: 18 ported` |
| 4 | `je12 smoke` | `b6f03481` | shared worker, Docker lab | 2 rows explained in section 3, the rest `ok` |
| 5 | `je12 gate final` | `b6f03481` | second worker (16 cores, process backend, je12 v2.3.3; load 5.2 at the start) | **PASS** |
| 6 | `je12 gate final`, repeated on the commit that lands | this log's commit | second worker | in the landing report: a log cannot hold a result about its own commit |

Row 5, as printed:

```
final: all and browser at the same time (load 5.2 on 16 CPUs)
gate all: PASS in 15.7 min
T (dotnet test): total 3296 (baseline 3295), passed 3296 (baseline 3295), failed 0 (baseline list 0)
npm test: total 3908 (baseline 3906), passed 3908 (baseline 3906), failed 0 (baseline list 0)
restructure-gates: all passed
gate browser: PASS in 9.5 min
BROWSER: 699 tests, passed 696, failed 0 (baseline list 0), skipped 3
restructure-gates: browser passed
```

No test failed, so the flake protocol was not needed. The gate ran on the second worker because the shared worker's
gate lock was held by another session with a second one waiting. The branch went there as a `git bundle` copied
over SSH into a directory of its own; nothing was pushed.

The test-count floors in `baselines/` were left as they are (3295 and 3906): the tree now measures 3296 and 3908,
and this run edits no baseline.

## 5. Risk, for the reviewer

- **An access check changes, on purpose, and it is upstream's change.** `POST /JellyfinEnhanced/admin/configuration`
  (administrators only, unchanged) now returns the Maintainerr key in `values` and in a `409`'s `conflicts`, where it
  used to answer an empty string. The administrator-only plugin configuration API already returned it, and the
  Media Tags page reads that API when it loads. The key still never reaches users: it stays in
  `MediaTagsPortable.Secrets`, so exports, imports, public and private configuration and runtime snapshots are as
  before (`ApiMediaTagsPortableTests` unchanged and passing).
- No route or its authorization, no shape of stored data, no new request from the browser to another host. The
  server asks the icon CDN it already uses for one more file.
- Undo: `git revert 47c7e3cd` (and the ledger commit after it). Stored settings need nothing.

## 6. Decisions made instead of asking

1. **Class and features** of the ledger entry: `feature`; `media-tags` (the fields and the save), `admin` (the
   Services card), `platform` (the CDN list). The guessed order was `admin, media-tags, platform`.
2. **`docs/enhanced/tags.md` corrected** although upstream did not touch it (section 2).
3. **The two smoke rows are accepted as explained**, not worked around (section 3).
4. **Evidence beside the earlier sync's**, in `upstream-sync-evidence/` with the prefix `p18-` (the ledger's entry
   number), so one folder holds every parity script.
5. **Two full gates**: one on the ported tree so that this log can hold a verdict, one on the commit that lands.
6. **The branch was copied to the second worker as a bundle**, because this run may not push anywhere.
