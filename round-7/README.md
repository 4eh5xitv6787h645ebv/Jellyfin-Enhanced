# Evidence pack, round 7

State: commit f3b837fa on `feat/media-tags-features` (twenty commits on top of dd6572be, the base of this work). Commits since d1eb89cc (the last reviewed state):

1. **6e4f1701 fix(tags): rank sound as TRaSH does and size cropped video by its width**
   - `DTS-HD Master Audio` and `DTS-HD XLL`, spelled out in a title or profile, are Master Audio.
   - Sound follows the TRaSH-Guides audio scores (TrueHD Atmos, DTS:X, Atmos, DD+ Atmos, TrueHD, DTS-HD MA, PCM, FLAC, DTS-HD HRA, DTS-HD, then lossy). Lossy tracks (DD+, DTS, DD, tracks without a codec chip) compare channels before codec: AAC 5.1 beats AC-3 2.0, DD+ 5.1 beats DTS 5.1, DTS:X 7.1 beats DD+ Atmos 5.1. Deliberate differences (PCM before FLAC; codec-less below DD at equal channels) are documented.
   - Resolution: 640 wide or more is 480p (cropped DVD 720×304 is not LOW-RES); 1440p needs a 1440-class height (ultrawide 2560×1080 is 1080p).
   - Jellyfin's coarse `VideoRange` decides HDR when `VideoRangeType` is unknown (stored only then).
   - XviD/DivX named from the codec tag of an `mpeg4` stream.
   - Aspect 1.90 is a plain ratio (DCI container), 2.35 keeps its label; only 1.43 reads as IMAX.
   - Truth table now 65 cases (web and server); parity q45–q52. Cache schema 30, resolver 18, web naming 12.
2. **50e72969 fix(tags): keep a child's own scores, a series' own versions and local premieres**
   - A season/episode with any score of its own keeps only its own; with none it shows the series' (server cache now matches the web fallback; test reproduces the critic-20 / series-8/90 case).
   - No Series/Season shows a Versions chip under any aggregation policy (latest-episode extras filtered at build and resolve, web and native, including summaries stored earlier).
   - A new season's premiere is recorded once its date has begun at UTC+14 and the series refreshes then; each viewer's local midnight decides (Perth shows New Season at 00:30 local; Los Angeles not before its own midnight). Cache schema 31.
3. **f3b837fa fix(tags): translate native award captions and keep RTL-script numbers in order**
   - Native award captions come from the web's vocabulary in the saved language.
   - Native text without right-to-left letters is shaped left to right: Arabic-Indic and Persian digits are no longer reversed (test reproduces the reversed glyph order on the old code); Hebrew/Arabic words stay RTL. Resolver 19.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at f3b837fa (this machine, niced and capped)
- Frontend 2188/2188; backend 2276/2276; parity `--offline` 0 differences (`parity-summary.txt`); jf12 Release build 0 warnings. Browser (399/399), jf10 build and the asset check last ran at d1eb89cc (round 6); the full set runs again in round 9.
- `translation-coverage.md`: Media Tags strings per locale. New strings are English-only until Weblate translators reach them; bundling translations here would fail the repository's Translation Checks CI, which rejects a locale file with any missing key.

## Lab
- Legacy viewer (settings saved before layouts), deploy of f3b837fa: Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (the round-6 README explains the one Home flag that changed because a file on the live media drive was replaced), on the 1400×660+0+90 crop.
