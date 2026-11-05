# Evidence pack, round 20

State: commit d8a8767e on `feat/media-tags-features` (based on dd6572be). It now also includes the polished settings UI: merge commit e2de2026 brought in `feat/media-tags-redesign` at b06ad527 (17 settings-UI polish commits, refreshed docs images, and that branch's merge of upstream main ea8cdffb). Commits since 62b4c62b (the last reviewed state):

1. **15b7ba49 fix(tags): hash every device-profile condition input into the version revision.** `TagCacheService.MediaRevision` now also covers the following, so a cached direct-play verdict is asked again when any of them changes:
   - stream facts: IsAnamorphic, RefFrames, PacketLength, IsAVC, Rotation, NalLengthSize;
   - Dolby Vision profile, level, compatibility id and BL/EL/RPU flags, plus the HDR10+ flag;
   - colour primaries, space and range; hearing-impaired; external path;
   - the version's protocol, timestamp type and default audio index.

   Stream titles are deliberately left out. A backend inventory test maps every name in Jellyfin's `ProfileConditionValue` enum to the media fact it reads, and fails when Jellyfin adds a new one. A theory then changes each input on its own and asserts that the revision changes. The browser's fallback fingerprint covers the same facts, and its browser test was extended. Schema 50.
2. **90f796b0 fix(tags): structured DTS-HD profiles, dotted codec titles, three editions and regional flags.**
   - A DTS-HD MA or HRA profile reported by the stream outranks the title's other DTS claim; a DTS:X title still refines it.
   - `H.264`, `VC-1` and `MPEG-2` in titles are recognised, with or without the dot or hyphen.
   - New Roadshow, Despecialized and Fan Edit editions (compact forms Road, Despec, Fan).
   - New flags: `cmn-Hant` → TW, `zh-yue` and `yue` → HK, Māori → NZ, `arz` → EG, `ckb` → IQ. These come from the extended-language subtag, and script flags now use the canonical base language.
   - Truth table +5 (independent expectations), naming fixture +4.
   - Doc drift fixed: 23 nullable overrides, the Layout defaults tab, and a historical-resolver note in api.md.

   Schema 51, resolver 38, naming 26.
3. **b53fc125 perf(tags): reconcile an access-only filter change instead of reloading the whole cache.**
   - Before: for a restricted user, an added item they cannot see changed their filter revision. Every browser profile then downloaded and parsed the whole cache again, and its tags blanked meanwhile.
   - Server: deltas now answer `filterBase` (the fingerprint without access). When the caller's `known` revision differs, they also answer `visible`: the sorted IDs the user can see, never one they cannot.
   - Browser: `tag-pipeline.js` `reconcileAccess`, plus `tagCacheStore.reconcileAccess` in one IndexedDB transaction. When only access changed and the copy already holds every visible ID, the browser drops the rest and keeps its tags on screen.
   - A newly visible item, a Spoiler Guard change or a ratings change still downloads in full.
   - Tests: backend (visible IDs, `filterBase` stable across a revocation, hidden IDs never listed) and pipeline (reconcile, newly visible → full download, `filterBase` change → full download).
4. **663fb3d9 perf(tags): draw a native poster again only when its Status badge changes.** The composite key no longer contains the five-minute URL bucket. Before, the bucket entered through the settings digest and through the status inputs' bucket time. The key now uses the settings without the bucket (`RenderDigest`) plus the resolved Status badge. A test counts composites across 12:01 and 12:06: 1 for an unchanged poster, 2 when the badge ends.
5. **e2de2026 merge: feat/media-tags-redesign b06ad527 into feat/media-tags-features.** Conflicts were resolved by keeping both sides: the redesign's copy, styles and images, plus this branch's docs links and text; the production inventory was regenerated.
6. **d8a8767e test(i18n): count the quality settings strings in the Media Tags coverage report.** These are the `panel_settings_ui_quality_*` strings that the polished panel reads; 934 strings are now tracked.

Earlier work on this branch is summarised in `feature-inventory.md` section 8.

## Verification
At the merge e2de2026 (full set, on this machine, niced and capped):
- Frontend 2432 passed with 1 failure: the coverage-report test that d8a8767e fixes (re-run 2/2).
- Backend 2561/2561.
- Browser 402/402 (three projects).
- Parity `--offline`: 0 differences (`parity-summary.txt`).
- jf12 and jf10 Release builds: 0 warnings.
- Translations validate; inventory current; poster assets OK (261 files); `git diff --check` clean.

Before the merge, at 663fb3d9: frontend 2424/2424, backend 2544/2544, parity 0, targeted browser 12/12.

`translation-coverage.md`: 46/934 Media Tags strings per locale; the tracked total grew with the polished panel's strings.

## Lab
Deploy of d8a8767e (schema 51; the lab cache rebuilt), with the legacy viewer (settings saved before layouts):
- Home: AE = 0 against the round-6 Home capture (1400×660+0+90 crop).
- Movies: the tags match the dd6572be deploy exactly. The only differing pixels are a 10×10 area of the header's random-item dice icon, which shows a random face on each page load.
