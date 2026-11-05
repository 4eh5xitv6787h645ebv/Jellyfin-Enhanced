# Evidence pack, round 23 (the last round of the climb)

**State:** commit 589047d2 on `feat/media-tags-features`, which includes the polished settings UI and round 21's standing guards.

**Round 23 is a full-verification round.** It answers the round-22 reviews:
- Sol 8.5, Opus 8 and Astra 8.5.
- All three seats agreed on the large-library first load and on i18n code readiness.
- Opus raised settings and docs defects; Astra raised the IMAX ratio label.

Commits since 12d9d26f, the last reviewed state, are below.

## 1. Bounded full loads for large libraries (a0cec782)

**Found in round 22 (3/3, C5):** a browser's first load, and every full re-download, was one JSON body for the whole library. That is about 190 MB of JSON at 50k real entries, parsed in one task, with every entry kept in memory.

**Server:** `GET tag-cache?limit=&after=` returns one page of a full snapshot:
- in ordinal id order, with a `next` cursor;
- with 100 to 5,000 entries per page;
- projected per user exactly like a full load (access, collection and Leaving visibility, quality from visible episodes);
- carrying the generation's `version`, `filterRevision` and `filterBase`.

Under Spoiler Guard, pages are stripped and their `filterRevision` covers every guarded entry, as a delta's does. Without `limit` the response is unchanged.

**Web:**
- A full download reads pages of 2,000, so no response, string or parse holds the whole library.
- A page from another generation or filter starts the load over, at most twice; after that the whole library comes in one response.
- When the last page is in, the browser fetches a delta since the first page's `timestamp`, so any entry changed or removed while it paged arrives.
- A server that does not page answers the first request in full.

**Memory:** once the stored copy is committed, a library above 20,000 entries is released from memory and read from the stored copy on demand, exactly as after a restore.

**Benchmark:** `scripts/bench-tag-cache.mjs` runs each load in its own process on a deterministic synthetic library. Its entries are about half the size of real ones.

| Synthetic library | One response | Pages of 2,000 | Memory kept |
|---|---|---|---|
| 50,000 entries, 89.5 MB of JSON | one 89.5 MB body, one 0.8 s parse | largest body 3.6 MB, longest parse 41 ms | 117.5 MB while loading, 48.5 MB once stored |
| 100,000 entries, 179.2 MB of JSON | one 179.2 MB body, one 1.8 s parse | largest body 3.6 MB, longest parse 108 ms | 235.2 MB while loading, 48.9 MB once stored |

**Lab** (`captures/paged-load-log.json`): a fresh browser profile on je-lab-centres (3,882 entries, real-viewer):
- two pages of 7.7 MB and 7.1 MB of JSON, against one 14.8 MB response before;
- then a delta since the first page;
- the console reads "Server cache loaded: 3882 items (v1, 2 pages)", then "persisted: 3882 items".
- `captures/lab-movies-after-paged-load.png` shows the tags drawn afterwards.

**Tests:**
- Backend: `APagedFullLoadHoldsEveryEntryOnceInBoundedPagesUnderOneFilter`, with and without Spoiler Guard. It checks 3 sorted pages of at most 100 entries, every visible entry exactly once and byte-identical to the full load, and one version and filter.
- Frontend: `core-tag-pipeline-paged`:
  - pages, then a delta since the first page;
  - a generation or filter change restarts the load, then one response;
  - a server without paging;
  - a 20,500-entry library released from memory after the commit and read back from the store.

**Not done:** visible-first rendering before the last page arrives. Cards render once the pages are in, as before. Without a stored copy, every entry stays in memory.

## 2. Code-side i18n (66879a57, 405f02dd, 185bcddc)

**Found in round 22 (3/3, C10):**
- hard-coded English in the Custom rules table and the Tag Styles editor;
- string counts that skip plural forms;
- "Apply 1 changes";
- runtime and age units built in code.

