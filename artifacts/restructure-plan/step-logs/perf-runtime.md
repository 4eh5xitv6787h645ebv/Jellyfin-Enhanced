# Runtime performance against upstream (2026-11-10 and 11)

Branch `perf/runtime` from `restructure/integration` `2917a115`, worktree `je-perf-runtime`. Task: remove the runtime
regressions of the rewrite against upstream `2e0f9251` that the benchmark `je-upstream-bench/results/20261110-080431`
measured on rewrite `e08bb100`; every fix found by profiling and proven by measurement; no behaviour change. Nothing
was pushed; no live server was contacted (labs only, through the benchmark harness and `je12`).

Two machines were used. **Timing** was measured only on `t3-lenovo` (10 cores, 14 GB, shared with other agents),
under the gate lock. **Correctness** work (je12 lab, smoke, behaviour checks, gates) ran on the second machine
(`jebench@192.168.0.146`, 16 cores, process-backend labs, checkout `/var/lib/jebench/projects/je-perf-runtime`), and
the last gate on the Lenovo; "Gates" says which result came from where.

## Result

Final full run of the harness, upstream `2e0f9251` against `b3f18431`:
`/home/jake/projects/je-upstream-bench/results/20261111-002807` (9 measured runs per cell, 5 endpoint rounds, 0 of 41
batches started under load, teardown clean, `je-perf-real-seerr` untouched). "Original" is the report this work
started from (rewrite `e08bb100`); the baseline re-measured on the tip `2917a115` is in its own section. Median
(IQR); Δ is rewrite − upstream.

| # | Regression | Original: upstream → rewrite | Final run: upstream → rewrite `b3f18431` | Verdict |
|---|---|---|---|---|
| 1 | JE main-thread JS per page load, on stack (ms). Home cold | 169 → 189 (+12%) | 166 (163–169) → 180 (175–183), +8% | smaller, **not** within noise |
| | Library cold | 226 → 256 (+13%) | 219 (217–221) → 230 (226–234), +5% | smaller, not within noise |
| | Details cold | 184 → 211 (+15%) | 185 (182–188) → 201 (194–203), +8% | smaller, not within noise |
| | Details warm | (self +53%) | 127 (126–131) → 143 (140–144), +13%; self 97 → 108, within noise | not within noise on stack |
| | Playback cold | 43 → 52 (+21%) | 44 (37–45) → 61 (58–65), +37% | **worse in this run**: 12 of the 17 ms are `tag-cache-store.js` reading a larger stored cache (see below) |
| | Home cold, 4× CPU and slow network | 805 → 913 (+13%) | 764 (759–773) → 817 (800–836), +7% | smaller, not within noise |
| | Library cold, throttled | 1,011 → 1,144 (+13%) | 988 (978–989) → 1,053 (1,038–1,065), +7% | smaller, not within noise |
| | Details cold, throttled | 832 → 946 (+14%) | 808 (804–843) → 884 (876–885), +9% | smaller, not within noise |
| 2 | Playback total blocking time (ms), with the sampling profiler | 230 → 273; 1,254 → 1,543 throttled warm | 225 → 271; 1,229 → 1,481 | the instrument: the one long task is the profiler starting |
| | without the profiler, unthrottled | – | 0 → 0 (no task over 50 ms on either side) | level |
| | without the profiler, 4× CPU | – | cold 29 (11–34) → 53 (47–55); warm 16 → 57, within noise | one more task over 50 ms at 4× throttle; not attributed |
| 3 | Playback: failing artwork probes per start (Disc / Backdrop / Logo) | 3 / 2 / 1 → 6 / 4 / 2 | 3 / 2 / 1 → 3 / 2 / 1 | **gone** |
| 4 | Jellyfin RSS after the page-load loop (MiB), one sample per side | 459 → 632 (+173) | 605 → 717 (+113) | the deterministic part is gone (first bundle: +87 → +28 MiB, upstream +27); the rest follows GC timing, see "4" below |
| 5 | Throughput at 16 connections (req/s): `version` | 1,724 → 1,264 (−27%) | 1,853 (1,705–1,912) → 1,419 (1,368–1,793), −23%, p = 0.04 | **not settled**: over six fresh pairs of server processes −6%, 4 of 6 lower, p = 0.22 (within the process-to-process spread); this run's pair was one of the low ones |
| | `bootstrap` | 855 → 683 (−20%) | 852 → 812 (−5%), p = 0.06 | within noise |
| | `private-config` | 892 → 741 (−17%) | 915 → 933 (+2%), p = 0.68 | within noise |
| | `public-config` | 1,373 → 1,255 (−9%) | 1,732 → 1,581 (−9%), p = 0.21 | within noise |
| 6 | Plugin DLL (bytes) | 14,956,032 → 31,688,704 | 14,956,032 → 14,271,488 | **gone** (4.6% smaller than upstream) |
| 7 | `dotnet build`, clean (s) | 3.8 → 9.4 | 3.9 (3.9–4.5) → 8.4 (8.3–8.4), n = 3; 7 interleaved rounds: 3.85 (3.83–3.96) → 8.60 (8.38–8.62), `2917a115` 9.36 (9.32–9.48) | smaller; what remains is the client check inside the build |

The original report's other headline numbers, final run: Home cold nav → JE ready 680 → 689 ms (within noise;
throttled 5,997 → 5,281, −12%); Home cold total blocking time 100 → 104 ms (within noise; throttled 1,431 → 1,457,
within noise); JE transfer on a cold Home load 3,612 → 2,989 KiB (−17%); JS heap after GC at idle 30.8 → 31.4 MiB
cold (+2%, as before) and 20.3 → 22.1 MiB warm (+9%, of which 1.5 MiB is the price of the parenthesized modules,
below); `bundle.js` 1,325,426 → 482,908 bytes on the wire and 12.5 → 0.35 ms p50; `index.html` 5,607 → 1,098
bytes; `bootstrap` 4.24 → 4.28 ms p50; plugin load at startup 285 → 285 ms; restart to first `public-config` 3.85 →
3.75 s.

**How to read row 1.** In this run the two servers handed the browser different tag-cache deltas (3.5 MB upstream,
5.4 MB rewrite; instrument problem 2 below), and `js/tags/tag-cache-store.js` parses and stores that on the main
thread. Without that one script the difference is Home cold 117.2 → 125.0 (+7.8 ms, +7%), library cold 172.3 →
181.9 (+9.6, +6%), details warm 122.1 → 128.3 (+6.2, +5%), playback cold 32.6 → 39.2 (+6.6). By script (Home
cold, `fn-report`): the loader is now 8.3 ms *cheaper* than upstream's (14.6 → 6.3: the module functions are
compiled off the main thread), `decodeTranslations` and the look's copies are gone (translations.js +0.8,
tag-layout.js +0.6, were +5.2 and +3.6), validating the bootstrap reply is the +1.0 it was, and the rest is the
evaluation of the feature modules themselves, +11.5 ms spread over about 150 scripts (cause 1A), which this work
did not reduce. So of the original +20 ms on Home 12 to 14 remain in this run, 8 without the tag-cache script.

What is not within noise and why is in "What remains".

## Which measurements stand

From 20:09 on 2026-11-10 the rule for this work was: at most two labs at a time (the pair being measured), each
removed once measured, no timed run with a 1-minute load of 3 or more or under 3 GB of available memory, gate lock
held. Everything taken earlier with four labs up or under load was measured again and is **not** used in this log's
tables:

