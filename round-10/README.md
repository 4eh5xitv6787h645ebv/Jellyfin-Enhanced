# Evidence pack, round 10

State: commit 42dae8e8 on `feat/media-tags-features` (thirty-one commits on top of dd6572be, the base of this work). Commits since c95d1173 (the last reviewed state):

1. **c538f785 fix(tags): bound sound claims by the track's own channels and codec**
   - A layout named in a track's title only counts when the track's channel count is unknown or agrees with it (its bed, or bed plus heights): AAC 2ch "TrueHD Atmos 7.1" → no sound chip; AC-3 2ch "Dolby Digital 5.1" → Dolby Digital 2.0; FLAC 2ch "5.1" → FLAC 2.0; TrueHD Atmos 7.1.4 over 8 channels keeps 7.1.4.
   - The Atmos carrier comes from the stream codec before text: E-AC-3 JOC titled "TrueHD Atmos 5.1" → DD+ ATMOS 5.1.
   - Settings saved before layouts keep their sound vocabulary but never claim a carrier the codec cannot be (AC-3 "Atmos" → 5.1) or more channels than the track reports.
   - Truth table 75 cases (web and C#, Highest/All/legacy). Cache schema 34, resolver 23, web naming 14.
2. **0f67e237 fix(tags): keep episode ranges and calendar days through milestone facts**
   - The full-build episode memo keeps `IndexNumberEnd`: a season of combined files (E1–E2 … E9–E10) covers through 10 in the full build as on demand (test through the real full build).
   - A combined file counts as its last episode for the latest/last-of-season facts (E9–E10 holds finale E10) and its first for the season premiere.
   - The library finale fallback keeps the air date's calendar day (S1E10 dated 29 October is the finale on 5 November in UTC, Los Angeles and Perth, and not after the window). Cache schema 35, resolver 24.
3. **42dae8e8 feat(tags): read Jellyfin's disc and 3D facts, and count every Media Tags string**
   - Disc structures Jellyfin recognises (BDMV/VIDEO_TS folders, Blu-ray/DVD images) show BluRay/DVD when names carry no source word; a named source still wins.
   - Jellyfin's own 3D format (`Sources[].Is3D`, item `Video3DFormat`) marks a version 3D on web and native without 3D release words.
   - `scripts/tag-translation-coverage.mjs` counts every Media Tags string family (865, previously 717), and a test fails if the Media Tags code asks for a string the report does not count. Cache schema 36, resolver 25, web naming 15.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at 42dae8e8 (this machine, niced and capped)
- Frontend 2223/2223; backend 2322/2322; parity `--offline` 0 differences (`parity-summary.txt`); jf12 and jf10 Release builds 0 warnings; production inventory current. Browser 399/399 last ran in the round-9 full set (c95d1173); the full set runs again in round 12.
- `translation-coverage.md`: now 865 Media Tags strings per locale; new strings are English-only until Weblate translators reach them (the repository's Translation Checks CI rejects a locale file with any missing key).

## Lab
- Legacy viewer (settings saved before layouts), deploy of 42dae8e8: Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture, on the 1400×660+0+90 crop (the legacy sound detector change leaves real-library posters unchanged).
