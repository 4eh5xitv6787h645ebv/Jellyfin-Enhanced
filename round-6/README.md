# Evidence pack, round 6

State: commit d1eb89cc on `feat/media-tags-features` (seventeen commits on top of dd6572be, the base of this work). Commits since 19c16f34 (the last reviewed state):

1. **621344b3 feat(tags): add a Versions chip that counts an item's versions**: Quality category `versions` (order 11, `ShowVersionsTag`/`VersionsTagOrder`), "{count} versions" in Full and "×N" in Compact, movies and episodes only (series/seasons excluded); admin page, panel, item editor, import/export; native posters draw it (`QualityTagRules.VersionCount`); parity profiles `quality-versions*`.
2. **90b13510 fix(tags): read premiere dates as local calendar days and label weekly native trending**: Coming Soon / New / release windows compare calendar days in the viewer's time zone on web and native (`premiereDay`/`airedWithin`, `StatusRules.PremiereDay/AiredWithin`); native trending ranks taken from Seerr's weekly list read "This week", not "Today".
3. **3e0ebd7a docs(tags)**: orphan paragraphs at the end of tags.md moved into their sections; "Related badge systems" heading.
4. **28b3770e feat(tags): read sound, editions and commentary more truthfully**: E-AC-3 JOC → DD+ ATMOS; a bare "DTS-HD" is its own `DTS-HD` label (after HRA) unless MA/XLL/Master Audio appears in the same track's title or profile; height layouts kept (`5.1.2`, `7.1.4`, from Jellyfin's layout or the title) and counted in ranking (a codec-less height track shows its bed); commentary/audio description in Hungarian, Estonian, Ukrainian, Greek, Turkish, Arabic, Hebrew, Japanese, Chinese and Korean (shared title table `tests/fixtures/track-roles.json`, run by web and server tests); editions Redux, Ultimate, Collector's Edition, Anniversary, Uncensored, Open Matte (compact Ult/CE/Anniv/Unc/OM); naming reads a file named with the item's original title (localised metadata) from after that title; tag-style document cap 40 KB. Truth table now 54 cases; parity q41–q44, ns12–ns17. Cache schema 29, resolver 17, web naming 11.
5. **2c78ff1b perf(tags): refresh native series schedules in parallel batches**: batches of 16 through the series service (4 in flight, shared rate limit), each batch published before the next; deterministic 50-series test proves peak 4 and full publication; a stopped batch publishes nothing and stays queued.
6. **d1eb89cc fix(tags): give native posters every age-rating colour the web uses**: the generated `age-rating-colours.json` predated the full rating list in css/ratings.css (the asset check had failed since the base); regenerated, plus a test that every rating the stylesheet colours has a native colour.

Earlier work on this branch (dd6572be..19c16f34) is summarised in `feature-inventory.md` section 8.

## Verification at d1eb89cc (this machine, niced and capped)
- Frontend 2159/2159; backend 2246/2246; browser (Playwright) 399/399; parity `--offline` 0 differences (`parity-summary.txt`); jf12 and jf10 Release builds 0 warnings; poster asset check OK (261 files); `git diff --check` clean.
- `translation-coverage.md`: Media Tags strings per locale. New strings are English-only until Weblate translators reach them; bundling translations here would fail the repository's Translation Checks CI, which rejects a locale file with any missing key.

## Lab
- Legacy viewer (settings saved before layouts), deploy of d1eb89cc: Movies AE = 0 against the dd6572be deploy on the 1400×660+0+90 crop. Home differs by 164 pixels in one language flag (US → GB) on one card: that movie's file on the live media drive was replaced by a newer release overnight (outside this work), so Jellyfin's indexed path no longer exists and its Matroska `en-US` tag cannot be read; the remaining `eng` stream maps to GB as designed. The rest of Home is identical.
