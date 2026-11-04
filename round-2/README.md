# Evidence pack, round 2

State: commit 87894421 on `feat/media-tags-features` (three commits on top of dd6572be; see `git log dd6572be..87894421`).

## What changed since the previous state (dd6572be)
1. **cf12417e feat(tags): detect dynamic range, codecs and sound from structured stream facts**: `VideoRangeType` first (HLG chip; Dolby Vision keeps its base layer HDR10/HDR10+/HLG as an All-mode fact; unknown is not SDR), word-bounded title fallback only when the type is missing/unknown, `HDR10+` title alias, Highest sound = best single track (codec + channels from one track), FLAC/PCM chips, VC-1/VVC/ProRes, 8K hint guard; version-0 documents keep the old Highest detector. Independent truth table `tests/fixtures/quality-detection-truth.json` asserted on web and server. Cache schema 24, resolver 13, web naming 7.
2. **fc076486 feat(tags): apply tag look rules to native posters**: lock → item look → first enabled rule → default natively, facts from the tag cache entry (or the item when the cache is off), preview header `X-JE-Poster-Tags-Look`, 5 parity profiles.
3. **87894421 fix(tags): keep last good MDBList scores when a refresh fails** (plus Status help copy and api.md body limit fixes).
Details and code pointers: `feature-inventory.md` section 8.

## Verification at 87894421 (this machine)
- Frontend 2027/2027; backend 2132/2132 (two resolver-version pins updated after the first run); browser (three projects, 2 workers) 399/399; both Release builds 0 warnings; translation validator pass; inventory current; `git diff --check` clean.
- Parity `--offline` with `LANG=en_US.UTF-8`: 0 differences across all profiles including the new `look-rules*` profiles (`parity-summary.txt`). Native output intentionally changes vs dd6572be for: HLG streams (HDR → HLG), DOVI-only range types without a title (now Dolby Vision), multi-track sound (single-track winner), FLAC/PCM tracks, VC-1/VVC/ProRes, and posters whose look a rule decides; resolver version 13 retires the old variants.
- Known pre-existing: `scripts/build_poster_assets.py --check` reports only the known age-rating-colours drift.

## Lab (real Jellyfin 12.1, real library)
- Legacy viewer (settings saved before layouts) Home and Movies: pixel-identical (ImageMagick AE = 0, full frame and crop) to a dd6572be deploy on the same lab.
- `shots/native-strip.png`: server-rendered native posters. Left: a Dolby Vision P7 / HDR10+ REMUX movie in the default look. Middle: the same movie after the user saves a rule "Movie → Bands, Compact, Quality hidden" (preview header `X-JE-Poster-Tags-Look: rule:1`). Right: an HLG series, now `HLG` instead of `HDR`.
- `shots/web-all-hlg.png`, `shots/web-all-dv.png`: real season cards with HDR display mode All: `4K WEB HLG HEVC`, and `4K WEB Dolby Vision HDR10 HEVC ATMOS 5.1` (DV with its HDR10 base layer). `shots/r1-evidence.json` has the raw headers and chip texts.
