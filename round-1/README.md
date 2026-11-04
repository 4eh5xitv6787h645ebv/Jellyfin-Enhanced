# Evidence pack, round 1 (baseline)

State: commit dd6572bee963630a580306c0d0c689a741fa5441 (the starting point; nothing changed yet on this branch).

## Recorded verification at this commit
- Frontend unit tests: 1952 pass. Browser (Playwright, three projects): 399 pass. Backend xUnit (jf12): 2090 pass.
- Native parity harness (`LANG=en_US.UTF-8 node tests/poster/parity/run.mjs --offline`): 0 differences.
- Both Release builds (jf12, jf10): 0 warnings. Translation validator: pass (en.json ~1,625 keys; other locales are filled later by Weblate, so many keys fall back to English).
- A fresh re-run of every suite at this commit is in progress; its summary will appear in `verify-summary.txt` in this folder.

## Lab observations (real Jellyfin 12.1 with a real library)
- The legacy (pre-layout settings) viewer's Home and Movies pages render 128 and 400 tag chips in the four default corners with no console errors from the plugin.

## Files here
- `feature-inventory.md`: what exists, with code pointers.
- `research-plex-overlays.md`, `research-tag-pipeline.md`, `inventory-je-tags.md`: earlier research (older; the code is authoritative).
