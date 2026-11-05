# Evidence pack, round 18

State: commit e8351a3c on `feat/media-tags-features` (fifty-eight commits on top of dd6572be, the base of this work). Commits since 19a0f094 (the last reviewed state):

1. **8da6c8f7 fix(tags): ask again about direct play when an item's media change** — a direct-play verdict was kept a day per item and device profile, so a replaced or re-encoded file kept its old answer. Verdicts now carry a fingerprint of the item's versions and video/audio streams: other media make it no answer and the item is asked again; an answer for the old file still on the network never overwrites the new one; score/review changes leave verdicts alone. Test: transcode answer → file replaced (HEVC → H264) → no stale chip, a second request, direct-play answer, then a memory hit.
2. **c1d35499 fix(tags): rank sources by copy quality and tighten scan, 3D and edition reading** —
   - One source ranking for summaries and version choice: REMUX, BluRay, WEB, HD DVD, HDTV, DVD, SDTV, VHS, then SCR, TC, TS, CAM (Best(VHS,HDTV)=HDTV, Best(CAM,TS/TC/SCR)=TS/TC/SCR, both episode orders tested). A season's source summary counts every version of every episode (WEB 1080p + REMUX 4K versions in one episode → source Best REMUX, All [REMUX, WEB]).
   - A restricted user's representative episode must carry audio or video (a subtitle-only visible episode no longer blanks the representative while the summary had 1080p; integration test through `GetCacheForUser`).
   - Interlaced 1080 is `1080i` on web and native (truth table); a title naming Dolby Vision and SDR keeps the SDR base; 3D needs whole words outside a closing release group (`3Days.To.Kill.2014.1080p.H264-MVC` is not 3D; `Film.2014.3D.1080p.BluRay.MVC-GRP` is); an explicit `{edition-…}` label shows as written unless it is exactly a known edition; HDTC → TC.
   - Docs: what unprobed and remote versions show, the source ranking, age-rating examples (`FSK-12`, `GB-15`), `Categories.source` vs `LatestExtras`, and the policy text.
   - Cache schema 46, resolver 36, naming 24.
3. **e8351a3c fix(tags): count 1080i as 1080 for the minimum-resolution setting** — found by this round's full parity run (2 differences in `display-minimum-720p`): the web gate read thresholds by position in the resolution order, which `1080i` shifted. Both sides now accept 1080i wherever 1080p is accepted; parity back to 0.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification (this machine, niced and capped; full set)
- Full set at c1d35499: frontend 2363/2363, backend 2471/2471, browser 399/399 (Chromium, mobile Chromium, Firefox), jf12/jf10 Release builds 0 warnings, assets/translations/inventory/diff-check OK; parity reported 2 differences (`display-minimum-720p`), fixed in e8351a3c.
- At e8351a3c: frontend 2363/2363, backend 2474/2474, parity `--offline` 0 differences (296 profiles, 14 review keys; Status 240 web fixtures passed and 240 native/web identical, `parity-summary.txt`), jf10 build 0 warnings. The browser suite was not rerun after the two-line gate fix.
- `translation-coverage.md`: 46/873 Media Tags strings per locale (unchanged).

## Lab
- Deploy of e8351a3c (schema 46: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
