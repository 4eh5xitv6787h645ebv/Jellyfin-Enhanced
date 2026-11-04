# Evidence pack, round 11

State: commit dc56ac6a on `feat/media-tags-features` (thirty-five commits on top of dd6572be, the base of this work). Commits since 42dae8e8 (the last reviewed state):

1. **6dd03dda fix(tags): keep version-0 sound words but make them true** — accounts whose layout settings predate the redesign keep their earlier sound vocabulary, but the label is kept only when one eligible track holds both its codec (naming that track's carrier or less) and its channels; otherwise the best single track is described in the same words. DTS:X needs its name (a profile mentioning XLL is DTS). Per-track labels for All mode and series policies go through the same check on web and native; docs corrected. Truth table now has version-0 expectations for the XLL and TrueHD 2.0 + AAC 7.1 cases. Cache schema 37, resolver 26, web naming 16.
2. **4a54a7aa perf(tags): send enrichment updates as deltas instead of full re-downloads** — MDBList ratings, logos, scenes, awards, Leaving soon, Custom tag re-matches, air-date boundary refreshes and reconciles without removals no longer change the cache version, so browsers fetch only changed entries through `?since=`. The version changes only on a rebuild swap, a removed item or a server-mode transition (stated in api.md).
3. **1fae690a fix(tags): build restricted users' series languages from visible episodes** — a restricted user's series/season audio languages, partial-dub list and subtitle languages are recomputed from visible episodes with the same union/partial rule as the full scan (shared `ContainerLanguages`); a series-only genre edit reaches a season that showed the series' genres.
4. **dc56ac6a feat(tags): read common release words and refuse invalid Dolby Vision** — bare WEB anywhere after the title boundary (1080p.WEB.DDP5.1 → WEB; Web of Lies / Charlotte's Web still none); BR-DISK/BD25/BD50 → BluRay; HD-DVD → HD DVD; HDTVRip/PDTV/Raw-HD → HDTV; editions Rogue Cut, Black and Chrome, Masters of Cinema; DOVIInvalid never shown as Dolby Vision. Cache schema 38, resolver 27, web naming 17.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at dc56ac6a (this machine, niced and capped)
- Frontend 2247/2247; backend 2340/2340; parity `--offline` 0 differences (`parity-summary.txt`); jf12 Release build 0 warnings; poster asset check OK. Browser 399/399 last ran in the round-9 full set; the full set runs again in round 12.
- `translation-coverage.md`: Media Tags strings per locale (865 counted); new strings are English-only until Weblate translators reach them (the repository's Translation Checks CI rejects a locale file with any missing key).

## Lab
- Legacy viewer (settings saved before layouts), deploys of 6dd03dda and dc56ac6a: Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture, on the 1400×660+0+90 crop (the truthful version-0 sound keeps every real-library poster that was already true).
