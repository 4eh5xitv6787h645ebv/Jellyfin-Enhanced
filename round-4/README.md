# Evidence pack, round 4

State: commit a90658ff on `feat/media-tags-features` (nine commits on top of dd6572be). Since the previous review state (62617d57):

1. **a2df4a14 feat(tags): write scores and language names in the user's language**: scores use the locale's decimal separator and digits on web (Intl) and native (generated ICU table, same data); language tooltips name languages in the UI language. Parity profiles for de, fa and ar-SA.
2. **ce818238 fix(tags): give every account the corrected detector and consistent track roles**: settings saved before layouts now get the current video detection (no more DVD → Dolby Vision on any account; they keep only their sound vocabulary); commentary/audio-description tracks never decide the sound chip while an ordinary track exists (Highest, All, series); title layouts 1.0–7.1 (PCM 4.0/3.0); forced subtitles cannot mark a full subtitle SDH; naming: bracketed year / first non-leading year boundary, no-year names need a release word ("Uncut Gems.mkv", "Remux (2024)" → nothing; "Film (2020) Extended 2024 BluRay" → Extended); a rule with an invalid or sixth condition is dropped whole instead of widened. Schema 27, resolver 15.
3. **a90658ff feat(tags): draw native chip words in the user's language and report translation coverage**: native Dual/Multi, Mixed and edition words come from the shared vocabulary; translation coverage script and placeholder-integrity test; a "Languages" section in the user docs.
Details: `feature-inventory.md` section 8. `translation-coverage.md`: current Media Tags coverage per locale (new strings are English-only until Weblate translators reach them; bundling translations in this branch would fail the repository's Translation Checks CI, which rejects any locale file with missing keys).

## Verification at a90658ff (this machine, niced and capped)
- Frontend 2093/2093; backend 2198/2198; parity `--offline` 0 differences (`parity-summary.txt`); jf12 Release build 0 warnings. (The full set including browser and jf10 last ran at 62617d57; browser 399/399 there.)
- Truth table 41 cases (Highest / All / version-0) asserted on web and server.

## Lab
- Legacy viewer (settings saved before layouts) Home and Movies: AE = 0 on the 1400×660+0+90 crop against the dd6572be deploy, with the current video detection now applied to that account.
