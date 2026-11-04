# Evidence pack, round 5

State: commit 19c16f34 on `feat/media-tags-features` (eleven commits on top of dd6572be, the base of this work). Recent commits since a90658ff:

1. **31c0ecb3 feat(tags): give native posters the web's trending sources and lifetimes**: native trending now uses TMDB daily ranks, else Seerr weekly ranks, kept 30 minutes (5 after an empty answer), fetched only by the background worker; on with either source configured.
2. **19c16f34 feat(tags): tell Atmos carriers apart and keep each version's facts its own**: TRUEHD ATMOS / DD+ ATMOS / ATMOS (carrier unknown) as separate facts (Compact shows ATMOS; same default colours; TrueHD Atmos ranks first); commentary and audio description recognised in English, common European languages and Russian ("Audiokommentar", "Audiodescription", "Hörfilm"); the first listed version is authoritative (an unprobed first version shows only its naming facts); names that start with the item's own title are read from after it ("Uncut Gems 1080p WEB-DL", "Cam 1080p"); DOVIWithSDR lists SDR in All; docs corrections. Schema 28, resolver 16.
Earlier work on this branch (dd6572be..a90658ff): structured HDR/codec/sound detection with an independent truth table; native look rules and their request gates; MDBList last-good scores; language-role, flag and naming fixes; per-track channel layouts; dimensions-first resolution; locale-aware scores and language names; current video detection for every account; native chip vocabulary; translation coverage report. See `feature-inventory.md` section 8.

## Verification at 19c16f34 (this machine, niced and capped)
- Frontend 2115/2115; backend 2209/2209; parity `--offline` 0 differences (`parity-summary.txt`); jf12 Release build 0 warnings. (Browser and jf10 last ran at 62617d57: browser 399/399.)
- `translation-coverage.md`: Media Tags strings per locale. New strings are English-only until Weblate translators reach them; bundling translations here would fail the repository's Translation Checks CI, which rejects a locale file with any missing key.

## Lab
- Legacy viewer (settings saved before layouts) Home and Movies: AE = 0 on the 1400×660+0+90 crop against the dd6572be deploy.
