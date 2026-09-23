# Review browser ownership

Review sources live here; their original `js/elsewhere/reviews*.js` public paths are retained in the host compatibility alias map. The feature descriptor declares sources and named prerequisites.

| File | Responsibility |
| --- | --- |
| `reviews.js` | Navigation, Spoiler Guard policy, section assembly, mutations and refresh coordination |
| `reviews-api.js` | TMDB/user-review transport and shared movie/series/season/episode key resolution |
| `reviews-rendering.js` | Cards, Markdown, stars, authoring form, translations and confirmation dialogs |
| `reviews-styles.js` | Idempotent stylesheet injection and dynamically resolved font URL |

Rendering receives save/edit/delete callbacks; transport belongs to the API module. Initial rendering and refresh share `resolveReviewTarget`, including season zero and episode zero. Keep mutations single-attempt (`skipRetry: true`) and preserve failed-read distinctions: TMDB reads return `null`, user-review reads return `[]`. Spoiler Guard checks must finish before requests or rendering.

Run `node --test src/features/reviews/tests/client/*.test.cjs` from the repository root. See the [feature guide](../README.md) for API, persistence and settings ownership.
