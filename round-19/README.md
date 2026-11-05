# Evidence pack, round 19

State: commit 62b4c62b on `feat/media-tags-features` (sixty-four commits on top of dd6572be, the base of this work). Commits since e8351a3c (the last reviewed state):

1. **72bdc0c5 fix(tags): key direct-play answers by each version's full media revision** — every version in the cache and batch answers carries `Revision`, a hash of every fact Jellyfin has for it and its streams (container, size, bitrates, codecs and tags, profiles, levels, bit depths, sizes, scan type, frame rates, channels, sample rates, ranges, languages, default/forced/external). Direct-play verdicts are keyed by it (and by a wider set of stream facts when it is absent), so a change in IsInterlaced, frame rate, codec tag, bitrate or bit depth alone asks again; an answer stored before fingerprints existed is asked again; restoring stored answers checks their media. Tests: one per field (interlace, frame rate, codec tag, bitrate, bit depth), revision same/changed, stored answers with and without a fingerprint, backend revision sensitivity. Schema 47.
2. **27b008c7 fix(tags): keep interlaced scan for SD and title-only resolutions** — known interlaced 720×576 and 720×480 are `576i`/`480i` (they were 576p/480p); a stream title naming `1080i`, `576i` or `480i` counts when the dimensions are unknown (it gave nothing). Web and native; truth table +3. Schema 48, resolver 37, naming 25.
3. **645228bb fix(tags): show a season's own genres first everywhere, its series' otherwise** — the server gave a genre-less season its series' genres only when the season had no score of its own, and the batch path put the series' genres ahead of a season's own (cache and batch disagreed). Both now show the season's own genres, else its series', whatever its score; the incremental series patch follows the same rule. Tests both sides. Schema 49.
4. **365ed785 fix(tags): find a language's flag from its code, not its display name** — ISO 639-2/B codes (`gre`, `cze`, `slo`, `alb`, `mac`, `ice`, `arm`, `geo`) reached their flags only through an English display name; the lookup now tries the code's canonical language first (web and native), so a German, French or Spanish interface keeps the flags.
5. **9da0e4e4 fix(tags): keep tag positions physical on right-to-left pages** — corner slots aligned with flex start/end, which follow the page direction, so an Arabic/Hebrew/Persian interface drew **Top left** at the top right while native posters kept it top left. The tag host now lays out left to right and each chip's text keeps its own direction (`unicode-bidi: plaintext`). Browser test on an RTL page (Chromium, mobile Chromium, Firefox); docs say positions are physical.
6. **62b4c62b ci: run the offline poster parity harness on pull requests that touch tag code** — a `parity` job in `regression.yml` (previously only the scheduled `extended` job ran it).

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification at 62b4c62b (this machine, niced and capped)
- Frontend 2391/2391; backend 2495/2495; browser 402/402 (full suite, three engines; +3 RTL); parity `--offline` 0 differences (296 profiles, 14 review keys; Status 240 web fixtures passed and 240 native/web identical, `parity-summary.txt`); jf12 and jf10 builds 0 warnings; poster assets regenerated (576i/480i); test inventory current; workflow YAML parses.
- `translation-coverage.md`: 46/873 Media Tags strings per locale (unchanged).

## Lab
- Deploy of 62b4c62b (schema 49: the lab cache rebuilt), legacy viewer (settings saved before layouts): Movies AE = 0 against the dd6572be deploy and Home AE = 0 against the round-6 Home capture (1400×660+0+90 crop): the RTL layout change leaves left-to-right pages pixel-identical.
