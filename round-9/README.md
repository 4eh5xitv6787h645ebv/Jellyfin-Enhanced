# Evidence pack, round 9

State: commit c95d1173 on `feat/media-tags-features` (twenty-eight commits on top of dd6572be, the base of this work). Commits since e53fb940 (the last reviewed state):

1. **6c486212 test(tags)**: the browser Bands fit test measured "Complete Season" without the TMDB counts that label now needs (it failed at e53fb940 in all three browser projects); it now measures Season Premiere, the same length.
2. **7f11b9fb fix(tags): prove Complete Season by episode coverage and finales by TMDB**
   - Seasons record which episode numbers the library covers (`SeasonAddedSpan.CoveredThrough`: the highest N with every episode 1..N; a multi-episode file covers its `IndexNumberEnd` range; duplicates count once). Complete Season needs coverage through TMDB's episode count, so 1,1,3..10 or 1,3..11 never claim completion. Seasons over 100 episodes use the bounded lookup, leave coverage unknown and claim nothing.
   - Series Finale: when TMDB names no regular final episode, the library's latest episode only stands in if TMDB's per-season counts show it is the last episode of the last season (an ended series with local S1E3 and no TMDB identity shows no finale). Cache schema 32, resolver 21.
3. **d2c97c6e fix(tags): never let a track title contradict its stream codec**
   - A title can refine its stream codec's carrier (DTS → DTS-HD MA, E-AC-3 → DD+ ATMOS) but never change it: AC-3 "English Atmos" → Dolby Digital 5.1; AAC "Original DTS mix" → bare 5.1; AAC stereo titled "TrueHD Atmos 7.1" → no sound chip. An unreported codec still lets the title decide. Shared carrier table on web and native; truth table 69 cases. Cache schema 33, resolver 22, web naming 13.
4. **adad9b24 fix(tags): resolve bracket pairs in native bidi text and refresh on-demand children**
   - Native bidi adds UAX #9 N0 (paired brackets): `שלום (HDR) 4K` → `4K (HDR) םולש`; `abc (שלום) def` unchanged.
   - Cache off: a series edit drops its seasons' and episodes' entries from the native 15-minute on-demand memo (test raises the real ItemUpdated event).
5. **c95d1173 test**: production inventory lists the two new service files.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at adad9b24 + c95d1173 (full set, this machine, niced and capped)
- Frontend 2205/2205; backend 2303/2303; browser (Playwright, three projects) 399/399; parity `--offline` 0 differences (`parity-summary.txt`); jf12 and jf10 Release builds 0 warnings; poster asset check OK; production inventory current (after c95d1173); `git diff --check` clean.
- `translation-coverage.md`: Media Tags strings per locale; new strings are English-only until Weblate translators reach them (the repository's Translation Checks CI rejects a locale file with any missing key).

## Lab
- Legacy viewer (settings saved before layouts), deploy of c95d1173: Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture, on the 1400×660+0+90 crop.