| Measurement | Status |
|---|---|
| `results/20261110-161541-quick` (run.sh quick on the tip; 8 of the first 16 loads started at load ≥ 3, endpoints while the load went to 15) | not used; direction only |
| `results/ab-base-pages-20261110-170708`, `ab-base-playback-*`, `ab-base-playback-noprof-*` (session 1: two labs, load 0.9 to 2.8, no run dropped) and the heap dumps of that session | **stands** (baseline, causes) |
| `results/ab-base-dyn-20261110-170430` (endpoint rounds, all started at load ≥ 3) | not used; measured again as `ab-tip-dyn-20261110-222613` |
| Session 2 (four labs up): `ab-fix-pages-*`, `ab-fix-playback-noprof-*`, `ab-fix-dyn-after-loop-*`, `ab-firstbundle-s2.jsonl` | not used; measured again in session 3 |
| Single samples at 16:31 to 17:58 on the Lenovo (decoder microbenchmark, first bundle, client-check phases) | not used; measured again (microbenchmark on the second machine, the others in sessions 3 and 4) |
| Session 3, 22:24 to 23:36 (`ab-tip-dyn-*`, `ab-p2-pages-*`, `ab-p2-playback-noprof-*`, `ab-p3-pages-*`, `ab-firstbundle-s3.jsonl`, `ab-buildtime-s3.jsonl`): one pair at a time, every timed step after a quiet check | **stands** |
| First final run `results/20261110-233639` (upstream against `53695bbb`) | stopped after 20 minutes, not used: the gate had found a bug in that tree (see "Gates") |
| Final run `results/20261111-002807` (upstream against `b3f18431`, 00:28 to 01:53) | **stands** |
| Sessions 6, 7 and 9, 01:59 to 04:00 (`ab-inv*`, `ab-inst-*`, `ab-buildtime-s4.jsonl`, `ab-firstbundle-s4.jsonl`): one pair at a time, quiet checks | **stands** |

## Instruments

The benchmark harness (`/home/jake/projects/je-upstream-bench`, no git history; the files as they were are in its
`.orig-20261110/`, the additions are described in its README, "perf-runtime extensions") was extended:

- **Per-function attribution** (`browser-bench.mjs`, `fnDetail`): every CPU-profile sample with a JE frame on the
  stack is charged to the deepest JE frame, the outermost one, the top frame when it is JE code, and, when the
  loader's `runBundleModules` is on the stack, to "module evaluation". `lib/fn-report.mjs` maps frames to component
  scripts (the same `js/<path>` key on both arms, from the bundle's `/* ---- js/<path> ---- */` markers), to
  TypeScript sources through `bundle.js.map`, and to features through `client/entries`.
- **Main-thread breakdown by trace event** inside the longest task, and **who started each Jellyfin request** (first
  JE frame of the initiator stack, with its time).
- **`ab.sh`**: a persistent A/B lab with run.sh's fairness rules (same golden snapshot, Jellyfin 12.4, 4 CPUs,
  Sonarr/Radarr/Seerr off before the plugin first loads, REJECT rules), arms interleaved within each run, run 0
  discarded, load and available memory recorded per run; it refuses a third lab. `lib/ab_report.py` reports medians,
  IQR, a Mann-Whitney p and the per-run paired differences with a Wilcoxon p.
- **Quiet check** (`lib/quiet.sh`, run.sh `strictQuiet`): a timed step waits until the 1-minute load is under 3 and
  3,000 MB are available, and is not measured if that does not happen; a run that started at load ≥ 3 is dropped for
  every arm.
- **Endpoint rounds**: the throughput measurement repeated with the arm order rotated (7 rounds in `ab.sh`, 5 in
  `run.sh`).
- **Playback without the sampling profiler** (`--no-cpu-profile`; `run.sh` now adds such a pass).
- **Server diagnostics** (`lib/diag.sh`, `lib/first-bundle.sh`): process memory from `smaps_rollup`, `dotnet-gcdump`
  (heap by type after a forced GC), `dotnet-counters` once a second and `dotnet-trace` (thread stacks, or allocation
  ticks with `gc-verbose`) through the container's diagnostic socket, and the cost of the first `bundle.js` after a
  restart. `lib/alloc-report` sums a trace's allocation ticks by type, plugin frame and controller action;
  `lib/cpu-usage.py` shows what each server's cgroup does while the other is measured; `strace -c` counted system
  calls during a burst. The session scripts as they ran are in the harness's `sessions-perf-runtime/`.

Five problems found in the instrument itself; they change how the original report reads:

1. **The playback cell's "total blocking time" is the profiler's own start-up.** In that cell the trace starts on a
   page that is already loaded, and the cell's single long task is `CpuProfiler::StartProfiling` (288 ms upstream,
   311 to 329 ms rewrite): V8 walking the page's compiled code when the sampling profiler starts. With the profiler
   off playback start has **no task over 50 ms on either arm** (TBT 0 and 0).
2. **A page load's `since=` tag-cache delta depends on the server's history, not on the code.** After the full
   cache a client asks for a delta, and how big it is depends on what that server updated in place since its cache
   was built: 0.08 MB, 3.4 MB and 5.1 MB on three arms of one session. The client parses and stores it on the main
   thread, so arms created or restarted at different times are not comparable (a warm Home load costs about 18 ms
   more JE time with a 5 MB delta than with none). `run.sh` creates and restarts its two servers in lockstep, so
   its arms matched in the original report (5.2 and 5.3 MB) but not in the final run (3.5 and 5.4 MB); `ab.sh` now
   rebuilds the tag cache on every arm before a browser cell and the report prints the delta per arm (they still
   differ by 6 to 25% between the arms of a pair, which is why the per-function numbers below, not the page
   totals, carry the per-fix claims).
3. **The measured window of a warm load is bimodal.** A load ends at "JE ready, then 2 s without a request in
   flight"; on warm loads one late request decides whether that is 3.0 s or 4.9 s after navigation, and the longer
   window contains about 15 ms more JE work that has nothing to do with the load. The report now also gives every
   time-based metric over a fixed window, navigation to JE ready + 2 s ("to ready+2s").
4. **One RSS sample after a page loop measures when the last full GC ran.** See cause 4: the same server reads 680
   or 1,248 MiB after comparable loops.
5. **Throughput at 16 connections differs between server processes of the same build**, and by 10 to 20% from one
   2,000-request sample to the next on either side (the host allocates 533 KB and collects 0.05 times per request
   on this path and saturates its 4 cores). Rounds on one pair of processes do not average that out.

## Baseline on the current tip

`2e0f9251` against `restructure/integration` `2917a115`, A/B lab, quiet machine
(`results/ab-base-pages-20261110-170708`, 10 runs per cell, no run dropped; median (IQR)):

| Cell (unthrottled) | upstream | rewrite `2917a115` | paired difference |
|---|---|---|---|
| Home cold, JE main-thread JS on stack (ms) | 168 (167–169) | 189 (188–192) | +20.1, 10 of 10 runs up, p = 0.002 |
| Home warm | 118 (114–121) | 134 (133–136) | +14.4, 10 of 10 |
| Library cold | 224 (221–226) | 256 (253–263) | +29.0, 10 of 10 |
| Library warm | 170 (165–172) | 186 (182–188) | +15.9, 10 of 10 |
| Details cold (7 runs) | 185 (182–187) | 209 (207–209) | +24.7, 7 of 7 |
| Playback cold, with the profiler: TBT (ms) | 225 (112–232) | 270 (269–274) | +47.0, 7 of 7 |
| Playback cold, without the profiler: TBT (ms) | 0 | 0 | 0 |
| Playback: requests through JE per start | 33 | 42 | +9 in every run |
| Playback: failing image probes per start | 6 | 12 | +6 in every run |

(In that session the tag-cache delta was 3.4 MB on the upstream arm and 0.08 MB on the rewrite arm, so its warm rows
understate the gap.) Throughput on the tip, 7 rounds, load 2.4 to 3.0 before each measurement
(`results/ab-tip-dyn-20261110-222613`), requests per second at 16 connections, upstream against `2917a115`:
`public-config` 1,749 and 1,741 (p = 0.70), `private-config` 857 and 883 (0.80), `bootstrap` 870 and 847 (0.13),
`version` 1,764 and 1,696 (1.00).

