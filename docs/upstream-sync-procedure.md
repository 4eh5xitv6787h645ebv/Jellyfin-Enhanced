# Upstream sync procedure

For a coding agent catching the rewrite up with upstream (`n00bcodr/Jellyfin-Enhanced`). The codebase rules are in
[AGENTS.md](../AGENTS.md); the lab, evidence, test loop and gates are the `je12` skill (`SKILL.md` and its
`references/`). This page only adds what is specific to a port. Never push, and never contact upstream.

## The loop

1. `python3 scripts/upstream_sync.py update` fetches upstream (read-only), appends the commits the ledger
   [`upstream-sync.json`](upstream-sync.json) does not list as `pending`, and prints the work list, oldest first.
2. Take the oldest `pending` entry. Read its whole diff (`git show <sha>`) and correct the guessed `class` and
   `features` in the ledger. Entries that are one behaviour (a fix and its test update) are ported together: set
   `"with": "<lead sha>"` on the followers.
3. Decide its status (table below). If it is a port, follow the je12 skill from "Show the problem" to "Finish".
4. Commit once per entry or group, with the ledger entry in the same commit, then
   `python3 scripts/upstream_sync.py resolve` (it fills `rewriteCommits` from the trailers; commit that with the next
   port or the closing commit).
5. `je12 gate final` at least every ten ports and on the last commit. `python3 scripts/upstream_sync.py check` must pass.

## Status

| Status | When | The entry must say |
|---|---|---|
| `ported` | The behaviour is re-implemented here and proved. | `notes`: every deliberate difference from upstream. |
| `already-present` | The rewrite already behaves this way. Check by behaviour (a test or a lab run), not by text. | `evidence`: the test name or recorded output. |
| `not-applicable` | The change has no meaning here: Jellyfin 10.11 compatibility, a file the rewrite generates or does not have, upstream's own release mechanics. | `reason`. |
| `deferred` | It applies, but cannot be finished now. | `reason`, and `needs`: exactly what unblocks it. |

Do not use `not-applicable` for something that is merely hard, and do not leave an entry `pending` once you have
looked at it. `check` fails when a `pending` entry is older than `policy.maxPendingDays`.

## A port

- **Behaviour, not text.** TypeScript in the owning feature folder, C# in the owning `Features/<Feature>/` folder,
  settings, strings and routes as the neighbouring code does them. Where upstream's change has a bug or a weaker
  pattern than AGENTS.md allows, port the intent correctly, say so in `notes`, and file the upstream fault with
  `je12 found-bug`.
- **What usually transfers as is.** The C# files were moved, not rewritten, so an upstream C# hunk often applies
  with a path change (`git show <sha> -- <old path> | sed 's#<old path>#<new path>#g' | git apply --3way`); so do
  locale files and most docs. Upstream's tests load the built `js/` files by the same names, so they translate
  with new imports and namespaces. Client code never transfers: re-implement it. A new setting also needs a line
  in the What's New index and `tests/fixtures/admin-config-baseline.json` (see `docs/rewrite/admin-config.md`).
- **Parity proof.** Tests first: translate upstream's new tests into the rewrite's test folders and watch them fail
  before the port. For anything a user can see, run the same `je12 browse` or `je12 api` command against an upstream
  build of that commit and against the rewrite, with `--keep`: `JE12=<je12 script> scripts/upstream_lab_deploy.py <upstream sha>` puts the
  upstream build on the lab (`--keep before`), `je12 deploy` puts the rewrite back (`--keep after`). `je12 evidence`
  holds one pair, so copy each port's pair into the step log. Record what could not be compared and why. In a lab,
  get box sets from `je12 env content --collections`: creating the first collection by API starts a library scan
  that removes the lab's file-less items.
- **Commit format.** `feat(<feature>): …` or `fix(<feature>): …` as in the history, and one trailer line per upstream
  commit covered:

  ```
  Upstream: <full sha>
  ```

  No AI attribution. `je12 regen` before each commit.
- **Contract changes.** A new route, a changed authorization or a new registration follows "Routes, auth, DI
  registration" in the skill's `references/gates.md`: implement it, list the exact additions, and leave the snapshot
  and baseline additions for one separate commit at the end of the branch, `contract: upstream sync additions`,
  containing additions only, with the list in the step log. Never set `JE_UPDATE_SNAPSHOTS`.
- **Releases.** The version and `manifest.json` follow upstream's latest release in one final commit. Nothing is
  published.

The step log of each catch-up goes in `artifacts/restructure-plan/step-logs/`: the gap before and after, the table,
the parity evidence, the gate results (`je12 evidence`), found bugs and what is deferred.
