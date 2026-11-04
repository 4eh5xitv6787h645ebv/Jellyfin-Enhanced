You are reviewing the FEATURE SET and competence of the "Media Tags" system in Jellyfin Enhanced (a Jellyfin server plugin: C# server + injected JS web client + server-rendered poster tags for native TV/mobile apps). This is NOT a visual design review: judge what the system can do, how correctly it detects and decides, and how well it is engineered, documented, tested and localised.

Repository state to review: commit dd6572bee963630a580306c0d0c689a741fa5441 of branch `feat/media-tags-features` in the git repository at /home/jake/je-wt/features.

## Rules (read-only review)
- Work ONLY from your own detached checkout: `git -C /home/jake/je-wt/features worktree add --detach /home/jake/je-wt/review-checkouts/feature-r1-opus dd6572bee963630a580306c0d0c689a741fa5441`, then `cd` there and `npm ci --offline` if you want to run JS tests. Remove it when you finish: `git -C /home/jake/je-wt/features worktree remove --force /home/jake/je-wt/review-checkouts/feature-r1-opus` (literal path, no variables or globs in rm/mv/worktree commands).
- Never edit, commit, stash or reset anything in /home/jake/je-wt/features or any other worktree. Never push. You make no code changes anywhere except scratch files inside your own checkout.
- Do not contact any Jellyfin server, container or lab, and do not open credential files (`/home/jake/je-lab/README.md`, `/home/jake/je-demo/CREDENTIALS.txt`, `~/.config/je-lab/*`). Everything you need is in the code, docs, tests and the evidence pack.
- Shell hygiene: never `rm`/`mv`/`cp` over paths containing variables or globs; use literal absolute paths. Any command that would prompt for approval must be rewritten.
- Heavy builds: `nice -n 10`; put any dotnet build output under your checkout (not /tmp, which is nearly full).
- You may run the suites (`node tests/frontend/run.mjs`, `dotnet test tests/backend -p:JellyfinTarget=jf12`, `LANG=en_US.UTF-8 node tests/poster/parity/run.mjs --offline`, `npx playwright test --config tests/browser/playwright.config.cjs`) and your own offline probes (unit-level scripts that call the detectors with crafted stream metadata are especially useful for judging detection accuracy).

## Evidence pack
/home/jake/je-wt/features/.notes/evidence/round-1/ — start with `README.md` there (what changed since the previous state, test counts, parity summary), then `feature-inventory.md` (what exists with code pointers). Earlier research on comparable systems: `research-plex-overlays.md`, `research-tag-pipeline.md`, `inventory-je-tags.md` (older, may be outdated: check the code). The current user feature reference is `docs/enhanced/tags.md`; API `docs/advanced/api.md`; admin page `docs/advanced/admin-media-tags.md`.

## What to score (1–10 each, integers or halves; be honest and calibrated: 10 = best-in-class with nothing material missing)
1. Completeness against best-in-class poster tag/overlay systems: Kometa (Plex Meta Manager) default overlays, Posterizarr, Kometizarr, Plex media flags, Emby/Jellyfin native badges, the TRaSH-Guides custom-format vocabulary.
2. Detection accuracy and robustness: resolution/HDR variants (Dolby Vision profiles, HDR10+, HLG), audio (Atmos/TrueHD/DTS:X/lossless/object-based), editions/cuts, sources (REMUX/BluRay/WEB/HDTV/DVD/CAM), multi-version items, mixed-quality series/season aggregation, `.strm`/remote/unprobed media, languages (2/3-letter, regional, dubs vs subs, forced/SDH), rating sources and staleness, status/airing facts across time zones.
3. Configurability without complexity: per-user vs server defaults, rules, locks, item looks, presets, import/export; sane defaults; powerful but discoverable.
4. Native/TV parity: every web tag has a native poster equivalent where a static image can draw it; identical decisions (parity harness).
5. Performance and scale: large libraries (50k+ items), cache build/flush cost, request counts, client fitting cost, memory.
6. Reliability and failure modes: cache invalidation on every relevant change, provider outages, partial data, upgrades/migrations, concurrency.
7. Interoperability: import/export, API surface and its docs, Arr/Seerr/Maintainerr/MDBList/TMDB integrations, Spoiler Guard, other features of the plugin.
8. Documentation and discoverability: user docs, admin docs, API docs, in-app help copy.
9. Test coverage and verifiability: unit, browser, backend, parity, native identity, CI.
10. Internationalisation: strings, locales, RTL where relevant, date/number formats.

## Report
Write your report to /home/jake/je-wt/features/.notes/council/round-1-opus.md in this shape:

1. A scores table first: `| Category | Score | One-line justification |` for the ten categories, then a row `| Overall | x | … |`.
2. "Top 3 most valuable missing or weak capabilities", ranked. For each: what is missing or wrong (with file:line evidence), why it matters to users, and concrete, testable ACCEPTANCE CRITERIA (what must exist server/web/native/settings/docs/tests for you to consider it done).
3. "Other findings" per category: defects (with file:line and a reproduction or probe you ran), gaps, and anything that would lower a score. Mark each as defect / gap / nit.
4. "What would raise each category by one point" — one or two lines per category.
5. "Verified": what you actually ran (commands and results) versus what you only read.

Keep the report self-contained. Do not change anything outside your own checkout and the report file. When the report is written and your checkout removed, reply with the report path and the scores table.

- Read nothing under /home/jake/je-wt/features/.notes/ except the evidence folder for this round and your own report file.
