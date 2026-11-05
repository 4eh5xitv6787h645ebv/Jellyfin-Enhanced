# Evidence pack, round 22

State: commit 12d9d26f on `feat/media-tags-features`. The branch includes the polished settings UI (merge e2de2026) and round 21's standing guards.

Commits since 82632b93 (the last reviewed state):

## 1. cefa8fbb: "Where to show" follows the server the same way for every group

**Found in round 21 (all three seats):** Rating's **Follow server** copied the administrator's current values into the user's own switches. A later administrator change never reached the user.

**Now:**
- **Rating storage:** Rating's personal switches live in `TagGroupScopes.Rating`, like every other group's. An unset switch follows the administrator's `RatingTagsOn…` value (`TagLayoutRules.RatingScope`; web `JE.core.tagScopes`).
- **Older settings:** a personal `ratingTagsOnX: false` saved before this change stays the user's own. No setting is rewritten.
- **New users** are no longer seeded with a copy of the administrator's Rating values.
- **Follow server** now clears the personal switches for every group. A later administrator change reaches the user, and the hub then says "Following the server".
- **Casing:** personal scopes are read in either casing. The server stores user settings in PascalCase, so camelCase-only reads missed them.
- **Empty caption strip:** when every caption group is switched off for a card's type or row, Caption reserves no strip.
- **Stated limits:**
  - Collections and other videos always show the group; the block says so.
  - Single-badge groups (Status, Age rating, and Logos when only one is allowed) say "Always one tag" where a limit would be, on the hub and in the item editor.
- **Hub wrapping:** a status badge's "requires" note wraps instead of running past its row. Firefox showed it 2–3px past the box.

**Guards:**
- **Settings matrix:**
  - checks position and limit separately;
  - checks the People reason on the hub;
  - runs a Follow server round trip for every group: personal switch → Follow server → no personal switch left, button shows "Following" → a later administrator change reaches the user.
- **Shared surfaces:**
  - load the production panel stylesheet;
  - draw a real item-editor preview with the group renderers;
  - translate with plugin.js's own `JE.t` (12d9d26f).
- **Overflow sweep:** measures word by word, because Firefox counts a line's hanging space in its range rectangles.
- **Monotonic guard:** waits for the preview art before it measures.
- **Caption strip test:** a new browser test checks that a card whose caption groups are all off for its type keeps no strip.
- **Parity:** new profiles `where-to-show`, `where-to-show-admin` and `where-to-show-rating-legacy-off`.

**Tests:** `CoreTagGroupScopesTests` (Rating follows the administrator while an older off stays) and `features-tag-scopes` (inheritance, PascalCase).

## 2. 94dfd174: an access reconcile re-sends the parents whose facts depend on access

**Found in round 20 (Astra, reproduced):**
- A copy reconciled after an access change kept stale facts on entries the user can still see:
  - a series' latest-episode date or quality from an episode they lost;
  - a collection-made Custom Tag or Leaving fact.
- Those entries keep their `LastUpdated`, so the delta never carried them.

**Now:**
- A delta answering a caller whose access revision differs carries every visible entry whose projection depends on access, freshly projected (`TagCacheService.ProjectsAccess`).
- The walk runs again only on that mismatch.
- The api.md contract says so.

**Test:** `AnAccessOnlyDeltaResendsTheVisibleEntriesWhoseFactsDependOnAccess`:
- revoke an episode → the series and season come back without its facts, and an unrelated movie does not ride along;
- under the new filter, the delta is empty;
- grant it back → the facts return, with the original revision.

The test fails with the fix disabled. Predicate test: `OnlyEntriesProjectedThroughAccessRideAlongAReconcile`.

## 3. ebeb3be0: title-only Spoiler Guard keeps track roles and version revisions

**Found in round 20 (Astra, reproduced):** with **Replace titles** or **Strip overviews**, Spoiler Guard removed the stream titles that mark commentary or audio description. The main audio, and so the sound chips, could change, and each version lost its `Revision`.

**Now:**
- The strip records the role the titles named (`Role: "secondary"`) before dropping them, and the server and web both read it.
- The version `Revision` stays.
- Source and Edition still go with the titles, because they are naming facts.

**Test:** `TitleOnlyStripKeepsTheTrackRolesAndTheVersionRevisionSoTheMainAudioIsUnchanged`:
- input: an English commentary listed before a Japanese TrueHD 7.1 main track, plus an "AD" track;
- `QualityTagRules.Detect` is identical before and after the strip for preferred languages none, en and ja.

The test fails without the role. The web test is in `core-media-language`.

