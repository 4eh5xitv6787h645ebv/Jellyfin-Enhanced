# Evidence pack, round 15

State: commit f5f8588f on `feat/media-tags-features` (fifty-one commits on top of dd6572be, the base of this work). Commits since 7fd9a67f (the last reviewed state):

1. **b880f3af fix(tags): make release-name rules compose and read 16:10 frames correctly** —
   - A known episode title is skipped after any episode marker (`SxxEyy`, `1x05`, daily dates, absolute numbers), so `Show.1x05.Web.of.Lies.Extended.Interview.1080p.HDTV` for the episode "Web of Lies: Extended Interview" is HDTV with no edition (the same for daily and absolute naming).
   - A trailing release group never names the source, even when nothing else does: `Film.2020.1080p.H264-CAM` and `…H264-TS` have no source (`…WEB.H264-TS` stays WEB; `HD-DVD`, `DVD-R`, `WEB-DL`, `BD-REMUX` are not groups). A group-shaped suffix such as `-Extended` is not an edition.
   - A four-digit year between ` - ` separators is a year, not an absolute episode number: `Title - 1982 - Final Cut` keeps Final Cut.
   - `.strm`, `.m4v` and `.mov` names are read like other files (`…WEB.H264-TS.strm` is WEB).
   - Producer's Cut, Alternate Cut, Assembly Cut, International Cut, Restored and Hybrid have translation keys on web and native (873 counted Media Tags strings now).
   - A 4K-class height needs a 4K-class width: 2560×1600 is 1440p (web and native).
   - 12 naming fixture rows (every case from the last review) and 1 truth row. Cache schema 43, resolver 33, naming 21.
2. **7e21fc69 fix(tags): tell browsers when a batch answer's scores stop being current** — every tag-data item with a named source carries `RatingsRefreshAt` (Unix ms): a minute ahead while scores are due, MDBList's retry time after a failed lookup or a request during its backoff (last good scores kept meanwhile), else seven days after found scores or three after a confirmed miss. With the server cache off the rating renderer keeps an answer no longer than that, so a failed lookup recovers on the first view after the retry and fresh scores follow the provider's lifetime instead of the 30-day browser lifetime. Tests: backend lifecycle across all states with a transport that fails on any call; frontend failure → within-retry (no request) → recovery → fresh lifetime → due.
3. **f5f8588f fix(tags): keep version-0 sound facts through Spoiler Guard title stripping** — title-only stripping rebuilt a series/season summary without `LegacyAudio`, `LegacyAudioByLanguage` and `LegacyAudioRegionFallback`; they carry no title text and are kept. The user guide now says `tag-styles/catalog` is open to any signed-in user, as the API reference does.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at f5f8588f (this machine, niced and capped; full set)
- Frontend 2327/2327; backend 2420/2420; browser (Playwright: Chromium, mobile Chromium, Firefox) 399/399; parity `--offline` 0 differences, 296 profiles, Status 240 web fixtures passed and 240 native/web identical (`parity-summary.txt`); jf12 and jf10 Release builds 0 warnings; poster asset check OK; translations validator OK; test inventory current; `git diff --check` clean.
- `translation-coverage.md`: 46/873 Media Tags strings per locale (new strings English-only until Weblate translators reach them).

## Lab
- Deploy of f5f8588f (schema 43: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