Status of the seven on the tip: 1 stands in every cell. 2 is the instrument (above). 3 stands. 4 stands in part
(below). 5 does not show on fresh servers and does once they have served the other endpoints (below). 6 and 7 stand.

## Causes

### 1. JE main-thread JavaScript (+12% to +23%)

Home, cold, 10 runs: upstream 168.6 ms, rewrite 189.7 ms, +20.8 ms. By component script the difference is four
visible items and a long tail (`fn-report`, mean per load, ±2 standard errors):

| Where | upstream | rewrite | Δ |
|---|---|---|---|
| Module evaluation at boot (samples under `runBundleModules`), all 171 scripts | 17.6 | 28.6 | **+11.0** |
| `js/enhanced/translations.js` (`decodeTranslations` 4.7 ± 0.2) | 2.8 | 8.0 | **+5.2 ± 0.4** |
| `js/core/tag-layout.js` after boot (`pick` 1.6, `childrenOf` 0.9) | 11.8 | 15.5 | **+3.6 ± 0.6** |
| `js/contracts/bootstrap.js` (validating the bootstrap reply) | 0 | 1.0 | +1.0 ± 0.1 |

On a library page the same four are +11, +4.6, **+9.4 ± 1.8** (`pick` 6.4 ± 0.6, `childrenOf` 2.7) and +1.2, of
+30.5 ms.

- **A. Module evaluation: +11 ms on every page.** 151 of the 171 scripts cost more to evaluate than upstream's, by
  0.03 to 0.5 ms each (no script by 1 ms or more; 7 by 0.3 to 1 ms, 33 by 0.1 to 0.3, 131 by less). This is the
  boot-time work every feature now repeats: each component script is its own esbuild bundle, so it carries, compiles
  and runs its own copy of what it imports (feature host, lifetime, decoders, validation tables), builds its own
  feature context (`host/context.ts`, 1.3 ms in total) and looks its shared modules up; upstream's scripts read one
  shared `JE.helpers`. 43 scripts that cost nothing measurable upstream (they only define functions) sum to 7 ms.
  Part of the cost is compilation: every module function in `bundle.js` was a bare `function () {…}` element that
  V8 compiles lazily on the main thread at its first, and only, call (9.6 ms of `runBundleModules` self time;
  upstream has the same 9.8 ms).
- **B. `decodeTranslations`: +4.7 ms on every page, cold and warm.** The rewrite validates a locale and copied each
  of its ~1,400 keys into a new object with `Object.defineProperty`; a page decodes two locales, in cold code. In a
  fresh process (second machine, Node 26.13, 15 samples) the two English locales take 7.94 ms that way, 4.84 ms
  copied by assignment and 0.36 ms checked where they stand.
- **C. Whole-object copies to read one field: +1.6 ms Home, +6.4 ms library.** The look's `pick(obj, key)` built
  `Object.fromEntries(Object.entries(obj))` for every field it read: twice on the plugin configuration (433 keys),
  about eight times per card on the card's tag-cache entry. `childrenOf` built `Array.from(el.children).filter(…)`
  in every fit-measuring loop (+0.9 and +2.7 ms). Upstream reads the field and iterates the collection directly.
- **D. Validating the bootstrap reply: +1.0 ms.** Deliberate (upstream trusts the reply). Left as it is: it is one
  walk of a 22 KB document.

What is not worse is the page's total blocking time: level in every page cell of the final run (−3 to +8 ms
unthrottled, all within noise). Main-thread busy time is 1 to 3% higher there (10 to 27 ms; within noise in three of
the six unthrottled cells).

### 2. Playback total blocking time (+16% to +23%)

The instrument, see above: `CpuProfiler::StartProfiling` is the cell's only long task. Its length follows the
amount of compiled code in the page, and the rewrite has more distinct functions compiled (cause A). No product
change; the pass without the profiler is the way to measure it.

### 3. Playback asks for missing artwork twice

`net.hostDetail` (requests with initiator and time) on a playback start: the rewrite's pause screen requests
`GET /Items/{id}` and its eight image probes at +281 to +320 ms after the Play click, and all of them again at
+628 to +682 ms, right after jellyfin-web's `POST /Sessions/Playing` at +587 ms. jellyfin-web creates the `<video>`
while the details route is still current and changes the route to the player once playback has started. The
rewrite's player modules each have a "lifetime" that resets on every navigation (`features/player/lifetime.ts`;
upstream has no such reset), the pause screen answered the reset with `clearState()`, and the next body mutation
took the same video for a new one: caches cleared, everything requested again. 33 → 42 requests through JE per
playback start; in the lab library six of the nine extra ones fail (no such image), the rest are a second item
request and two revalidations.

### 4. Server memory after the page-load loop (459 → 632 MiB)

Measured four ways, because one RSS sample per side cannot carry this:

- **The first `GET bundle.js` after a server start** (`first-bundle.sh`, one restart per sample, sides interleaved):
  upstream 49 ms (47–52) and +27 MiB RSS (25–28), 7 restarts; `2917a115` 243 ms (238–253) and +87 MiB (84–93), 8
  restarts. `ClientScriptBundle` built `bundle.js.map` with the script: two embedded maps parsed per module (about
  360 JSON documents, 13.5 MB), their TypeScript text copied across, 10.8 MB serialized and kept. Only a browser
  with developer tools open asks for the map. This part is deterministic and is what the fix removes.
- **The live managed heap after a forced GC** (`dotnet-gcdump` after a page loop): upstream 153.9 MB, `2917a115`
  171.0 MB, and the largest difference is one 10,837,745-byte array, the map. With the fix, and the map requested
  once (by the harness), 167.6 MB against 178.1 MB.
- **What the same page loads allocate** (`dotnet-trace` `gc-verbose` on both servers during the same 48 loads, summed
  allocation ticks, `ab-inv-syscalls-20261111-024111/alloc-*.txt`): upstream 1,656 MiB, final 1,557 MiB; on the large
  object heap 329 and 317 MiB, all of it the tag-cache responses (`GetTagCache`, 6.6 to 6.8 MiB per load, the same
  code on both sides); by controller action the two lists are the same. The rewrite does not allocate more.
- **RSS after a loop follows the timing of the last full GC.** Both servers produce about 7 MiB of large-object
  garbage per page load, which only a generation 2 collection frees, and committed memory is given back minutes
  later. Paired samples, upstream / final, in MiB: 605 / 717 (the final run), 797 / 680 (after the 48 traced loads),
  770 / 766 (after 108 more loads on the same servers) and 789 / 1,248 (an earlier 108-load loop, in which my harness
  had fetched the source map from the rewrite, so it was built, and the rewrite's large object heap stood at 485 MB at
  its last GC against 199 MB). Once a second over the 108-load loop (540 s, `loop2-counters-*.csv`): working set
  median 744 (720–761), highest 830 MiB upstream; 887 (765–928), highest 982 MiB final; generation 2 collections 12
  and 10. The difference is one stretch of about four minutes after the rewrite's large object heap had grown to
  462 MB between two collections (upstream's highest: 292 MB); both ended level.

### 5. Throughput at 16 connections

The plugin's code on these requests is the same on both sides: the `version` action is one identical line, the five
MVC filters are textually identical apart from namespaces, the two middlewares take the same early exit, and the
rewrite's controller has fewer constructor dependencies. Single-connection latency is the same (`version` p50
2.34 ms against 2.35 ms in the final run), and so are the allocation per request (533 KB, Jellyfin's own
authentication path) and the GC count during a burst (1,587 against 1,586 generation 0 collections for 31,000
requests). What was measured, upstream against the final commit, `version` at 16 connections:

