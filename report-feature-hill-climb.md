# Report: Media Tags feature hill climb

**Branch:** `feat/media-tags-features`, worktree `/home/jake/je-wt/features`, pushed to origin.
- **Commit range:** dd6572be..589047d2 (115 commits, 112 of them non-merge).
- **Merges:** e2de2026 brought in `feat/media-tags-redesign` at b06ad527 (the polished settings UI). Two merges of upstream are also in the range.
- **No PR was opened:** the coordinator decides how this branch lands.

**Rounds run:** 1 to 23. Jake stopped the climb after round 23.
- **Seats:** Sol, Opus and Astra review every round from round 6. In rounds 2–5 only Sol scored, under the original gating rule. Fable joined rounds 5, 10, 15 and 20.
- **Full-verification rounds:** 6, 9, 12, 15, 18, 21 and 23.
- **Final state** (round 23, full set at 589047d2):

  | Check | Result |
  |---|---|
  | Frontend | 2507/2507 |
  | Backend | 2580/2580 |
  | Browser (Chromium, mobile Chromium, Firefox) | 438/438 |
  | jf12 and jf10 Release builds | 0 warnings |
  | Parity `--offline` | 0 differences (299 profiles × 386 entries) |
  | Translations, inventory, poster assets, `git diff --check` | pass |
  | Attribution grep | only the two known upstream merge commits (a8f8f666, bd62b215) |
