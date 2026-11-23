# Upstream sync, 2026-11-23: Reclaimerr's token API (`da3d9ee9`, `54a6f418`, `7762f8e1`), by the decision handed to this run

Branch `sync/reclaimerr-da3d9ee9`, from the main line `restructure/integration` at `ba6cdbdf8`. Ledger rows 97 (`da3d9ee9`,
#1091), 109 (`54a6f418`) and 110 (`7762f8e1`, #1097) had been deferred because porting them changes the frozen contract
([`upstream-sync-2026-11-21-0240.md`](upstream-sync-2026-11-21-0240.md), `p97-contract-lines.txt`). The owner handed the
maintainer's decision on row 97 to this run. No other upstream commit was waiting: upstream `main` still ends at `e16cc10b`.

## The decision on row 97

**Follow upstream's shape** (option A of the row's `needs`): `POST reclaimerr/service-account` and `POST
reclaimerr/create-users` are removed, `POST reclaimerr/import-users` and `GET reclaimerr/user-audit` are added.

- Keeping the two old routes (option B) would mean routes that cannot work: the service account and the user map they
  write are what upstream removes, so they could only refuse or alias the import. This tree's admin page was their only
  caller.
- 54a6f418 and 7762f8e1 are written against the token API, and so will be upstream's later Reclaimerr commits; the rewrite
  exists to stay in line with upstream.
- Precedent: the deferred contract decision on upstream `abcaa16d` (2026-11-20) took upstream's own shape.
- Stored settings and old Reclaimerrs are handled as upstream does, which is safe here (below).

## Commits

| Commit | Part |
|---|---|
| `feat(media-tags): Reclaimerr 0.6.15's token API, Import Jellyfin users and a user audit; no service account` | row 97: `ReclaimerrApi.cs` (new), `ReclaimerrActions.cs`, `LeavingSoonService.cs`, `MaintainerrHttp.cs`, `LeavingSoonSources.cs`, the Reclaimerr and LeavingSoon controller partials, models, settings, the admin card, the Leaving soon page, en.json, jeAdmin.css, docs, tests, generated files |
| `feat(media-tags): Reclaimerr credits the acting administrator's linked account on admin calls` | row 109, its route test, tags-status.md; the suites' tag caches lose the Leaving soon service (a test race, below) |
| `fix(media-tags): the Reclaimerr user audit no longer reads a refused sign-in as a problem with the users` | row 110, upstream's tests re-homed |
| `chore(budget): room in the bundle and assembly budgets for the Reclaimerr token-API ports` | `client/bundle-budget.json` gzip-9 +38 (2,748,975 / 758,241 raw / gzip-9 bytes on ba6cdbdf8, 2,749,202 / 758,279 with the ports; raw within its limit), `client/assembly-budget.json` +15,957 (12,367,267 → 12,383,224 embedded bytes), each a history entry; the headroom left before the ports stays as it was. The first `gate final` failed only on these two budget tests |
| `docs(sync): upstream da3d9ee9, 54a6f418 and 7762f8e1 ported, by the decision handed to the 2026-11-23 run` | the ledger |
| `docs(sync): step log and evidence for upstream da3d9ee9, 54a6f418 and 7762f8e1` | this log and `upstream-sync-evidence/p97*` |
| `contract: reclaimerr token API (upstream da3d9ee9)` | the contract lines, by hand, last |

## Contract lines (the last commit; `p97-contract-applied.txt`)

Applied exactly as the failing Architecture tests printed them; `JE_UPDATE_SNAPSHOTS` not set. Six Architecture tests
failed on the port before the commit and all 24 pass after it; gate INV passes.

- `route-auth.snapshot.json`: removed `POST reclaimerr/create-users` (`CreateReclaimerrUsers`) and `POST
  reclaimerr/service-account` (`CreateReclaimerrServiceAccount`); added `POST reclaimerr/import-users`
  (`ImportReclaimerrUsers`, `request:Body, reclaimerr:Services, token:Special`) and `GET reclaimerr/user-audit`
  (`GetReclaimerrUserAudit`, `reclaimerr:Services, token:Special`), both `requiresAuth`, no policy (administrator check in
  the body, like their neighbours).
