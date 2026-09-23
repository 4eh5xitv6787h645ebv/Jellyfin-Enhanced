# Poster tags

Tag modules register feature-specific renderers with `core/tag-renderer-base.js`.
That factory owns shared cache persistence, CSS installation, ignored-card
selection, tagged markers, and reinitialization. `tag-pipeline.js` discovers cards,
acquires metadata, and dispatches it to registered renderers. Keep new tag-specific
rules out of those shared lifecycle components.

## Quality badges

Quality badges have three distinct responsibilities:

- `quality-analysis.js`: derives labels from Jellyfin streams, media sources, and
  item names/paths. Its detectors do not access settings, the DOM, or caches.
  Add or adjust detection rules here, preserving metadata precedence.
- `quality-policy.js`: defines badge categories and colors, normalizes composite
  audio labels, and applies user category filtering and ordering. Unknown labels
  from older caches remain visible at the end. Its `selectLabels` function does
  not mutate the input labels.
- `qualitytags.js`: renders badges and adapts hot, persistent, and server caches
  to the common renderer factory. Public initialization methods, cache keys,
  CSS classes, and tagged attributes remain here.

Load both quality helpers before `qualitytags.js`. Their internal interfaces are
`JellyfinEnhanced.tags.qualityAnalysis` and `JellyfinEnhanced.tags.qualityPolicy`;
settings integrations continue to use `initializeQualityTags` and
`reinitializeQualityTags`.

Run quality detection, selection, DOM-contract, and cache invalidation checks from
the repository root:

```sh
node --test src/features/tags/tests/client/tags-quality.test.js
```

Tests intentionally capture some non-obvious existing behavior: explicit channel
layout signals take precedence over raw channel counts; the first recognized
audio stream wins; `NON-IMAX` vetoes positive IMAX signals; source badges retain the
`other-quality` CSS class. Changes to these rules are behavior changes and should
be reviewed separately from structural maintenance.
