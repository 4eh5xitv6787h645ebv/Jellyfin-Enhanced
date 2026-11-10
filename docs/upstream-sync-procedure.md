# Upstream sync procedure

For a coding agent catching the rewrite up with upstream (`n00bcodr/Jellyfin-Enhanced`). The codebase rules are in
[AGENTS.md](../AGENTS.md); the lab, evidence, test loop and gates are the `je12` skill. This page adds only what is
specific to a port. Never push, and never contact upstream.

## The loop

1. `python3 scripts/upstream_sync.py update` fetches upstream (read-only), appends the commits missing from the
   ledger [`upstream-sync.json`](upstream-sync.json) as `pending`, and prints the work list, oldest first.
2. Take the oldest `pending` entry. Read its whole diff and correct the guessed `class` and `features`. Commits that
   are one behaviour (a fix and its test update) go together: set `"with": "<lead sha>"` on the followers.
3. Decide its status (below). For a port, follow the skill from "Show the problem" to "Finish".
4. One commit per entry or group, with the ledger entry in it. Afterwards `python3 scripts/upstream_sync.py resolve`
   fills `rewriteCommits` from the trailers; commit that with the next port.
5. `je12 gate final` at least every ten ports and on the last commit. `upstream_sync.py check` must pass.

## Status

| Status | When | The entry must say |
|---|---|---|
| `ported` | The behaviour is re-implemented here and proved. | `notes`: every deliberate difference from upstream. |
| `already-present` | The rewrite already behaves this way, checked by a test or a lab run, not by text. | `evidence`. |
| `not-applicable` | It has no meaning here: Jellyfin 10.11 compatibility, a file the rewrite generates or lacks. | `reason`. |
| `deferred` | It applies but cannot be finished now. | `reason`, and `needs`: what unblocks it. |

Hard is not `not-applicable`, and an entry you have read does not stay `pending`: `check` fails when a `pending`
entry is older than `policy.maxPendingDays`.

## A port

- **Behaviour, not text.** Code goes where AGENTS.md puts it, written as its neighbours are. Where upstream's change
  has a bug or a weaker pattern than AGENTS.md allows, port the intent correctly, say so in `notes`, and file the
  upstream fault with `je12 found-bug`.
- **What transfers.** The C# files were moved, not rewritten, so an upstream C# hunk often applies with a path
  change (`git show <sha> -- <old> | sed 's#<old>#<new>#g' | git apply --3way`); so do locale files and most docs.
  Upstream's tests load the built `js/` files by the same names and translate with new imports and namespaces.
  Client code never transfers: re-implement it. A new setting also needs its line in the What's New index and in
  `tests/fixtures/admin-config-baseline.json` (`docs/rewrite/admin-config.md`).
- **Parity proof.** Translate upstream's new tests first and watch them fail before the port. For anything a user
  can see, run one `je12 browse` or `je12 api` command against both builds:
  `JE12=<je12 script> scripts/upstream_lab_deploy.py <upstream sha>` puts upstream on the lab (`--keep before`),
  `je12 deploy` puts the rewrite back (`--keep after`). `je12 evidence` holds one pair, so copy each pair into the
  step log, and record what could not be compared. Get lab box sets from `je12 env content --collections`: creating
  a collection by API starts a library scan that removes the lab's file-less items.
- **Commit format.** `feat(<feature>): …` or `fix(<feature>): …`, with one trailer per upstream commit covered,
  `Upstream: <full sha>`. No AI attribution. `je12 regen` before each commit.
- **Contract changes.** A new route, authorization or registration follows "Routes, auth, DI registration" in the
  skill's `references/gates.md`. The snapshot and baseline additions go in one separate commit at the end of the
  branch, `contract: upstream sync additions`, additions only, listed in the step log. Never set
  `JE_UPDATE_SNAPSHOTS`.
- **Releases.** The version and `manifest.json` follow upstream's latest release in one final commit. Nothing is
  published.

The step log goes in `artifacts/restructure-plan/step-logs/`: the gap before and after, the table, the parity
evidence, the gate results (`je12 evidence`), found bugs and what is deferred.