**Now:**
- **Custom rules table:** every word comes from the locale files: headers, Add rule, empty state, row accessible names, placeholders, the reserved-label hint and the count.
- **Tag Styles editor:** likewise: groups, presets, fields, notes, contrast grades and hints, Change and Reset with their accessible names, samples and the load error.
- **In-sentence names:** field names inside a sentence are keys of their own, never lower-cased in code.
- **Counts:** counts reach `JE.t` as numbers: the Versions chip, look rules, and the Tag Styles "scroll for more" hint.
- **English singular forms:** for the import/export summaries and the admin overview ("Apply 1 change", "1 rule", "1 library").
- **Units:** the runtime chip ("1h 52m", Compact "1h52", "47m") and the People age ("42y") take their units from the locale files on the web and on posters; English output and parity are unchanged.
- **Flag names:** the preview's sample flags name their language in the user's language.
- **Samples:** the admin page's Awards, Logos and Custom sample chips are translated.

**Guards:**
- `features-media-tags-strings`:
  - scans the Media Tags settings code for literal interface text, hand-filled counts and literal sample labels;
  - mounts the Custom rules table with a sentinel translator.
- A Versions renderer test uses Russian-style plural forms.
- A runtime test uses a translated unit table.

**Lab, pseudo-locale** (`captures/pseudo-colours-editor.png`, log in `captures-log.txt`):
- On the real admin Colours tab, every string of the locale file was wrapped in ⟦…⟧ before the page opened.
- No interface text appears without the brackets.
- The only unwrapped texts are colour values (#ffd166) and the catalog's tag names (codecs, editions), which are data.
- Saves were answered locally.

## 3. Round-22 review findings (4feb5f1e, ce983282)

- **Rating order (Opus, C12 defect):** the admin new-user preview showed Critic before Community when `RatingTagsSources` is unset, while the server seeds Community first. `seedUser` now seeds as `RatingSourceSettings.Defaults`. Lab capture `captures/admin-preview-rating-order.png`: Sample Movie `★8.1, 92%`, where Opus's round-22 reproduction showed `92%, ★8.1`.
- **Docs drift (Opus, C8):**
  - "Where to show" is no longer described as Rating-only (group table, limits, native posters, row switches).
  - The portable field count is 89, and the list names `TagGroupScopes`.
  - The API direct-play paragraph describes the picked version.
  - The source row lists SDTV and VHS.
- **Copy (Opus, C11):** Awards says the administrator chooses its ribbons, instead of "Nothing to choose". The Colours tab names the group Age Rating, as every other surface does.
- **Page shell (Opus, C10):** the Media Tags page's own loading and not-ready messages translate once `JE.t` exists.
- **Plural rules (Opus, C10):**
  - `JE.t` asks Intl with English as the fallback, and native falls back to English rules for an unknown language.
  - `gsw`, `ml`, `no` and `pr` were added to the shared fixture, so web and posters agree for every shipped locale (47 languages).
  - The translation guide says which forms Weblate offers.
- **IMAX label (Astra, C2):** an aspect near 1.43 alone reads `1.43:1`, not "IMAX 1.43". The IMAX chip needs an IMAX signal. Resolver 39 retires native posters drawn with the old label.
- **Styled previews (Opus, C9):** the settings fixture loads the group modules, so the admin and hub previews draw styled chips in every guard.

## Verification at 589047d2 (full set)

| Check | Result |
|---|---|
| Frontend | 2507/2507 (the full run at 185bcddc failed 1: translation coverage did not count the shared `awards_label`; fixed in 589047d2 and rerun) |
| Backend | 2580/2580 |
| Browser, three projects | 438/438 |
| jf12 and jf10 Release builds | 0 warnings |
| Parity (`--offline`) | 0 differences (`parity-summary.txt`) |
| Translations, inventory, poster assets, `git diff --check` | pass |
| Attribution grep | only the 2 known upstream merge commits (a8f8f666, bd62b215) |

`translation-coverage.md` is informational only: locale translation is out of scope (Weblate).

## Lab (je-lab-centres, deploy of 589047d2)

**Legacy viewer (settings saved before layouts):**
- Home: AE = 0 against the round-6 capture (1400×660+0+90).
- Movies: tags identical to the base capture. The only differing pixels are the header's random dice icon (10×10 at +1146+19), which varies per load.

The paged load, pseudo-locale and rating-order captures are described above (`captures/`, `captures-log.txt`). The lab configuration was never changed by a probe: every save request was answered locally.