## 4. 28a75bb2: direct play asks about the picked version, from one shared input list

**Found in round 20 (Sol and Astra):**
- The web fingerprint for cards without a server revision covered fewer facts than the server's revision.
- Direct play always asked about the default version, even when the card showed another.

**Now:**
- **One list:** the server's version `Revision` and the web fingerprint use one list of inputs: `TagCacheService.DirectPlaySourceFields`/`DirectPlayStreamFields` and `tag-direct-play.js INPUTS`.
- **Fixture:** `tests/fixtures/direct-play-inputs.json` holds both sides to that list.
- **Coverage:** the web fallback now covers every listed fact of every stream, subtitles included.
- **No churn:** the server hashes byte-for-byte the text it did before, so no stored revision changes. A test rebuilds the old text and compares the hash.
- **Picked version:**
  - A card whose item has several versions asks `PlaybackInfo` with the `MediaSourceId` the user picked on the details page.
  - It reads that version's answer.
  - Answers are kept per item and version.
  - A pick that is not one of the item's versions means the default.

**Tests:**
- Backend: the lists equal the fixture, every field exists on Jellyfin's types, and changing each field alone on the version or on any stream changes the revision.
- Frontend:
  - the same lists;
  - one test per listed fact (50) that asks again;
  - the picked version is asked with `MediaSourceId` and kept per version;
  - classify reads the version asked about.

## 5. 9fab10c0: plural forms

**Found in round 21 (Opus and Sol, C10):** counted strings had one form only ("within 1 days").

**Now, on the web (`JE.t`):**
- It picks `key_one`, `key_few`, … by the CLDR category (`Intl.PluralRules`) of the count, using `count`, else `days`, else the other counted parameters.
- The category comes from the language the string is written in.
- It falls back to `key_other`, then the key.
- A form English filled in for a locale is used only where the key itself is English, or the locale is a kind of English. A translated sentence never turns English for one count.

**Natively:** posters follow the same rule through `Helpers/PluralRules.cs`. `tests/fixtures/plural-categories.json`, generated from Intl, holds it to Intl's answer for 43 languages and 126 numbers.

**English singular forms** (en.json only):
- the Status badge windows;
- the language count tooltip;
- the admin Status summary;
- the Leaving detail;
- preset size;
- hidden items;
- the Seerr day counts.

**Docs:** the translation guide documents the convention.

**Tests:** `core-translate-plural`:
- en;
- ru one/few/many;
- English fallback;
- en-GB;
- forms keep their base's placeholders.

`PluralFormsTests` checks Intl parity and native text.

## Verification at 12d9d26f (round 22 is a targeted round; the full set runs in round 24)

| Check | Result |
|---|---|
| Frontend | 2498/2498 |
| Backend | 2573/2573 |
| jf10 Release build | 0 warnings |
| Parity (`--offline`) | 0 differences (`parity-summary.txt`) |
| Standing guards (monotonic fitting, settings matrix, overflow sweep), three engines | 36/36 |
| Related browser specs, Chromium (preview styles, first-chip fit, flush edges, centres, hidden refit, layouts, stack fit) | 53/53 |
| Translations, inventory | Pass |

`translation-coverage.md` is informational only: locale translation is out of scope (Weblate).

## Lab (je-lab-centres, deploy of 12d9d26f)

**Legacy viewer (settings saved before layouts):**
- Home: AE = 0 against the round-6 capture (1400×660+0+90).
- Movies: AE = 0 against the base capture.

**Captures** are in `captures/`; `captures-log.txt` lists the states each one shows.
- **Lab admin page, Caption, every group's Episodes switch off and on again** (`caption-<width>-episodes-1-on/2-all-off/3-on-again.png`):
  - The Sample Episode card goes from 147px to 98px with no caption strip left.
  - It comes back to 147px with the same groups (quality, rating, language).
  - Every save request was answered locally; the lab configuration is untouched.
- **Lab admin page, Rating's Where to show block** (`admin-rating-where-to-show-<width>.png`), the same block as every group.
- **Hub fixture, Rating:**
  - `hub-rating-1-following.png`: following.
  - `hub-rating-2-personal-episodes-off.png`: a personal Episodes switch.
  - `hub-rating-3-follow-server.png`: Follow server, with no personal switch left and "Following the server".
  - The log records that a later administrator change reaches the user.
- **Hub fixture, Status:**
  - `hub-status-limit-note.png`: "Always one tag".
  - `hub-badge-window-1-day.png`: "within 1 day of being added" with a one-day window.
- **Item editor:** `item-editor-limit-notes.png` shows the single-badge groups' notes.
