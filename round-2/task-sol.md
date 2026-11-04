You are reviewing the FEATURE SET and competence of the "Media Tags" system in Jellyfin Enhanced (a Jellyfin server plugin: C# server + injected JS web client + server-rendered poster tags for native TV/mobile apps). This is NOT a visual design review: judge what the system can do, how correctly it detects and decides, and how well it is engineered, documented, tested and localised.

Repository state to review: commit 878944212fa7d18f2695eadc7615a29534fd961c of branch `feat/media-tags-features` in the git repository at /home/jake/je-wt/features.

## Rules (read-only review)
- **Checkout.** If `/home/jake/je-wt/features` exists on your machine, work ONLY from your own detached worktree: `git -C /home/jake/je-wt/features worktree add --detach /home/jake/je-wt/review-checkouts/feature-r2-sol 878944212fa7d18f2695eadc7615a29534fd961c` (remove it at the end with `git -C /home/jake/je-wt/features worktree remove --force /home/jake/je-wt/review-checkouts/feature-r2-sol`). Otherwise make a fresh temporary directory and `git clone --depth 100 --branch feat/media-tags-features https://github.com/n00bcodr/Jellyfin-Enhanced <tmpdir>/repo`, then `git -C <tmpdir>/repo checkout 878944212fa7d18f2695eadc7615a29534fd961c`; delete the temporary directory when you finish.
- **Evidence.** If `/home/jake/je-wt/features/.notes/evidence/round-2/` exists, read it there. Otherwise `git clone --depth 1 --branch evidence/features https://github.com/4eh5xitv6787h645ebv/Jellyfin-Enhanced <tmpdir>/evidence` and read `<tmpdir>/evidence/round-2/`.
- **Tools.** Run `npm ci` (add `--offline` when the npm cache allows it) and the suites only if node, dotnet and Playwright are installed; otherwise review from code and evidence and say so in "Verified".
- Never edit, commit, stash or reset anything in `/home/jake/je-wt/features` or any other existing worktree, and never push anything except the report as described below. You make no code changes anywhere except scratch files inside your own checkout.
- Do not contact any Jellyfin server, container or lab, and do not open credential files (`/home/jake/je-lab/README.md`, `/home/jake/je-demo/CREDENTIALS.txt`, `~/.config/je-lab/*`). Everything you need is in the code, docs, tests and the evidence pack.
- Shell hygiene: never `rm`/`mv`/`cp` over paths containing variables or globs; use literal absolute paths. Any command that would prompt for approval must be rewritten.
- The machine may be CPU-saturated. Prefix EVERY test, build, parity or probe command with `nice -n 15`, and cap concurrency: frontend `node tests/frontend/run.mjs --test-concurrency=2`, Playwright `--workers=2` (set `JE_BROWSER_PORT` to a free port, e.g. 4400–4499), `dotnet test … -m:1`. Never run two heavy suites at the same time, and run each full suite AT MOST ONCE in this review (prefer targeted test files and small probes). Put dotnet build output under your checkout, not /tmp.
- You may run the suites (`nice -n 15 node tests/frontend/run.mjs --test-concurrency=2`, `nice -n 15 dotnet test tests/backend -p:JellyfinTarget=jf12 -m:1`, `LANG=en_US.UTF-8 nice -n 15 node tests/poster/parity/run.mjs --offline`, `nice -n 15 npx playwright test --config tests/browser/playwright.config.cjs --workers=2`) and your own offline probes (unit-level scripts that call the detectors and resolvers with crafted metadata are especially useful for judging detection accuracy).
- Read nothing under `/home/jake/je-wt/features/.notes/` except this round's evidence folder and your own report path.

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
Write your report to /home/jake/je-wt/features/.notes/council/round-2-sol.md if that directory exists. Otherwise commit it as `reports/round-2-sol.md` in your evidence clone (`git -c user.name=Jake -c user.email=45441845+4eh5xitv6787h645ebv@users.noreply.github.com commit`, message `docs: round 2 report`, no other files) and `git push origin HEAD:evidence/features` (pull with rebase and retry once if the push is rejected; never force). The report shape:

1. A scores table first: `| Category | Score | One-line justification |` for the ten categories, then a row `| Overall | x | … |`.
2. "Top 3 most valuable missing or weak capabilities", ranked. For each: what is missing or wrong (with file:line evidence), why it matters to users, and concrete, testable ACCEPTANCE CRITERIA (what must exist server/web/native/settings/docs/tests for you to consider it done).
3. "Other findings" per category: defects (with file:line and a reproduction or probe you ran), gaps, and anything that would lower a score. Mark each as defect / gap / nit.
4. "What would raise each category by one point" — one or two lines per category.
5. "Verified": what you actually ran (commands and results) versus what you only read.

Keep the report self-contained. Do not change anything outside your own checkout and the report file. When the report is written and your checkout (or temporary clone) removed, reply with where the report is (local path or evidence-branch path) and the scores table.
