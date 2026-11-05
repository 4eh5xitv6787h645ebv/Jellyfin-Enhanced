# Evidence pack, round 16

State: commit fcf81283 on `feat/media-tags-features` (fifty-three commits on top of dd6572be, the base of this work). Commits since f5f8588f (the last reviewed state):

1. **00c6467f fix(tags): give a season its series' first genres on an incremental update** — a season without its own genres showed the series' empty list; when the series got its first genres, the incremental update left the season empty until a full rebuild. It now takes them, as an on-demand build does (test: series [] → ["Drama"] → season ["Drama"], equal to `BuildEntryOnDemand`).
2. **fcf81283 fix(tags): tighten detection at version, title, URL and frame boundaries** —
   - An item's default version is the first one Jellyfin lists that has stream facts, else the first listed; a remembered web pick still wins, and chips never mix versions (web and native; an unprobed first version used to show nothing).
   - The Latest series policy uses the newest probed aired episode (an unprobed newest episode used to blank it).
   - A known episode title no longer swallows the edition after it: `Show.S01E01.Pilot.Extended.1080p.WEB-DL` for *Pilot* is WEB + Extended (also 1x05 and daily naming); `Web of Lies: Extended Interview` negatives still hold.
   - A remote version's URL loses its query string (`…H264-CAM.mkv?sig=` is WEB, not CAM), and an address that names nothing (`https://…/stream/123`) takes the item's own file name (`Film.2020.WEB.{edition-Extended}.strm` → WEB + Extended).
   - A release group closing a file name never claims IMAX (`…H264-IMAX`), web and native.
   - An 8K-class height needs an 8K-class width (4096×3072 and 3200×3200 are 4K); a codec named in a stream title counts only as a whole word (`NAV1GATOR` is no AV1; `4K AV1` still is).
   - New words: HDRip → WEB (Radarr's mapping), PPV → HDTV, R5 and WORKPRINT → SCR.
   - Docs: README native opt-out location (Media Tags → Layout), "Series policy and detection details" heading (was "Detection limits"), Awards native sentence (Corners and Bands).
   - Naming fixture +10 rows, truth table +4 rows. Cache schema 44, resolver 34, naming 22.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at fcf81283 (this machine, niced and capped)
- Frontend 2351/2351; backend 2439/2439; parity `--offline` 0 differences, 296 profiles, Status 240 web fixtures passed and 240 native/web identical (`parity-summary.txt`); jf12 Release build 0 warnings; test inventory current. The full browser set last ran at f5f8588f (399/399) and runs again in round 18.
- `translation-coverage.md`: 46/873 Media Tags strings per locale (unchanged).

## Lab
- Deploy of fcf81283 (schema 44: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
