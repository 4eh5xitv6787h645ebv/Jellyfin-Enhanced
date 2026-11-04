# Evidence pack, round 3

State: commit 62617d57 on `feat/media-tags-features` (six commits on top of dd6572be). Since the previous review state (87894421):

1. **9432f352 fix(tags): count only real language options and read edition words after the title**: commentary/audio-description audio and forced-only subtitle languages no longer count; flags for Norwegian Bokmål/Nynorsk, Cantonese, Swiss German, Irish; edition words and CAM/TS/TC/SCR only after the title (`Uncut Gems (2019)`, `The.Final.Cut.2004`, `CAM.2018`, an episode titled "The Director's Cut" carry no label). Schema 25.
2. **b33d113a fix(tags): let tag look rules reveal groups that are hidden by default on native posters**: both native request gates now admit rule-bearing settings (`MayShowTags`); request-path test through the real stamper.
3. **62617d57 feat(tags): show each track's real channel layout and trust known video dimensions**: per-track layouts (quad PCM → PCM 4.0, DTS-ES 6.1 → DTS 6.1, mono → 1.0; unusual counts without a layout show no number), dimensions-first resolution, multi-version wording in the docs. Schema 26, resolver 14, web naming 8.
Details: `feature-inventory.md` section 8.

## Verification at 62617d57 (full set, this machine, niced and capped)
- Frontend 2064/2064; backend 2171/2171; browser (three projects, 2 workers) 399/399; both Release builds 0 warnings; translations validator pass (English); inventory current; `git diff --check` clean (an EOF blank line found by the run was fixed before the commit); attribution grep empty.
- Parity `--offline` (`LANG=en_US.UTF-8`): 0 differences (`parity-summary.txt`).
- Known pre-existing: `build_poster_assets.py --check` reports only the age-rating-colours drift.

## Lab (real Jellyfin 12.1)
- Legacy viewer (settings saved before layouts) Home and Movies: AE = 0 on the documented 1400×660+0+90 crop against a dd6572be deploy. (Full frame differs by 8 pixels in the header's random-item dice icon, which shows a random face on every load; it is outside the card area and identical between builds otherwise.)
- `shots/native-reveal-pair.png`: real-admin with every group set to Hidden in Corners and one rule "Movie → Quality top left". Left: a movie's native poster with the Quality group revealed (preview header `X-JE-Poster-Tags-Look: rule:1`). Right: a series, which no rule matches, with no tags (`any-group: false`). Settings were put back after the capture.