| Servers | Rounds | upstream | final | |
|---|---|---|---|---|
| fresh, nothing else requested (`ab-inv1`) | 7 | 1,577 (1,546–1,625) | 1,575 (1,527–1,658) | level, p = 1.00 |
| run.sh's sequence, every endpoint (`ab-inv2`) | 5 | 1,890 (1,879–1,903) | 1,713 (1,712–1,852) | −9%, p = 0.022 |
| the same servers afterwards, `version` only (`ab-inv3`) | 7 | 1,900 (1,838–1,929) | 1,706 (1,663–1,793) | −10%, p = 0.015 |
| new servers, warmed with every endpoint (`ab-inv7`) | 7 | 1,838 (1,427–1,886) | 1,715 (1,658–1,806) | −7%, p = 0.70, within noise |
| final run | 5 | 1,853 (1,705–1,912) | 1,419 (1,368–1,793) | −23%, p = 0.04 |
| six fresh pairs of servers, each warmed with every endpoint, median of 3 rounds per pair (`ab-inst-*`) | 6 × 3 | 1,843 (six pairs: 1,607 to 1,920) | 1,735 (1,480 to 1,886) | −6%; per pair +2, −16, −7, −2, +8, −16%; paired p = 0.22 |

So the two are level on fresh servers. Once the servers have served the other endpoints, a pair of server processes
can sit 16% apart for as long as it lives (rounds on one pair agree with each other), in either direction: over six
fresh pairs the rewrite was lower in four (two of them by 16%) and higher in two (one by 8%), with the same or
slightly better single-connection latency (p50 2.19 to 2.37 ms against 2.25 to 2.36 ms). The original report and
the final run each measured one pair. Looked for and not found: background work on the idle server (CPU of each server's cgroup every
0.5 s while the other was measured: 0.02 cores on both); per-request file-system calls (`strace -c` during a burst:
none on either side); more allocation or more collections (above). Seen, but not steadily: in one 30,000-request
burst the rewrite's server spent 13 s in kernel time against 3 s and its thread pool grew by 8 threads, in the next
session the same burst showed 6 s against 7 s and the rewrite was the faster one (1,814 against 1,677 req/s);
`strace` counted 28 `sched_yield` calls per request on the rewrite's server against 0.3, which is threads spinning
on a lock or in the thread pool, and under `strace` its throughput fell to 1,126 against 1,703. That points at
scheduling inside the server process (thread-pool size and lock spinning at 4 saturated cores) rather than at work
the plugin does per request, and it differs from one server process to the next. The cause was not located.

### 6. Plugin DLL size (14,956,032 → 31,700,992 bytes)

Embedded resources by size (bytes):

| Group | upstream | rewrite |
|---|---|---|
| `js/**/*.js` readable scripts | 4,982,743 (206 files) | 4,504,243 (207) |
| `js/**/*.js.map` source maps | – | 11,235,944 (207) |
| `min/**/*.js` minified twins | – | 2,364,234 (182) |
| `min/**/*.js.map` | – | 2,328,337 (182) |
| `js/locales/*.json` | 3,355,794 (33) | 3,356,957 (33) |
| other `js/**` (fonts, data files, manifest) | 1,137,630 (11) | 1,137,638 (11) |
| `Assets/**` | 1,417,711 (283) | 1,417,721 (283) |
| `Configuration/**` (pages, admin scripts and styles) | 792,801 (8) | 2,008,183 (11); `configPage.html` is 1,362,152, of which 996,304 are inline source maps |
| `PluginPages/**` | 15,229 (7) | 336,818 (7) |
| **total embedded** | **11,701,908** | **28,690,075** |

The maps and the twins are 15.9 MB of the 17.0 MB difference in embedded bytes (the code itself is 0.25 MB smaller).

### 7. `dotnet build` (3.8 → 9.4 s)

The build runs `client-build.mjs --check` (5.2 to 5.4 s on `2917a115`): the type check (3.5 to 3.8 s), a source-policy scan of 0.4 s, and 392
esbuild bundles made one after another (1.4 to 1.7 s). The type check is what `perf/test-speed` caches (`JE_TYPECHECK_CACHE_DIR`,
commit `27ec6f40`), so it was left alone here.

## Changes

One cause per commit, largest effect first within each area.

| Commit | Cause | Change |
|---|---|---|
| `d191c452` perf(shared): check a locale dictionary without copying it | 1B | `decodeTranslations` checks the parsed dictionary where it stands and returns it (same errors). |
| `55bb6721` fix(player): pause screen keeps its playback across the route change to the player | 3 | The lifetime reset leaves the pause screen's state alone when the video it follows is still in the page and the new route is the player. Every other reset clears as before. |
| `71f5224d` perf(media-tags): the look reads a field without copying its object | 1C | `pick` reads the own enumerable property in place; `childrenOf` walks the children once. |
| `8842a87f` perf(platform): build the bundle's source map when it is first requested | 4 | The script build records where each module sits; the map is built from that on its first request (same bytes, encodings and validators). |
| `c2bc778d` perf(platform): parenthesize the bundle's module functions | 1A | Each module function is `(function () {…})`, which V8 compiles with the script on its streaming thread instead of lazily on the main thread. |
| `7310cd6b` perf(platform): embed the client's text assets packed | 6 | Scripts, maps, twins and locales (23.8 MB) are embedded brotli-packed (6.2 MB); every embedded resource is read through `Infrastructure/Assets/PackedResources`. |
| `ecc5a6dd` perf(build): bundle the client entries at once | 7 | All esbuild bundles are started together and taken in the old order. |
| `b3f18431` docs(frontend-build) | – | The three bundle and build facts above, in `docs/rewrite/frontend-build.md`. |

(The same changes carried other SHAs while the branch was being built; measurements name the SHA they ran on:
`3ac4300b` is the tree of `8842a87f`, `53695bbb` the tree of the branch before the packed-resource readers were
completed. `b3f18431` differs from `53695bbb` in eleven C# call sites that open an embedded resource, the size
budget, one docs paragraph and the tests; no client file and no served byte differs.)

### Before and after, per change

After the two-lab rule the fixes were measured as two interleaved A/B pairs instead of one pair per commit:
`2917a115` against the first four fixes (`ab-p2-*`, 8 runs per cell), and those against the final client
(`ab-p3-*`, 8 runs; details 5). Within a pair each fix is told apart by the profile: each one changes a different
function, and the table gives that function's own time (mean per load, JE frames on stack).

**`d191c452` locale check (1B)**, `decodeTranslations` and its script, ms per load, `2917a115` → fixes:

| | Home cold | Home warm | Library cold | Details cold |
|---|---|---|---|---|
| `decodeTranslations` | 4.6 → 0.1 | 4.2 → 0.1 | 4.0 → 0 | 4.4 → 0 |
| `js/enhanced/translations.js` | 7.7 → 3.6 | 7.8 → 3.7 | 6.0 → 2.3 | 7.7 → 3.5 |

Larger than noise: the function's time is gone in every cell (its standard error was 0.2 ms).

**`71f5224d` field reads (1C)**, ms per load: `pick` 1.4 → 0 (Home cold) and 6.7 → 0 (library cold); `childrenOf`
0.9 → 0.3 and 2.9 → 0.6; `js/core/tag-layout.js` 14.7 → 12.4 and 36.5 → 27.0. Larger than noise on the library
page, where the page total moves with it (next table); on Home it is 3 ms inside a page total whose spread is 6 ms.

**Page totals for the first four fixes** (JE main-thread JS on stack, ms, median (IQR), Mann-Whitney p):

| Cell | `2917a115` | four fixes | difference |
|---|---|---|---|
| Home cold | 193 (189–196) | 189 (184–195) | −3.7, p = 0.50, within noise |
| Library cold | 259 (253–261) | 242 (236–249) | −16.6, p = 0.010 |
| Library warm | 215 (211–219) | 207 (203–210) | −8.0, p = 0.018 |
| Details cold | 211 (208–212) | 205 (203–207) | −6.8, p = 0.024 |
| Details warm | 167 (166–171) | 159 (157–160) | −8.8, p = 0.002 |