- **Lab je-lab-centres** (http://127.0.0.1:18537): legacy viewer Home AE = 0 against the round-6 capture. On Movies the tags are identical; the only differing pixels are the header's random dice icon, which varies per load.
- **Lab restore** from `.notes/lab-snapshot/centres-before.tar` (container stopped, files replaced, container started):
  - **User files:** all four (two users' `settings.json` and `hidden-content.json`) match the snapshot byte for byte.
  - **Plugin XML:** restored byte for byte, but every start of this branch's plugin runs its startup task, which re-saves the configuration. That adds the 55 settings this branch introduced, at their defaults, and moves `ClearTranslationCacheTimestamp`. Every value the snapshot holds is otherwise unchanged (`diff`: 1 line changed, 56 added).
  - **Byte-identical XML:** not achievable while the lab runs HEAD. The snapshot's copy is still in the tar, if the lab goes back to the base plugin.
  - The lab is left running the deploy of 589047d2.
- **Ledger:** `.notes/council/ledger.md` holds every round's findings in full, with each seat's reports in `.notes/council/round-<n>-<seat>.md`. The evidence packs are on fork branch `evidence/features` (`round-1` … `round-23`).

## Overall score per round (seat by seat)

| Round | Sol | Opus | Astra | Fable |
|---|---|---|---|---|
| 1 | 7 | 7 | 7.5 | not run |
| 2 | 7.5 | no score | no score | not run |
| 3 | 7.5 | no score | no score | not run |
| 4 | 7.5 | no score | no score | not run |
| 5 | 7.5 | no score | no score | 8 |
| 6 | 8 | 7.5 | 8 | no score |
| 7 | 8 | 7.5 | 7.5 | no score |
| 8 | 7.5 | 7.5 | 8 | no score |
| 9 | 8 | 7.5 | 7.5 | no score |
| 10 | 7.5 | 7.5 | 7.5 | 7.5 |
| 11 | 8 | 8 | 8 | no score |
| 12 | 8 | 7.5 | 8 | not run |
| 13 | 8 | 7.5 | 7.5 | not run |
| 14 | 8 | 8 | 7.5 | not run |
| 15 | 8 | 7.5 | 8 | 8 |
| 16 | 8 | 7.5 | 8 | not run |
| 17 | 7.5 | 7.5 | 8 | not run |
| 18 | 7.5 | 7.5 | 7.5 | not run |
| 19 | 8 | 8 | 8 | not run |
| 20 | 8 | 8 | 7.5 | 8 |
| 21 | 8.5 | 8 | 8.5 | not run |
| 22 | 8.5 | 8 | 8.5 | not run |
| 23 | 8.5 | 8.5 | 8.5 | not run |


Scores rose from 7 / 7 / 7.5 at the baseline to 8.5 / 8.5 / 8.5 in round 23, the first round with every seat at 8.5.

## Per-category scores, every round

C1 Completeness · C2 Detection · C3 Configurability · C4 Native/TV parity · C5 Performance and scale · C6 Reliability · C7 Interoperability · C8 Documentation · C9 Tests · C10 Internationalisation · C11 Settings consistency · C12 Interaction correctness. C10 scored translation completeness in rounds 1–20 (marked * in round 20) and only code-side readiness from round 21, so the two are not comparable. C11 and C12 exist from round 21.

### Review round 1 (baseline, dd6572be)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 7.5 | 5.5 | 8.5 | 7 | 7 | 7 | 8 | 8.5 | 8.5 | 4 | 7 |
| Opus | 7.5 | 6 | 7.5 | 7.5 | 5.5 | 8 | 7 | 8 | 8 | 4.5 | 7 |
| Astra | 8 | 6 | 8 | 7 | 7.5 | 7.5 | 8 | 8 | 8.5 | 5 | 7.5 |

### Review round 2 (87894421; Sol only, gating: Sol lowest 4 < 9)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7 | 8.5 | 7.5 | 7.5 | 8 | 8 | 8.5 | 9 | 4.5 | 7.5 |
| Opus | no score | | | | | | | | | | |
| Astra | no score | | | | | | | | | | |

### Review round 3 (62617d57; Sol only, gating: Sol lowest 4 < 9; plateau count 1: overall 7.5 → 7.5)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7 | 8.5 | 8 | 7.5 | 8 | 8 | 8.5 | 9 | 4 | 7.5 |
| Opus | no score | | | | | | | | | | |
| Astra | no score | | | | | | | | | | |

### Review round 4 (a90658ff; Sol only; plateau count 2: overall 7.5 → 7.5 → 7.5)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 7.5 | 8.5 | 7.5 | 7.5 | 8 | 8 | 8 | 9 | 4.5 | 7.5 |
| Opus | no score | | | | | | | | | | |
| Astra | no score | | | | | | | | | | |

### Review round 5 (19c16f34; Sol + Fable; plateau count 3: Sol overall 7.5 for rounds 2–5 → all three seats from round 6)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7.5 | 8.5 | 8 | 7 | 8 | 8 | 8.5 | 9 | 4 | 7.5 |
| Fable | 8.5 | 8 | 8 | 7.5 | 7.5 | 8.5 | 8 | 7.5 | 8.5 | 6.5 | 8 |
| Opus | no score | | | | | | | | | | |
| Astra | no score | | | | | | | | | | |

### Review round 6 (d1eb89cc; Sol + Opus + Astra, plateau rule; full verification round)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8 | 8.5 | 8.5 | 7.5 | 8 | 8.5 | 8.5 | 9 | 4 | 8 |
| Opus | 8 | 7.5 | 7.5 | 7.5 | 6.5 | 8 | 7.5 | 8 | 8.5 | 5 | 7.5 |
| Astra | 8.5 | 7.5 | 8.5 | 8.5 | 7.5 | 8 | 8 | 9 | 8.5 | 5 | 8 |
| Fable | no score | | | | | | | | | | |

### Review round 7 (f3b837fa; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7.5 | 8.5 | 8 | 8 | 8 | 8.5 | 8.5 | 9 | 4 | 8 |
| Opus | 8.5 | 8 | 7.5 | 8.5 | 6.5 | 8 | 7.5 | 8 | 9 | 5 | 7.5 |
| Astra | 8 | 7 | 8.5 | 8 | 7.5 | 7 | 8 | 8 | 8.5 | 4.5 | 7.5 |
| Fable | no score | | | | | | | | | | |

### Review round 8 (e53fb940; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7.5 | 8.5 | 8 | 7.5 | 7.5 | 8 | 8.5 | 8 | 4.5 | 7.5 |
| Opus | 8 | 7 | 8 | 8 | 6 | 7.5 | 7.5 | 8 | 8.5 | 5.5 | 7.5 |
| Astra | 8 | 8 | 8.5 | 8 | 7 | 8.5 | 8.5 | 8.5 | 9 | 4.5 | 8 |
| Fable | no score | | | | | | | | | | |

### Review round 9 (c95d1173; Sol + Opus + Astra; full verification round)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8 | 8.5 | 9 | 7.5 | 8 | 8.5 | 9 | 9 | 4.5 | 8 |
| Opus | 8.5 | 8 | 8.5 | 8 | 6.5 | 8 | 7.5 | 8 | 8.5 | 5 | 7.5 |
| Astra | 8.5 | 7.5 | 8.5 | 8 | 7.5 | 8 | 8 | 8 | 8.5 | 4 | 7.5 |
| Fable | no score | | | | | | | | | | |

### Review round 10 (42dae8e8; Sol + Opus + Astra + Fable)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 7.5 | 8 | 8 | 7.5 | 8 | 8 | 8.5 | 9 | 4 | 7.5 |
| Opus | 8.5 | 8 | 7.5 | 8.5 | 6 | 7 | 8 | 7.5 | 9 | 5 | 7.5 |
| Astra | 8 | 7.5 | 8.5 | 8 | 7.5 | 7.5 | 8 | 8 | 8.5 | 4.5 | 7.5 |
| Fable | 8 | 7.5 | 7 | 8.5 | 6 | 7.5 | 7.5 | 7 | 8 | 6.5 | 7.5 |

### Review round 11 (dc56ac6a; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8 | 8.5 | 8.5 | 7.5 | 8 | 8.5 | 9 | 9 | 4.5 | 8 |
| Opus | 8.5 | 7.5 | 8.5 | 9 | 7 | 8.5 | 8 | 8 | 8.5 | 6 | 8 |
| Astra | 8.5 | 8 | 8.5 | 8.5 | 8 | 8.5 | 8 | 8.5 | 9 | 4.5 | 8 |
| Fable | no score | | | | | | | | | | |

### Review round 12 (d03fc1b3; Sol + Opus + Astra; full verification round)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8.5 | 8.5 | 8.5 | 7.5 | 8 | 8.5 | 8.5 | 9 | 4 | 8 |
| Opus | 8.5 | 8.5 | 7.5 | 7.5 | 6 | 8 | 7.5 | 8.5 | 8.5 | 5.5 | 7.5 |
| Astra | 8.5 | 8 | 8.5 | 8 | 7 | 7.5 | 8 | 8.5 | 9 | 5 | 8 |

### Review round 13 (e8a4f166; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8 | 9 | 8.5 | 7 | 8.5 | 8.5 | 9 | 9 | 4.5 | 8 |
| Opus | 8 | 7.5 | 7.5 | 8 | 6 | 7.5 | 7.5 | 8 | 8.5 | 6 | 7.5 |
| Astra | 8 | 8 | 8.5 | 8 | 7 | 7.5 | 8 | 8.5 | 9 | 4.5 | 7.5 |

### Review round 14 (7fd9a67f; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8 | 8.5 | 8.5 | 7 | 8.5 | 8.5 | 9 | 9 | 4.5 | 8 |
| Opus | 8.5 | 8.5 | 8 | 8.5 | 6.5 | 8.5 | 8 | 8 | 8.5 | 5 | 8 |
| Astra | 8 | 7.5 | 8.5 | 8 | 7 | 7 | 8 | 8.5 | 8.5 | 4 | 7.5 |

### Review round 15 (f5f8588f; Sol + Opus + Astra + Fable; full verification round)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8 | 9 | 8 | 7.5 | 8.5 | 8 | 8.5 | 9 | 4.5 | 8 |
| Opus | 8.5 | 8.5 | 8 | 8.5 | 6 | 8.5 | 7.5 | 8 | 9 | 5 | 7.5 |
| Astra | 8.5 | 8 | 8.5 | 8 | 7.5 | 8 | 8 | 8.5 | 9 | 5 | 8 |
| Fable | 8 | 8 | 8.5 | 8 | 6.5 | 8 | 7.5 | 8 | 9 | 6 | 8 |

### Review round 16 (fcf81283; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8 | 8.5 | 8 | 7 | 8.5 | 8 | 9 | 9 | 4.5 | 8 |
| Opus | 8.5 | 8.5 | 7.5 | 8 | 6.5 | 8.5 | 7.5 | 8 | 8.5 | 5 | 7.5 |
| Astra | 8.5 | 8 | 8.5 | 8 | 7 | 8.5 | 8 | 8.5 | 8.5 | 4.5 | 8 |

### Review round 17 (19a0f094; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8 | 8.5 | 8.5 | 7 | 7.5 | 8 | 8.5 | 8.5 | 4.5 | 7.5 |
| Opus | 8.5 | 8 | 7.5 | 8 | 6 | 8 | 7 | 7.5 | 8.5 | 4.5 | 7.5 |
| Astra | 8.5 | 8 | 8.5 | 8.5 | 7 | 8.5 | 8 | 8.5 | 9 | 5 | 8 |

### Review round 18 (e8351a3c; Sol + Opus + Astra; full verification round)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8 | 8 | 8 | 7.5 | 7.5 | 8.5 | 8.5 | 9 | 3.5 | 7.5 |
| Opus | 8 | 7.5 | 8 | 8 | 6 | 8 | 7 | 8 | 8 | 5 | 7.5 |
| Astra | 8 | 8 | 8.5 | 8 | 7 | 8 | 8 | 8.5 | 9 | 4 | 7.5 |

### Review round 19 (62b4c62b; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8 | 9 | 8.5 | 7.5 | 8.5 | 8.5 | 9 | 9 | 4 | 8 |
| Opus | 8.5 | 9 | 8 | 8 | 6 | 8 | 7.5 | 8 | 9 | 6 | 8 |
| Astra | 8 | 8 | 8.5 | 8.5 | 7 | 8 | 8 | 9 | 9 | 5 | 8 |

### Review round 20 (d8a8767e; Sol + Opus + Astra + Fable; includes merge e2de2026 of the polished settings UI)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8 | 8.5 | 8.5 | 8 | 7 | 8.5 | 8 | 8.5 | 9 | 4* | 8 |
| Opus | 8.5 | 8.5 | 8 | 8.5 | 6.5 | 8.5 | 7.5 | 8 | 9 | 5.5* | 8 |
| Astra | 8.5 | 8 | 8.5 | 8 | 7 | 6 | 7.5 | 8 | 8.5 | 4* | 7.5 |
| Fable | 8 | 8.5 | 8.5 | 8.5 | 7.5 | 8 | 8 | 8.5 | 9 | 7* | 8 |

### Review round 21 (82632b93; Sol + Opus + Astra; 12 categories; C10 now code-side i18n only)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8.5 | 8.5 | 8 | 7.5 | 8.5 | 8.5 | 9 | 8.5 | 7.5 | 8 | 8.5 | 8.5 |
| Opus | 8.5 | 9 | 8 | 7.5 | 7 | 8.5 | 8.5 | 8 | 9 | 7 | 7.5 | 8 | 8 |
| Astra | 8.5 | 9 | 8.5 | 8 | 7 | 9 | 8.5 | 8.5 | 8.5 | 8 | 8 | 8.5 | 8.5 |

### Review round 22 (12d9d26f; Sol + Opus + Astra)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 9 | 9 | 8.5 | 7.5 | 9 | 8.5 | 9 | 9 | 7.5 | 9.5 | 9.5 | 8.5 |
| Opus | 8.5 | 9 | 8 | 8 | 7 | 8.5 | 8 | 8 | 9 | 6 | 8.5 | 8 | 8 |
| Astra | 8.5 | 8.5 | 9 | 8.5 | 7.5 | 9 | 8.5 | 9 | 9 | 8 | 9 | 9 | 8.5 |

### Review round 23 (589047d2; Sol + Opus + Astra; full verification round; LAST round: Jake stopped the climb after it)

| Seat | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | Overall |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sol | 8.5 | 8.5 | 8.5 | 9 | 8 | 9 | 8.5 | 9 | 9 | 8.5 | 9 | 8 | 8.5 |
| Opus | 8.5 | 9 | 8.5 | 9 | 7.5 | 9 | 8.5 | 8.5 | 9 | 8.5 | 8.5 | 9 | 8.5 |
| Astra | 8.5 | 8.5 | 9 | 8 | 8 | 9 | 8.5 | 9 | 9 | 8 | 9 | 9 | 8.5 |


## Capabilities built, by round

Each round's commits, schema/resolver/naming versions and verification are in the ledger. Summary:

- **Round 1** (cf12417e, fc076486, 87894421): structured quality detection with a shared truth table, native look rules, and MDBList last-good retention.
- **Round 2** (9432f352): commentary and audio-description tracks no longer count as dubs; forced-only subtitles excluded; more flags; edition and CAM words only after the title.
- **Round 3** (a2df4a14): locale-aware scores (web Intl, native table, parity profiles) and localised language names in tooltips.
- **Rounds 4–5:** detection and native follow-ups (see the ledger).
- **Round 6** (28b3770e, 2c78ff1b, d1eb89cc): JOC/DTS-HD/height layouts, CJK commentary, editions and original-title naming; native schedule batches; regenerated age-rating colours.
- **Round 7** (6e4f1701, 50e72969, f3b837fa): TRaSH sound order and a lossy channels-first rank, width-aware SD/ultrawide buckets, VideoRange fallback, XviD/DivX; child scores only borrowed when an item has none; native award captions; LTR shaping of digit-only RTL text.
- **Round 8** (5280c9d3, 11a8c264, e53fb940): Complete Season needs TMDB proof; series-only edits patch child scores; UAX#9 bidi for native text.
- **Round 9** (7f11b9fb, d2c97c6e, adad9b24, c95d1173): episode coverage, codec-bounded titles, bidi brackets, inventory regeneration.
- **Round 10** (c538f785, 0f67e237, 42dae8e8): channel/carrier bounds, episode ranges through the memo, disc source and 3D, coverage counts.
- **Round 11** (6dd03dda, 4a54a7aa, 1fae690a, dc56ac6a): truthful version-0 sound; enrichment publishes stop bumping the cache version; container languages for restricted users; more editions and sources.
- **Round 12** (12ea0b4f, 927e9232, 0dfe64ed, f8c9d238, 95a218d6, d03fc1b3): evidence boundaries, flag-less languages as code chips, tab docs links, compression measured and documented.
- **Round 13** (0e241c2e, 8cbdaf79, 6d2e19ae, e8a4f166): delta tombstones; version pick per account; DV+HDR10 titles; a bounded MDBList wait.
- **Round 14** (01324f41, 15341394, 7fd9a67f): RatingsPending with a browser retry; alternate-version aggregation; episode markers; more sources and editions; a native status grace bucket.
- **Round 15** (b880f3af, 7e21fc69, f5f8588f): naming composition; RatingsRefreshAt; Spoiler Guard keeps legacy audio.
- **Round 16** (00c6467f, fcf81283): first-time inherited genres; first probed version and newest probed; URL/remote naming; 8K width; HDRip/PPV/R5/WORKPRINT.
- **Round 17** (b4b3aa0f, 19a0f094): season and episode review chips in cache mode and natively; source summarised across episodes.
- **Round 18** (8da6c8f7, c1d35499, e8351a3c): a direct-play media fingerprint; source ranking over every version; 1080i; DV SDR.
- **Round 19** (72bdc0c5, 27b008c7, 645228bb, 365ed785, 9da0e4e4, 62b4c62b): a per-version media Revision keying direct play; 576i/480i; season genres own-first; flags from canonical codes; RTL physical positions; a parity CI job.
- **Round 20** (15b7ba49, 90f796b0, b53fc125, 663fb3d9): Revision covers every device-profile input; DTS profile precedence; access-only reconcile (`known`, `filterBase`, `visible`); native composite key without the Status bucket.
  - Then merge e2de2026 (the polished settings UI) and d8a8767e.
- **Round 21** (59a1fcbd, 52ecceea, 7262da5b, 82632b93), from Jake's demo review:
  - monotonic fitting (web and native);
  - "Where to show" for every group;
  - Edit only where there are settings;
  - wrapping Quick links.

  Three standing CI guards were added: `tag-fit-monotonic`, `settings-matrix` and `settings-overflow`, the last two over the shared settings fixture.
- **Round 22** (cefa8fbb, 94dfd174, ebeb3be0, 28a75bb2, 9fab10c0, 12d9d26f):
  - Rating's "Where to show" truly inherits;
  - the access reconcile re-sends access-dependent parents;
  - title-only Spoiler Guard keeps track roles and revisions;
  - one direct-play input list, and the picked version is asked about;
  - CLDR plural forms on the web and on posters.
- **Round 23** (66879a57, 405f02dd, ce983282, 4feb5f1e, a0cec782, 4078f430, 185bcddc, 589047d2):
  - Media Tags editors and samples translated, numeric counts, runtime and age units from locale keys, and a strings guard;
  - 1.43 reads `1.43:1` (resolver 39);
  - round-22 review fixes;
  - bounded full loads: a paged `tag-cache?limit=&after=`, a catch-up delta, and memory released once the stored copy commits;
  - a reproducible 50k/100k benchmark.

## Declined, out of scope or not acted on

- **Locale translation:** translation completeness of non-English locale files is out of scope (Weblate), on Jake's instruction from round 20. From round 21, category 10 scored code readiness only. No locale file other than `en.json` was edited.
- **Flags:** Welsh and Scottish flags need a full flag-asset regeneration; noted only.
- **PR:** none opened, on the coordinator's instruction. The brief's draft-PR step (`gh pr create … --base feat/media-tags-redesign`) was not run.
- **Stale reports:** findings that later rounds' code had already fixed were recorded and not re-acted on (see the ledger).

## Left (open findings at round 23, ranked by the seats)

1. **Large libraries (C5, 3/3).**
   - Cards render only after the last page of a full load. Visible-first hydration is not built.
   - Without a stored copy (private mode, storage blocked), every entry stays in memory.
   - Server side (Opus probe): about 470 MiB per 50k real entries; the snapshot is rewritten whole on each change burst; each page re-sorts every key; there is no server benchmark.
2. **Rules and data sources (C1/C3/C7).**
   - Composable fact-based rules for custom tags and looks (resolution/HDR/audio/language/rating predicates with all/any/not), and portable rule intent (Sol, Astra).
   - Rating sources the server already fetches but drops: MyAnimeList, Roger Ebert, Metacritic user, the MDBList score (`Model/TagSourceRatings.cs:28-32`); per-library source choice.
   - More award ribbons and categories (`AwardTagsService.cs:134-141`).
   - Radarr/Sonarr file facts and TRaSH custom formats (Opus).
3. **Native Summary and Minimal resting looks (C4).** They fall back to Corners with Full labels.
4. **i18n defects (C10).**
   - `JE.t` substitutes with `String.replace` replacement patterns, so `$&` or `$$` in a value is mangled (Opus).
   - Some admin-page dates and counts follow the browser locale instead of JE's language.
   - Preview dates and runtime bypass locale formatting (Sol).
5. **Detection (C2).**
   - No Dolby Vision profile fallback when the range type is unknown (Astra).
   - `UHDRemux`, localised edition words, combined editions, `LaserDisc`, legacy codes shown as `IW`/`IN` (Opus).
   - AC-4, ALAC and MPEG-H have no codec labels.
6. **Settings and preview polish (C11/C12).**
   - Awards shows Seasons, Episodes and Next Up switches that can never apply.
   - The limit stepper has three accessible names.
   - "All" is offered per group without a stated reason.
   - The preview can show an `AAC 2.0` chip the detector never produces.
   - A 3px hub preview overflow at 1400px when every word is 40% longer.
   - Docs drift: tags.md:231 and the Colours tab description.
7. **Tests (C9).** No WebKit browser project (the iOS apps run the overlays in WebKit), and the item-editor guard checks only that rows exist.
8. **Stateless Rating migration (Opus, round 22).** An old seeded Rating "off" that copied the server's value still counts as the user's own.
