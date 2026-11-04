# Evidence pack, round 14

State: commit 7fd9a67f on `feat/media-tags-features` (forty-eight commits on top of dd6572be, the base of this work). Commits since e8a4f166 (the last reviewed state):

1. **01324f41 fix(tags): re-ask for scores a batch answer was still waiting for** — tag-data items whose named-source scores are still being fetched from MDBList carry `RatingsPending: true`. With the server cache off, the rating renderer keeps such an answer for one minute instead of the Local Storage lifetime (30 days by default); the next view after that asks again and shows the scores. A complete answer persists as before. Server-cache mode is unaffected (scores reach it through deltas). Docs (tags.md, api.md) corrected: the earlier "next view" sentence was not true in that mode.
2. **15341394 fix(tags): read episode markers, release groups and portrait frames correctly** —
   - Series/Season summaries count a probed alternate version's resolution, dynamic range and codec when the first version was never probed (first unprobed WEB + probed 4K HDR10 HEVC REMUX now gives 4K/HDR10/HEVC under Best, Latest and Mixed; nothing is invented when no version is probed; an individual card still describes its first version).
   - Episode markers: Sonarr's `1x05`, daily air dates (`2024-03-15`) and absolute numbers (` - 105 - `, ` - 05 [`) end the series title like `SxxEyy`, so episode titles such as "Extended Interview", "Uncensored Bits", "The Director's Cut", "Remastered Memories" never become editions.
   - A scene release group after the last codec/audio/resolution/source token (`…WEB.H264-TS`) never names the source; compounds `BD-REMUX`, `WEB-DL`, `HD-DVD` stay whole.
   - New vocabulary: anime `BD` → BluRay, `DVD5`/`DVD9`/`DVD-R` → DVD, `SDTV`/`TVRip`/`SATRip`/`DVBRip` → new **SDTV** source label, `VHSRip` → VHS; editions Producer's Cut, Alternate Cut, Assembly Cut, International Cut, Restored, Hybrid (compact PC, Alt, Asm, Intl, Rest, Hyb).
   - Portrait frames are measured by their short and long sides on web and native (1080×1920 is 1080p, 2160×3840 is 4K).
   - 25 new naming fixture rows (including every probed row from the last review) and 2 truth-table rows. Cache schema 42, resolver 32, naming 20.
3. **7fd9a67f fix(tags): keep native status posters tagged across a bucket boundary** — a native poster token verifies against the current and the previous five-minute bucket while Status is shown, so a URL minted at 12:04:59 and fetched at 12:05:01 is still tagged (status as of the request); a URL two buckets old retires as before.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at 7fd9a67f (this machine, niced and capped)
- Frontend 2310/2310; backend 2406/2406; parity `--offline` 0 differences, 296 profiles, Status 240 web fixtures passed and 240 native/web identical (`parity-summary.txt`); jf12 Release build 0 warnings; poster asset check OK (quality colours regenerated for SDTV and the new editions); test inventory current. The full browser set last ran at d03fc1b3 (399/399) and runs again in round 15.
- `translation-coverage.md`: 46/867 Media Tags strings per locale (unchanged).

## Lab
- Deploy of 7fd9a67f (schema 42: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop): the naming, portrait and aggregation changes alter no real-library poster in that view.
