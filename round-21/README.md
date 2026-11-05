# Evidence pack, round 21

State: commit 82632b93 on `feat/media-tags-features`. The branch includes the polished settings UI, which came in with merge e2de2026 of `feat/media-tags-redesign` at b06ad527.

Round 21 answers a demo review of d8a8767e: four findings from the admin Media Tags page. Each finding is fixed, and each comes with a standing guard that runs in CI. The guard fails on the old behaviour and passes on the new.

Commits since d8a8767e (the last reviewed state):

## 1. 59a1fcbd: removing a chip or a group never hides more chips

**Finding.** Groups → untick Age rating: the Caption preview's Sample Series went from two rows to one, and hid more chips.

**Cause, reproduced in the fixture.** The fitting tried a two-row plan, then fell back to one row. A two-row plan was rejected whenever a taller chip reached row two (an award chip, 24px against the strip's 19px chips). The one-row fallback then hid more. Fitting also skipped a chip that did not fit and let later chips fill the gap, which is not monotonic.

**Now, on the web and natively:**
- Wrapping slots show a priority prefix: the first chip with no room ends the rows.
- Only a chip that can never fit is skipped on its own: one wider than a whole row, or, in a single row, one too wide to sit beside +N.
- The row budget is the most rows whose r tallest chips (+N included) fit the slot. It does not depend on which chips share a row.
- Award and logo chips take the caption strip's chip size.
- Slots keep one order in the host, and a group keeps its first arrival position. Switching a group off and on again restores the exact DOM.
- Native `BandChipsThatFit`/`RowBudget` mirror this, at pixel version 8.6. The shared fixture `native-band-fit.json` was updated: one row changed, "a chip with no room ends the rows".

**Guard.** `tests/browser/tag-fit-monotonic.spec.cjs` drives the real preview through:
- Caption, Bands, the Summary and Minimal hover reveals, and Corners centre rows;
- 2 widths × 2 sizes × 2 densities;
- removing each of 8 groups and 3 chip categories.

It requires:
- hidden chips never rise;
- rows never drop while chips are hidden;
- no chip that was shown disappears;
- off→on restores the exact HTML.

It runs on 3 engines (15 tests), and a unit property test is in `core-tag-layout.test.mjs`. Both failed before the fix.

## 2. 52ecceea: "Where to show" for every group; Edit only opens real settings

**Finding 3.** Only Rating had "Show on movies / series / seasons / episodes / Continue Watching / Next Up".

**Fix:**
- **Model:** `TagGroupScopes` for every card group: administrator defaults (`PluginConfiguration.TagGroupScopes`) and personal overrides (`UserConfiguration.TagGroupScopes`). An unset switch follows the server, then means on.
- **Rating:** keeps its `RatingTagsOn…` fields through the same rule.
- **People:** Tags show the reason they have none: they are on cast cards, not media cards.
- **Web:** one gate in the shared renderer commit (card type, home row), and the live preview applies it to its samples.
- **Native:** the resolver applies the item types. A switch that hides a group enters the settings digest (`scope.<group>`), so poster URLs retire. A document that never set one keeps its digest.
- **UI:**
  - The admin page and the hub draw the same six-switch block for every group, with Follow server on the hub.
  - The item editor states where the setting lives.
  - The patch allowlist, validation and portable documents carry the field.
- **Docs:** tags.md (Groups tab), api.md (field) and admin-media-tags.md.
- **Defaults** change no output: legacy AE = 0 and parity 0, below.

**Finding 2.** Genre, People and Status showed an Edit that opened only a description and a link.

**Fix.**
- A group row gets Edit only when it has settings of its own. With the scopes, every group except People has them; People's note sits inline.
- Help disclosures are marked informational (`data-je-info`).
- The new guard found two Tag Styles toggles with nothing behind them while the style catalog loads. They now stay hidden until drawn.

`JE.core.tagSettingsMatrix` declares the common controls per group and surface (enable, placement, scopes), with reasons where one does not apply, and the surfaces render from it.

**Guard.** `tests/browser/settings-matrix.spec.cjs` mounts the admin page, the hub and the item editor through `tests/browser/helpers/settings-surfaces.cjs`. It checks:
- every group against the matrix (or that the declared reason is shown);
- Edit present if and only if a control is inside;
- no disclosure opens nothing;
- no in-page link or `data-je-goto` target is missing.

It runs on 3 engines (9 tests). Tests: `CoreTagGroupScopesTests` (6) and `features-tag-scopes` (6).

## 3. 7262da5b: Quick links labels wrap

**Finding 4.** "Apply defaults to all users" ran past its Quick links button.

**Fix.** The labels wrap, and the grid never asks for more than the card's width.

**Guard.** `tests/browser/settings-overflow.spec.cjs` opens every tab and row of the three surfaces at 420, 900, 1100, 1280 and 1400px, in the dark and light themes. It fails when any line of text runs past the content box of the box holding it. It measures in Noto Sans, and fails on the old rule: 11px past the box at 1280px. It runs on 3 engines (9 tests).

## 4. 82632b93: slot placement without `Element.after`

The offline parity harness's minimal DOM lacked `Element.after`. Item-look profiles lost groups on the web side (22,896 differences), and are back to 0.

## Verification

Full set at 7262da5b, on this machine, niced and capped:

| Check | Result |
|---|---|
| Frontend | 2439/2439 |
| Backend | 2566/2566 |
| Browser | 435/435 (three projects; new guards included) |
| jf12 and jf10 Release builds | 0 warnings |
| Translations, inventory, poster assets, `git diff --check` | pass |
| Parity | failed there (the `Element.after` issue above) |

At 82632b93: parity `--offline` 0 differences (`parity-summary.txt`; 240 Status fixtures identical), `core-tag-layout` and `core-tag-renderer` 79/79, and the monotonic guard 15/15 on three engines.

`translation-coverage.md` is informational only: locale translation is out of scope (Weblate).

## Lab (je-lab-centres, deploy of 82632b93)

**Legacy viewer (settings saved before layouts):**
- Home: AE = 0 against the round-6 capture (1400×660+0+90).
- Movies: tags identical to the dd6572be deploy. The only differing pixels are the header's random dice icon (10×10 at +1146+19), which varies per load.

**Before/after toggle captures** are in `captures/`. They are on the real admin page, with every save request answered locally so the lab configuration is untouched. `captures-log.txt` lists the chips each capture shows.
- **Caption preview at 900 and 1400px:** Age rating, Language, Quality, Rating and Genre each switched off and on again (`caption-<width>-<group>-1-on/2-off/3-on-again.png`). The chips after "on again" are identical to the first state every time. Switching a group off never hides another group's chips: switching Quality off shows more chips (97%, ★8.7, TV-MA, flag).
- **"Where to show", Genre off for Episodes (Corners):** the sample episode goes from 2 genre chips to 0 and back to 2 (`scope-<width>-genre-episodes-*.png`).
- **Pre-fix captures from d8a8767e** (`before-fix-d8a8767e-caption-1400-age-on/off.png`).
- **Admin Groups tab** (`admin-groups-<width>.png`): Edit on every group with settings, People inline, and the Genre row open on its Where to show block.
- **Quick links** at 420, 900, 1280 and 1400px (`quick-links-<width>.png`).
- **Hub fixture:** with Genre off for Episodes, the sample episode shows no genres (`hub-genre-episodes-off-sample-episode-has-no-genres.png`).
- **Item editor** (`item-editor.png`), with its Where to show note.
