# Arr frontend ownership

The Arr features use the existing browser-global module system; no bundle or extra
runtime is required. Public script URLs remain available through the plugin resource
endpoint. Register dependencies in the frontend module registry rather than adding
ad-hoc script tags.

## Item detail links

Load `arr-links-data.js` and `arr-links-view.js` before `arr-links.js`.

- `arr-links-data.js`: private configuration, URL mappings, enabled/legacy instance
  selection, API responses, lookup caches, and deduplicated error notifications.
  `JE.arrLinks.createData(logPrefix)` creates a fresh owner for each initialization;
  do not share it across users. Backend errors produce no links and remain retryable.
- `arr-links-view.js`: styles, external-link buttons, status formatting and instance
  dropdowns. `JE.arrLinks.createView()` returns presentation functions. The delegated
  outside-click handler and stylesheet are installed only once per document.
- `arr-links.js`: feature/admin gate, current user epoch, visible detail-page lookup,
  async navigation guards, observer and debounce, and composing data into the view.
  Keep the existing `initializeArrLinksScript` entry point for the loader.
- `arr-tag-links.js`: Jellyfin tag navigation, independent of external Arr instances.

URL mappings deliberately match a normalized *complete Jellyfin server address*,
including any base path. Preserve the distinct default/mapped trailing-slash behavior
when changing mapping code. Disabled instances are filtered before the legacy fallback.

Run the dependency-free behavior tests from the repository root:

```sh
node --test src/features/arr/tests/client/arr-links.test.cjs
```

They cover config compatibility, URL mapping, API paths, session cache
isolation, error recovery/escaping, button/dropdown output and navigation/admin guards.
They use controlled API and DOM substitutes; they do not contact a live Arr server.

## Related feature pages

Calendar modules now live in [calendar](../../calendar/README.md); download/request management modules live in [downloads](../../downloads/README.md). Their established `JE.calendarPage`, `JE.downloadsPage`, `JE.internals.calendarPage` and `JE.internals.requestsPage` surfaces remain unchanged. Source ownership no longer follows the historical `js/arr/` URL directory.