(Home warm is not listed: the two arms fell on different sides of the bimodal window, problem 3 above; the fixed
window did not exist yet in that pair. Tag-cache deltas 9,447 and 8,893 KiB.)

**`55bb6721` pause screen (3)**, playback start without the profiler, 7 runs per arm, identical in every run:
requests through JE 42 → 33, failing image probes 12 → 6 (upstream: 33 and 6). TBT 0 → 0; play start 772 → 781 ms
cold (p = 0.37, noise) and 814 → 781 ms warm (p = 0.015).

**`8842a87f` lazy source map (4)** and **`7310cd6b` packed assets (6)**, first `GET bundle.js` after a restart:

| Build | restarts | first `bundle.js` (ms) | RSS after it (MiB) | second request (ms) | first `bundle.js.map` (ms) | RSS after the map (MiB) |
|---|---|---|---|---|---|---|
| upstream | 7 | 49 (47–52) | +27 (25–28) | 16.3 | – (no map) | +28 |
| `2917a115` | 8 | 243 (238–253) | +87 (84–93) | 2.0 | 148 (138–156), already built | +118 (112–126) |
| lazy map (tree of `8842a87f`) | 7 | 139 (135–140) | +34 (27–36) | 2.0 | 253 (247–256), built now | +106 (101–114) |
| final `b3f18431` (packed assets) | 8 | 136 (135–138) | +28 (26–28) | 1.9 | 267 (265–269) | +106 (103–117) |

One restart per sample, sides interleaved in pairs (sessions 3 and 9, load 0.02 to 2.9). The lazy map takes 104 ms
and 53 MiB off the first request, far outside the spread (IQRs of 5 to 15 ms and 9 MiB). Packing changes neither beyond the spread (139 → 136 ms;
the pair measured side by side in session 3 read 130 and 137 ms on 3 restarts each) and makes the map 14 ms slower to
build. A browser that asks for the map pays what the eager build used to cost everyone.

**`c2bc778d` parenthesized modules (1A)**, four fixes → final client, fixed window (to ready+2s), JE main-thread JS
on stack, ms:

| Cell | four fixes | final | paired difference |
|---|---|---|---|
| Home cold | 162 (158–163) | 150 (149–152) | −11.7, 0 of 8 runs up, p = 0.008 |
| Home warm | 148 (146–149) | 136 (135–137) | −11.9, p = 0.001 |
| Library cold | 219 (217–223) | 207 (205–211) | −11.3, p = 0.018 |
| Library warm | 198 (195–202) | 187 (185–190) | −10.8, p = 0.004 |
| Details cold (5 runs) | 181 (181–181) | 174 (174–175) | −7.3, p = 0.012 |
| Details warm (5 runs) | 156 (153–158) | 154 (153–161) | −1.6, p = 0.84, within noise |

What it costs, measured in the same pair: the streaming thread parses and compiles what the main thread used to
(background parse 26.6 → 34.2 ms, off the main thread), main-thread compile +0.9 ms and evaluate +0.9 ms, and the JS
heap after GC grows by 0.2 MiB on a cold load and 1.5 MiB on a warm one (25.7 against 24.2 MiB on Home warm: code
that used to be compiled only when called is now kept from the start). TBT does not move (p = 0.19 to 0.88).
Main-thread busy time moves both ways: library warm −25 ms (p = 0.007), details warm +50 ms (p = 0.012, 5 runs),
the other four cells within noise.

**`7310cd6b` packed assets (6)**: DLL 31,700,992 → 14,271,488 bytes (upstream 14,956,032); embedded bytes
28,690,075 → 11,172,368 (upstream 11,701,908). The packing step adds 0.16 to 0.24 s to a clean build and 0.05 s to
an incremental one; the first bundle request is not slower beyond the spread (table above).

**`ecc5a6dd` bundling at once (7)**, clean plugin build and the client check inside it:

| 7 clean builds each, interleaved | upstream | `2917a115` | final `b3f18431` |
|---|---|---|---|
| `dotnet build` wall (s) | 3.85 (3.83–3.96) | 9.36 (9.32–9.48) | 8.60 (8.38–8.62) |
| of which the client check (`Exec`, s) | – | 5.51 (5.50–5.53) | 4.55 (4.54–4.67) |
| C# compiler (s) | 2.94 | 2.79 | 2.83 |
| `client-build.mjs --check` alone (s) | – | 4.99 (4.96–5.02) | 3.88 (3.87–3.92) |
| its bundling phase (s) | – | 1.50 (1.46–1.52) | 0.43 (0.38–0.50) |
| its type check (s) | – | 3.50 (3.47–3.52) | 3.46 (3.42–3.49) |

Final against `2917a115`, paired by round: −0.98 s (−0.31 to −1.04), lower in 7 of 7; the spread within a side is
0.1 to 0.3 s. That is the bundling change (−1.07 s) less the packing step it now also runs (+0.16 to 0.24 s).

## Guards

