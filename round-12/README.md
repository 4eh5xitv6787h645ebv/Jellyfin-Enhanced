# Evidence pack, round 12

State: commit d03fc1b3 on `feat/media-tags-features` (forty-one commits on top of dd6572be, the base of this work). Commits since dc56ac6a (the last reviewed state):

1. **12ea0b4f fix(tags): never give two cache updates the same delta stamp** — every publication takes a strictly increasing `LastUpdated` (`NextStamp()`), so two updates in one millisecond cannot share a stamp and a browser holding the first cannot miss the second through `?since=`. api.md states the cursor contract. Test `PublicationStampsNeverRepeatEvenWithinOneMillisecond`.
2. **927e9232 fix(tags): read past an episode's own title before release words** — `Show.S01E01.The.Web.720p.HDTV` is HDTV again (the episode title after SxxEyy is skipped by name, as the series title already was). Schema 39, resolver 28.
3. **0dfe64ed fix(tags): tighten evidence boundaries for editions, IMAX, channel layouts and dca** — `Film.Extended.mkv` keeps Extended after the title is stripped; IMAX only from the item, names/paths and the video title (an audio track called "Commentary about IMAX cameras" no longer makes an IMAX chip); a structured layout must agree with the track's channel count (TrueHD 2 ch with layout 7.1 → TRUEHD 2.0); ffmpeg's `dca` codec is DTS. Shared truth table and naming fixtures carry the cases for web and server. Schema 40, resolver 29, naming 18.
4. **f8c9d238 fix(tags): keep languages without a flag as code chips in Flags style** — Esperanto, Welsh, Latin and other flag-less languages show a code chip (`EO`, `CY`) in Flags style on the web and on native posters instead of vanishing; Bosnian, Khmer, Lao, Burmese and Luxembourgish gain flags. Resolver 30.
5. **95a218d6 docs(tags): link each Media Tags tab to its user-guide section** — "Learn more" on every tab of the personal hub and the admin page, opening the matching heading of docs/enhanced/tags.md; a test checks every anchor against the headings. api.md preset list gains `poster`.
6. **d03fc1b3 docs(tags): document tag-cache compression and measured payload size** — measured on the lab (below); tags.md gets a sizing paragraph, api.md the compression behaviour and the reverse-proxy requirement.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at d03fc1b3 (this machine, niced and capped; full set)
- Frontend 2266/2266; backend 2353/2353; browser (Playwright) 399/399; parity `--offline` 0 differences (`parity-summary.txt`); jf12 and jf10 Release builds 0 warnings; poster asset check OK; translations validator OK; test inventory current; `git diff --check` clean.
- `translation-coverage.md`: Media Tags strings per locale (867 counted); new strings are English-only until Weblate translators reach them.

## Lab
- Deploy of d03fc1b3, legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
- Tag-cache payload, admin user, full response: 3,882 entries (85 series, 231 seasons, 3,447 episodes, 119 movies). Response headers `Content-Encoding: br`, `Vary: Accept-Encoding` (Jellyfin's own response compression; the plugin adds none). 14,696,332 bytes of JSON decoded; 1,391,071 bytes encoded on the wire (Brotli, ≈ 10.6×); the same JSON gzipped in the browser: 1,333,903 bytes. ≈ 3.8 KB of JSON and ≈ 360 bytes on the wire per entry.