- `auth-helper-calls.snapshot.json`: removed `CreateReclaimerrServiceAccount` and `CreateReclaimerrUsers` (`IsAdminUser`
  1); added `GetReclaimerrUserAudit` and `ImportReclaimerrUsers` (`IsAdminUser` 1); changed `KeepFromReclaimerrRemoval`,
  `MarkForReclaimerrRemoval` and `PostponeReclaimerrRemoval` from `{IsAdminUser:1}` to `{IsAdminUser:1, User:1,
  UserHelper.GetCurrentUserId:1}` (54a6f418: the acting administrator's id) and `RequestReclaimerrRemoval` from `{}` to
  `{User:1, UserHelper.GetCurrentUserId:1}` (da3d9ee9: a request is filed as the caller's linked account, found by id).
- `auth-reads-by-route.base.json`: removed the two old routes, added the two new ones (`IsAdminUser` 1 each).
- `artifacts/restructure-plan/baselines/inventory-routes.txt`: the same two out, two in.
- `service-factories.base.json`: the `JellyfinEnhanced.Maintainerr` client's two lines gain `HttpClientHandler.set_UseCookies`
  (da3d9ee9: the Maintainerr/Reclaimerr client keeps no cookies, so a trusted-proxy sign-in as one user is never carried
  to another call).

## Stored settings and older Reclaimerrs

- `ReclaimerrUsername`, `ReclaimerrPassword`, `ReclaimerrUserMap` and `ReclaimerrActAsUser` no longer exist. Jellyfin
  ignores them when it reads the saved configuration, and the plugin's first start writes the file without them: on the
  lab, a configuration saved by the main line with a service account, password, map and act-as-user was read by the port
  with none of them, and the file no longer held them before any save (`p97-stored-settings.txt`). The act-as-user value
  does not carry over: **Let users request removals** (`ReclaimerrUserRequests`) starts off, as upstream intends.
  Requests filed earlier under the service account stay in Reclaimerr. An old portable export naming the password still
  counts as a secret and is never read.
- A Reclaimerr older than 0.6.15 is refused: its version is read from `/openapi.json` (development builds count as the
  release they lead up to), the Leaving soon status names it ("This Reclaimerr is older than 0.6.15 (it reports 0.6.1)"),
  its facts are dropped and nothing else is asked of it or done in it.

## Proof

- **Tests** (`p97.tests.txt`): the new and changed client tests and the header-name test were recorded failing on the
  main line in a scratch checkout of it; upstream's 7762f8e1 backend tests failing on the 54a6f418 port (13 of them);
  the 54a6f418 route test failing on the da3d9ee9 port; all pass on the port. Upstream's suite has 79 tests here, this
  tree's route suite 7.
- **Live** (`p97-live.txt`, lab on Jellyfin 12.4, Reclaimerr pointed at an address that does not exist in the lab; the
  lab's isolation rules saw 0 packets): before/after pairs on the main line and the port for the admin card (`card`), the
  four routes (`routes`) and the Leaving soon page (`page`); the same three scripts on upstream's build at 7762f8e1
  (`p97-*.upstream-7762f8e1.txt`) give the same routes, page and audit answers (upstream's deep link opens the Services
  tab's copy of the card, so its visibility column is not comparable). On the main line an unreachable Reclaimerr left
  the page with no notice at all (`requestsUnavailable` false); on the port and upstream it says the requests could not
  be read, and administrators why.
- **Smoke** (`p97.smoke.txt`): the port against a baseline recorded on the main line: pass, 0 changed; OpenAPI still 498
  paths (two routes out, two in).
- **Gate**: `je12 gate final` runs on the branch's last commit, after this log; its verdict is in the run's report.

## Differences from upstream and decisions

- The controllers are this tree's `JeMediaTagsController` partials (actions `ImportReclaimerrUsers`,
  `GetReclaimerrUserAudit`); the switches stay in `LeavingSoonSources`; the page's request budget stays
  `ReclaimerrActions.ListBudget`; 54a6f418's caller id comes from the controller's `CallerUser()`.
- The import card's checkboxes keep no ids (they are not settings) and `page/service-status.ts` keeps both copies' ticks
  in step, so `config-flag-groups.json` gets no checkbox entries (upstream regenerated it with 16).
- This tree's `MaintainerrHttp` still refuses an empty GET answer; the audit says "Reclaimerr's answer was not an
  account" for an answer that is no JSON, as upstream does for its empty one.
- The requester's note keeps this tree's reader (it already dropped only the attribution); upstream's page guard against
  a redrawn page is this tree's page lifecycle.
- Docs follow upstream, except that this tree's removal date dialog has no Reset timer; tags-status.md also says what the
  user header carries on administrators' calls (54a6f418 changed no docs).
- Tests: upstream's suite is re-homed as `IntegrationReclaimerrTests`; this tree's service-account suites
  (`IntegrationReclaimerrActionsTests`, `…ApprovalTimingTests`, `…VersionSizeTests`) go with the code they tested, and
  their route-level checks are rewritten as `IntegrationReclaimerrRoutesTests`. Both suites build their tag cache without
  the Leaving soon service: an action's background publish raced the fixture's cleanup once ("Directory not empty").
- Filed as found bugs, not fixed here: the same background-publish race can hit the Maintainerr action suite; and
  `MaintainerrHttp.Describe` says "not a Maintainerr collections answer" for any unreadable answer, Reclaimerr's included.
