# Evidence pack, round 8

State: commit e53fb940 on `feat/media-tags-features` (twenty-three commits on top of dd6572be, the base of this work). Commits since f3b837fa (the last reviewed state):

1. **5280c9d3 fix(tags): claim Complete Season and Series Finale only with proof**
   - Complete Season requires TMDB's episode count for the season (new `seasonEpisodes` in `status-tags/series`, parsed from TMDB `tv/{id}` `seasons`), every episode of it aired (no next episode in the season; the latest aired is its last or in a later season), and the library holding that many episodes up to the last one, all added within the window. Without TMDB facts, with an episode still to air, a missing episode, or fewer files than episodes, no completion is claimed and the next badge applies. Web (`seasonComplete`) and native (`StatusRules.SeasonComplete`) share the rule; parity status fixtures cover complete, later-season-airing, no-TMDB, one-of-ten, future episode and missing middle.
   - Series Finale uses TMDB's final regular episode before the library's latest (local S1E3 of an ended ten-episode season is no finale); the library aggregate only fills in when TMDB names none. Native resolver 20.
2. **11a8c264 fix(tags): carry a series' new scores and age rating to its children**
   - A series-only edit that changes its scores or age rating reapplies inheritance to its cached seasons and episodes from their own metadata (no media reads), on the same flush or reconcile; children with their own values keep them. Test: full build, series 8/90/TV-14 → 5/20/TV-MA, flush → season and episode follow, an episode with its own critic score and rating keeps them, on-demand agrees.
3. **e53fb940 fix(tags): lay out mixed-direction native text with the Unicode bidi rules**
   - Native tag text goes through UAX #9 (first-strong paragraph direction, weak/neutral resolution, implicit levels, reordering) before font segmentation; each run is shaped in its own direction. `שלום 12` draws as `12 םולש` (glyph-level test through the real layout), Latin inside RTL keeps its order, Arabic dates keep day/month order, digit-only strings stay LTR.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at e53fb940 (this machine, niced and capped)
- Frontend 2191/2191; backend 2288/2288; parity `--offline` 0 differences including the status fixtures (`parity-summary.txt`); jf12 Release build 0 warnings. Browser (399/399 at f3b837fa per the previous reviews) and the jf10 build run again in the full set in round 9.
- `translation-coverage.md`: Media Tags strings per locale; new strings are English-only until Weblate translators reach them (the repository's Translation Checks CI rejects a locale file with any missing key).

## Lab
- Legacy viewer (settings saved before layouts), deploy of e53fb940: Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture, on the 1400×660+0+90 crop.