| Guard | Where | What it would have caught |
|---|---|---|
| `Object.defineProperty` calls while a 1,500-key locale loads twice stay under 150 | `tests/frontend/core/core-translations.test.mjs` | The per-key copy in `decodeTranslations` (3,000 calls). |
| A playback start in jellyfin-web's order (video first, then the route change) makes one item request and probes each image once | `tests/frontend/features/player/features-pause.test.mjs` | The doubled item request and image probes (regression 3). |
| Resolving a card's look enumerates neither the plugin configuration nor the card's tag-cache entry | `tests/frontend/features/media-tags/core-tag-look.test.mjs` | `pick` copying the whole object per field (5 enumerations of the entry per card). |
| Serving `bundle.js` in every encoding leaves the source map unbuilt | `tests/backend/Api/BundleServingTests.cs` | The eager 10.8 MB map (regression 4's first-request cost and retained array). |
| Every module in the built bundle opens with `(function () {` | `tests/backend/Api/BundleServingTests.cs` | A wrapper change that puts module compilation back on the main thread. |
| What the plugin DLL embeds is within `client/assembly-budget.json` (11,430,000 bytes, a ratchet like the bundle's) | `tests/backend/Api/PackedResourcesTests.cs` | The DLL doubling when maps and twins were first embedded (regression 6): 28,690,075 embedded bytes. |
| Every file under `js/` and `min/` reads back byte for byte under its resource name | `tests/backend/Api/PackedResourcesTests.cs` | A packed asset that is missing, misnamed or altered. |
| No plugin source but `PackedResources` asks the assembly for a resource; the server-side captions come from the packed locale | `tests/backend/Api/PackedResourcesTests.cs` | The bug this work itself introduced and the gate caught (see "Gates"): a reader that opens a packed resource by its plain name finds nothing. |

All of them run in the existing gates (the npm suite and gate T). Not guarded by a deterministic test: the per-script
evaluation cost (cause A) and the bootstrap validation, which only a profile shows; the benchmark's `fn-report
--kind eval` table is the instrument for those.

## Tried and rejected

- **`decodeTranslations` copying by plain assignment** (`result[key] = text`, `defineProperty` only for names that
  exist on the prototype): 4.84 ms against 0.36 ms for checking in place; every caller owns the object it passes.
- **The playback check in `features/player/lifetime.ts`**: that module is shared by 14 player scripts, and adding an
  export regenerated 28 output files; it lives in the pause screen's own helper (`pause-view.ts`) instead. A first
  version inside `pausescreen.ts` took the file over the 800-line size ratchet, which was not raised.
- **Skipping the reset for every player module** (in `createPlayerLifetime`): rejected after reading the modules.
  A lease records the route it was taken on, so work started before the route change is dropped on purpose and the
  reset is what restarts it (`playback-rating-badge` waits for the player route for that reason). Only the pause
  screen redid finished work.
- **Packing by file time stamps**: a file restored with an older time would have kept a stale packed copy; the
  packer compares content hashes. **Brotli quality 9 and 11**: 0.1 and 0.6 MB smaller than quality 5 at ten and
  thirty times the build time. **Putting the packing target in `Directory.Build.targets`** or adding the packed
  files with an `EmbeddedResource` element: the client build's check that every typed HTML page is embedded refuses
  any computed `EmbeddedResource` item; the check was left as it is and the items are added with `CreateItem`.
- **A budget on the DLL file's length**: gate T runs the backend suite with coverage, and the DLL on disk is then
  the instrumented copy (14,922,240 bytes during the test, 14,271,488 as built), so the test failed in the gate and
  passed outside it. The budget counts the embedded bytes, which instrumentation leaves alone and which are where
  the regression was.
- **Running the type check and the bundling at the same time** in `client-build.mjs`: the type check blocks the
  thread that feeds esbuild's pipes, so the two would only overlap with the type check moved to a worker, which is
  the file region `perf/test-speed` changes.
- **`getHeaderRightContainer`** is the largest single JE function on every page (20 to 28 ms, a forced layout from
  `offsetParent`), equally on both arms. Not a regression, not touched.

## Found bugs

- `NEW-20261110-175959-admin-config-page-html-carries-about-1-mb-of-inl` (`/home/jake/projects/je-found-bugs/inbox`):
  `configPage.html` is 1.36 MB (upstream 0.47 MB) because its two scripts carry inline base64 source maps (996 KB);
  each plugin page carries one too. Jellyfin serves these pages itself, so they cannot be packed.

## Gates

Final commit `b3f18431` (the step-log commit on top of it adds only this log and its scripts). `je12` v2.3.3 on both
machines.

| Gate | Where | Result |
|---|---|---|
| `je12 gate final`, part `all` | second machine (192.168.0.146), 00:17 | **PASS**: dotnet 3,245 of 3,245, npm 3,871 of 3,871, "restructure-gates: all passed" |
| `je12 gate final`, part `all` | Lenovo, under the gate lock, 02:35 | **PASS**: dotnet 3,245 of 3,245, npm 3,871 of 3,871, "restructure-gates: all passed" |
| `je12 gate browser` (alone) | Lenovo, under the gate lock, 03:14 | **PASS**: 690 passed, 0 failed, 3 skipped |
| `je12 test` (admin, media-tags, platform, player, shared, dotnet) | second machine, 03:23 | pass in 253 s |
| `je12 smoke` against the baseline recorded on `2917a115` | second machine, 03:18 | pass (0 failing, 0 changed, 0 known, 0 fixed) |
| Full harness run upstream against `b3f18431`: the two suites as run.sh runs them | Lenovo, 00:29 | dotnet 3,245 pass, npm 3,871 pass |

How the browser part got there (the flake protocol of `references/gates.md`, every run on `b3f18431`):

1. Second machine, 00:17, with `all` at the same time: 689 passed, 1 failed, `tag-fit-monotonic.spec.cjs:93` (bands,
   chromium), which AGENTS.md lists as load-sensitive; other projects' gates had that machine at a load of 42 on 16
   CPUs. Alone, 5 times each of its 5 variants: 24 of 25 (bands once more, at load 12); bands alone 20 of 20 on
   `b3f18431` and 20 of 20 on `2917a115`, sides alternated.
2. Second machine, 00:53, browser alone: 689 passed, 1 failed, a different test (`downloads-rewrite.spec.cjs:33`), run
   time 11.6 min against 4.4 min when quiet. Alone: 5 of 5.
3. Second machine, 01:10, browser alone: 680 passed, 10 failed (all Firefox, admin page and awards navigation) at a
   load of 61. That machine was not usable for a browser run while other projects' gates ran on it, so the gate
   moved to the Lenovo, where every gate waits for the one lock.
4. Lenovo, 02:35, `gate final` (parts `all` and `browser` at the same time): `all` passed; browser 688 passed, 2
   failed, `core-boundaries.spec.cjs:113` on mobile-chromium (aborting a response body closes the HTTP stream within
   3 s). Alone, 5 times each: 10 of 10.
5. Lenovo, 03:14, browser alone: 690 passed, 0 failed.

Three different tests failed in four loaded runs and none failed twice; none is in code this branch touches except
`tag-fit-monotonic`, which measures the layout whose `childrenOf` and `pick` changed, and it was compared against
`2917a115` for that reason (20 of 20 on both).

What the gate caught on the way, on the earlier tip `9708ad35` (second machine, 23:47): **28 failing backend tests**.
27 were the server-side caption tests (awards, leaving soon, quality versions, vocabulary fallback): `StatusRules`
opens `js/locales/<lang>.json` by its plain resource name, the packing commit had turned the locales into packed
resources, the read found nothing and the captions the server draws on native clients' posters fell back to their
keys. No page of the web client shows them, so neither the smoke run nor the before/after page checks could see it;
the full backend suite had not been run on that commit before the gate. Fixed inside the packing commit: every
embedded-resource read in the plugin goes through `PackedResources` (eleven call sites), and a test refuses any
other reader. The 28th was this work's own DLL budget test, which measured the DLL file and so the coverage
instrumentation; it counts embedded bytes now. The run before that (23:40) failed in 61 s for the environment: the
system `dotnet` on that machine has no ASP.NET runtime, the one in `~/.local/share/je-dotnet` has to be first on
`PATH`. The first final harness run, started on `53695bbb` at 23:36, was stopped when the bug was found and
restarted on the fixed commit.

Behaviour checks on one lab, second machine (`je12 browse --script … --keep before|after`, base `2917a115` then
`b3f18431`; scripts in `step-logs/perf-runtime/`):

- `served-assets.mjs`: identical before and after. Loader 52,395 bytes `f94a3ac65ec3940b`, locale 89,454 bytes
  `5d0e993797897ced`, a readable script's map 242,415 bytes `04d3b2dde595af53`, font 6,100 bytes, a missing asset
  404, `bundle.js.map` with 182 sections, 1,372 translations loaded.
- `panel-and-page-counts.mjs`: identical once settled. 24 settings tabs with the same names, 100 of 100 cards
  tagged, 211 JE elements on the details page. (The smoke run prints such counts the moment they first become
  non-zero, which is why its lines read "24 tabs" and "23 tabs", "12/100" and "100/100" on the two builds.)
- `playback-start-requests.mjs`: 1 item request and 4 image probes before and after. In this lab the base build does
  not show the doubled requests (the route changes before the pause screen has seen the video), so this check shows
  no change of behaviour but not the fix; the fix is shown by its unit test (two item requests before, one after)
  and by the benchmark (42 → 33 requests and 12 → 6 failing probes in every one of 7 runs; final run level with
  upstream).

`je12 evidence`, second machine (lab `je1230b7d1`, removed afterwards):

```
== live check
before: je12 browse '#/home' --script artifacts/restructure-plan/step-logs/perf-runtime/playback-start-requests.mjs
  deployed 2917a115dde0 (dll da9d7cfbafdbe2cd) on lab je1230b7d1, 2026-11-11 03:17:14
  | SCRIPT {"playing":true,"itemRequests":1,"imageProbes":4,…}
  | PAGEERROR Error: [object Response]
after: je12 browse '#/home' --script artifacts/restructure-plan/step-logs/perf-runtime/playback-start-requests.mjs
  deployed b3f18431 (dll acdd00734eaf0fba) on lab je1230b7d1, 2026-11-11 03:18:06
  | SCRIPT {"playing":true,"itemRequests":1,"imageProbes":4,…}
  | PAGEERROR Error: [object Response]
same command before and after: yes; after's build is a clean commit
== checks
test: test: pass in 253s [features: admin, media-tags, platform, player, shared, dotnet] (2026-11-11 03:23:13, tree b3f18431)
smoke: smoke: pass (0 failing, 0 changed, 0 known, 0 fixed) in 34s vs baseline 2917a115dde0 (2026-11-11 03:18:41, tree b3f18431)
all: PASS in 17.7 min (part of final) (2026-11-11 00:35:19, tree b3f18431)
browser: FAIL in 11.2 min (2026-11-11 01:21:46, tree b3f18431)   <- run 3 above; superseded by the Lenovo's
== lab
down: removed lab je1230b7d1: no process, namespace or data left (2026-11-11 03:23:36)
```

(The `PAGEERROR Error: [object Response]` during playback start is there on both builds.)

`je12 evidence`, Lenovo:

```
== checks
all: PASS in 6.0 min (part of final) (2026-11-11 02:41:10, tree b3f18431)
browser: PASS in 3.2 min (2026-11-11 03:20:14, tree b3f18431)
== lab
down: removed lab je128e7253: no container, network, firewall rule or data left (2026-11-10 20:17:22)
found bugs filed: NEW-20261110-175959-admin-config-page-html-carries-about-1-mb-of-inl
missing: before, after, test, smoke   <- those ran on the second machine, above
```

Nothing was raised or skipped: no baseline, snapshot or budget was changed except the new
`client/assembly-budget.json`, `JE_UPDATE_SNAPSHOTS` was never set, and the test-count floors were left where they
are (the suites have 3,245 and 3,871 tests against floors of 3,238 and 3,863).

## What remains

Of the seven, three are gone (3, 6, and the part of 2 that was real), two are smaller but not within noise (1, 7),
and two are not settled (4, 5). In detail:

1. **JE main-thread JavaScript: +5% to +8% unthrottled and +7% to +9% throttled in the final run** (it was +12% to
   +15%); +5% to +7% without the tag-cache script. What is left is the evaluation of the feature modules at boot,
   +11.5 ms over about 150 scripts: each component script runs its own copies of what it imports and builds its own
   feature context. The parenthesized modules hide 8 ms of the page's boot by compiling off the main thread; they do
   not remove that work. The largest single sources are small (`host/context.ts` 1.1 ms, `languagetags.ts` 0.7,
   `seerr/core/ui/styles-entry.ts` 0.7, `core/ui/runtime.ts` 0.6, `colored-activity-icons.ts` 0.5,
   `hidden-content/host.ts` 0.4), so the next step is structural: share more modules at run time
   (`client/shared-modules.json`) or evaluate a feature's module when a page first needs it. Both change the output
   of most entries and were not attempted here. The bootstrap validation (+1.0 ms) is a deliberate check and stays.
   The final run's page cells also carry unequal tag-cache deltas (3.5 MB against 5.4 MB): run.sh's lockstep did
   not make them equal this time, and `ab.sh`'s rebuild only brings them within 6 to 25% of each other. A
   comparison of page totals needs that fixed in the harness first; this log's per-fix claims rest on per-function
   times for that reason.
2. **Playback blocking at 4× CPU throttle without the profiler: 29 → 53 ms cold** (3 tasks over 50 ms against 2;
   warm 16 → 57, within noise). Not attributed: the pass without the profiler keeps no event breakdown. At normal
   speed there is no blocking on either side.
3. **JS heap after GC on warm loads: +1.5 MiB** from the parenthesized modules (code compiled with the script is
   kept from the start), inside a difference of +1.9 MiB against upstream. Accepted for 11 ms less main-thread work
   per load; it is the one thing this work made worse.
4. **Server memory.** The eager source map is gone (first bundle +87 → +28 MiB; upstream +27). A request for
   `bundle.js.map` now pays for the map: about 265 ms and 78 MiB once, with developer tools open. Whether RSS after a
   page loop is level is **not shown**: the final run's one sample is +113 MiB, three other paired samples are +459
   (with the map built by the harness), −117 and −4, and the one time series has the rewrite's median 143 MiB
   higher. The servers allocate the same and keep the same alive, so a remaining difference would be in when the
   runtime collects the large object heap, which the plugin can only influence by producing less large-object
   garbage per tag-cache response (7 MiB per page load on both sides, upstream's code). Settling it needs the
   once-a-second series over several restarts per side.
5. **Throughput of `version` at 16 connections: not removed.** Level on fresh servers; 7 to 10% lower on warmed
   ones in the A/B rounds and 23% lower in the final run; over six fresh pairs of server processes the
   median is 6% lower, with two pairs 16% lower and one 8% higher, which the process-to-process spread covers
   (paired p = 0.22). The other three endpoints are within
   noise. No cause in the plugin's request path, which is the same code; the evidence points at thread scheduling in
   the server process.
6. **`dotnet build`: 8.60 s against 3.85 s** (it was 9.36 s). The rest is the client check that runs inside the build, mostly its type check
   (3.5 to 3.8 s); `perf/test-speed` caches that and it was not duplicated.
7. **The first `bundle.js` after a server start: 136 ms against 49 ms** (one request per start): the rewrite
   assembles and compresses the bundle once and then answers in 0.35 ms, upstream compresses 12.5 ms on every
   request.
8. `configPage.html` and the plugin pages still embed about 1.3 MB of inline source maps (found bug above).

Decisions made instead of asking:

- `decodeTranslations` returns the object it was given instead of a copy; all four callers own what they pass.
- The doubled playback requests were fixed in the pause screen only; the other player modules need their reset.
- No product change for the playback blocking time: it is the profiler. The harness gained a pass without it.
- The source map is built on first request, so opening developer tools pays about 265 ms once.
- Parenthesized module functions: 11 ms less main-thread JavaScript per load for 5 to 8 ms more background parsing
  and 1.5 MiB more heap on warm loads.
- Packed embedded assets at brotli quality 5; the budget counts embedded bytes; every reader goes through
  `PackedResources`.
- Only the bundling was made concurrent in the client check; the type check was left to `perf/test-speed`.
- After the two-lab rule the fixes were measured as two A/B pairs (four fixes, then the final client) with
  per-function attribution inside a pair, not as seven pairs.
- The history was rewritten locally so that the packing commit contains its reader fix (nothing was pushed); the
  first final run on the unfixed tree was stopped, not reported.
- The browser gate was moved from the second machine to the Lenovo when the second machine was overloaded by other
  projects' gates; `all` passed on both.
- The test-count floors were not raised (the suites grew by 7 and 8 tests); that is the maintainer's commit after a
  merge, as before.
- Items 4 and 5 were investigated to the point above and then left, with the evidence, instead of changing code
  without a located cause.

## Landing on the main line (2026-11-11, after review)

The branch was rebased from `2917a115` onto `restructure/integration` `09ec6381` (44 commits later: the upstream
catch-up to 12.15.0.0 and later ports, three bug fixes, the gate script's `quick` mode and attribution check, and the
Media Tags opacity and size per tag kind). The nine commits keep their subjects, one per cause; the SHAs in "Changes"
above are the ones the measurements ran on, before the rebase.

What the rebase needed:

- One source conflict: `tests/frontend/features/player/features-pause.test.mjs`, where both sides appended tests
  (upstream's URL-encoding test and this branch's two); both are kept. `pausescreen.ts` is at 797 of 800 lines.
- Generated files were never merged by hand: `je12 regen --contracts` regenerated them where a commit conflicted
  (the pause screen's four outputs, `tag-layout.js` and its twin and maps, the manifest, the production inventory),
  and after every replayed commit it reported 0 generated paths differing from the commit.
- `71f5224d` against the tag-kind feature: the feature's new `kind-looks.ts` reads its settings through `pick` (four
  call sites, on the 433-key plugin configuration among others) and imports `hasOwn` from `layout-rules.ts`. Both
  are there after the rebase; with the main line's copying `pick` each of those reads would have copied the
  configuration, with this branch's they read one property. The look's guard test (no enumeration of the
  configuration or of a card's entry) passes with the feature in place, 27 of 27.
- Packed resources: no code that arrived since reads an embedded resource directly (new settings, locales, admin
  sections, the Maintainerr card and the status switch add resources and readers only through files this branch had
  already moved to `PackedResources`; the project file changed only its version). The guard was made to prove it
  fires on this tree: a planted `GetManifestResourceStream` in `GenreIcons.cs` fails
  `OnlyPackedResourcesAsksTheAssemblyForAResource` with the file and line, and a budget of 1 fails the size test
  with the measured figure.
- The budget entry and the packing commit's message now give the landing tree's sizes next to the measured ones.
- Identity: every commit is authored and committed as `Jake <45441845+4eh5xitv6787h645ebv@users.noreply.github.com>`,
  no other address and no attribution line in the range.

Re-proved on the rebased tip (`dfb17389` when measured; session of 04:15 to 04:54 on the Lenovo, pairs, quiet checks,
gate lock; second machine for the sizes):

| What | Before the rebase | Rebased tip | |
|---|---|---|---|
| Plugin DLL (bytes) | 14,271,488 | 14,396,928 (upstream `2e0f9251`: 14,956,032) | +125,440 from the newcomers' code and assets |
| Embedded bytes, budget 11,430,000 | 11,172,368 | 11,257,660 | within budget; test passes |
| Playback start: requests through JE / failing probes (5 runs) | 33 / 6 | 33 / 6 (upstream 33 / 6) | unchanged; no blocking on either side |
| First `bundle.js` after a restart (4 restarts per side) | 136 ms (135–138), +28 MiB | 142 ms (136–146), +26 MiB (9–35); upstream 51 ms, +35 MiB | unchanged within the spread |
| First `bundle.js.map` | 267 ms | 286 ms (261–351) | unchanged within the spread |
| Home cold, JE main-thread JS on stack, against upstream (ms) | 166 → 180 (+14) in the final run | 174 (172–180) → 199 (197–203), **+25**, 6 of 6 runs up | slower: see below |
| Library cold, against upstream | 219 → 230 (+11) | 228 (225–236) → 257 (252–264), **+29**, 6 of 7 up | slower: see below |

**The rebased tree is slower per page load than the branch was, and one newcomer is why.** Measured directly, the
branch before the rebase (`b3f18431`) against the rebased tip, 7 runs, tag-cache deltas 8.8 and 8.2 MB
(`ab-land-pages-old-20261111-044651`): Home cold 152 (151–155) → 167 (165–170) ms to JE ready + 2 s, 7 of 7 runs up;
library cold 205 → 224, 7 of 7; the warm cells +3 to +10, within noise. By script that is `js/tags/tag-pipeline.js`
+15.6 ± 1.2 ms (Home cold) and +16.2 ± 1.0 ms (library cold) and nothing else beyond noise (`tag-layout.js`, where
the tag-kind feature lives, +0.7 ± 0.7). By function it is `entryChanged` in `pipeline/delta-sync.ts`, 17.8 ± 1.4 ms
per load: it decides which cards to redraw by serializing the held and the incoming entry with `JSON.stringify` for
every entry of every delta, and the lab's deltas carry thousands of entries. It came with `4dbcd596` "redraw changed
cards and keep collection language flags current", a faithful port of upstream `ee1c92dc` (#1029), so upstream's
current code pays the same; the benchmark's reference `2e0f9251` is older than that fix. Without that function the
rebased tree stands where the branch stood against upstream (Home cold about +8 ms). It was not changed here; it is
filed as `NEW-20261111-045449-tag-cache-delta-entrychanged-serializes-every-de` with the numbers and two possible
fixes.

Gates on the rebased tree: `je12 gate final` on the second machine at 04:15 (`dfb17389`): `all` passed (dotnet 3,321
of 3,321, npm 3,946 of 3,946); browser 731 passed and 1 failed, `downloads-rewrite.spec.cjs:33` on Firefox, while
other projects' gates took that machine to a load of 19; alone 5 of 5. The gate on the exact commit that was
fast-forwarded is reported with the hand-over, since this log is part of that commit.

## For later: evaluating a feature's modules on first use

What remains of regression 1 (+5% to +8% of main-thread script per page load) is the evaluation of the feature
modules at boot: +11.5 ms against upstream over about 150 component scripts, none of them large. This is a project
of its own, not a fix.

**How it works now.** `bundle.js` is one array of module functions, one per component script in manifest order.
The loader (`client/src/bootstrap/loader/component-loader.ts`, `runBundleModules`) runs every one of them in idle
slices; each module's top level builds its feature context, its tables and styles and attaches its entry points to
`JE` (`JE.initializeBookmarks`, `JE.tagPipeline`, …). Then `initializeFeatures` (`loader/features.ts`) calls the
entry points whose plugin setting or user setting is on. So a module is evaluated whether or not its feature is on
and whether or not the page will ever use it.

**The change.** Keep the bundle as it is and stop running every module at boot:

1. Give each manifest entry a feature (the map exists: `client/entries` and `docs/feature-map.json`) and whether it
   is *eager* (core, the tag pipeline and renderers, the header and whatever the first view draws) or *deferred*.
2. For a deferred feature the loader installs stand-ins for the entry points that feature publishes; calling one
   evaluates the feature's modules in manifest order, once, and forwards the call. `initializeFeatures` then pays
   for a feature only when its setting is on.
3. For features that are on but tied to a route or an event (the player modules, details-page providers, Seerr
   discovery, calendar, downloads, the settings panel), evaluate on the first navigation or event that needs them,
   or in an idle slice after JE is ready, whichever comes first.

**What it would buy.** On the lab's configuration most features are on, so step 2 alone buys little there; the gain
is step 3. Of the +11.5 ms, media-tags (2.9), the host layer (1.6), settings (0.6) and what filters the first view
(hidden content 0.8, spoiler guard 0.7) have to stay eager; Seerr (2.1), the settings panel (0.6), bookmarks (0.6),
downloads (0.5), the player and the details providers (0.3 each) and the standalone pages could leave the boot path:
4 to 5 ms of the 11.5 on a Home load with everything switched on, more for installations with features off. That
would leave about 3 to 4 ms against upstream on Home. Measure with `fn-report --kind eval` per feature before and
after.

**What it risks.**

- *Load-order contracts.* Modules read `JE.*` members that earlier modules published, at evaluation time and later.
  Every such read across a deferral boundary has to become a call through a stand-in or an explicit dependency. The
  shared-module registry (`JE.core.sharedModules`, `client/shared-modules.json`) already works by name and is the
  natural place for this; modules that still reach for a global set by a sibling are the work. A static check (a
  module may only read `JE` members published by modules it declares) should come first, as a guard test.
- *Side effects at evaluation.* Some modules register observers, navigation handlers, shortcuts or styles at their
  top level instead of in their initializer. Deferring them changes when (or whether) those run: the settings panel's
  entry points, keyboard shortcuts, the pause screen's video observer, splash screen, theme selector. Each needs to
  be found and either kept eager or moved into its initializer, which is a behaviour-preserving refactor per feature
  with its own tests.
- *First-use latency.* The cost does not vanish, it moves to the first use, where it must not land inside an
  interaction: the player modules must be ready before playback starts (the pause screen asks for the item about
  300 ms after the Play click today), so "idle after ready" has to stay ahead of the user.
- *Per-user re-initialisation.* `reinitializeUserTags` and the user-switch path call initializers again; the
  stand-ins have to be idempotent and survive a user change.
- *The fallbacks.* Dev mode and the per-file fallback load scripts individually in manifest order; they must keep
  working, either by ignoring the deferral or by the same stand-ins.
- *Tests and generated output.* The unit tests mostly load component scripts directly and are unaffected; the browser
  suite and the boot tests assert on boot order and on `JE.initialized` and would need the "ready" definition
  restated (ready = eager features initialised). The bundle's shape, its ETag and the size budget do not change;
  the loader and `ClientScriptBundle`'s manifest do.

A smaller first step with the same measurement: split only the features that are off by default or tied to their own
page (calendar, downloads, activity, catch-up, Seerr discovery, the settings panel) and leave the rest eager.
