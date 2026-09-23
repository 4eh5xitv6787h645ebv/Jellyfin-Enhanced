# Jellyfin dashboard

This directory owns the admin page shell and the small host services that coordinate
feature settings. Feature controls, form logic and editors live in
`src/features/<feature>/settings/`. The output is still Jellyfin's existing embedded
`configPage.html` and `configPage.css`; no browser module loader or frontend framework
is involved.

## Authoring and composition

- `template.html` keeps the page wrapper, tab navigation and two inline script blocks.
  Its recursive `{{include:...}}` HTML includes are relative to `src/` and preserve
  the existing IDs, tab order and markup.
- `tabs/` contains tab wrappers that include feature-owned `settings/sections/*.html`.
- `styles.json` orders host and feature CSS inputs. CSS and HTML fragments are only
  build inputs; they are never independently served.
- `scripts.json` lists **complete JavaScript files**: named factories followed by
  `initialize.js`. JavaScript files cannot contain include directives or depend on
  a variable declared in another file's function body.
- `initialize.js` explicitly constructs each factory with its named dependencies.
  Cross-module callbacks are deferred until all factories exist. Shell constants
  are constructed first; feature factories precede rule collection and host setup.
- `tools/build/build-configuration.mjs` validates each script as a standalone classic
  script, rejects missing/duplicate/unregistered sources and composes the page.
  The generated files in `artifacts/generated/` are checked in for .NET-only builds.

From the repository root:

```sh
npm run generate
node tools/build/build-configuration.mjs --check
node --test tests/compatibility/configuration/*.test.mjs
```

Edit the authoring files, then regenerate. Do not edit the generated page directly.

## Feature settings

A simple feature factory needs only the DOM and its configuration object:

```js
function createExampleSettings() {
    function load(config) {
        document.querySelector('#exampleEnabled').checked = config.ExampleEnabled === true;
    }
    function read(config) {
        config.ExampleEnabled = document.querySelector('#exampleEnabled').checked;
    }
    function getDependencies() {
        return { parents: [{ parent: 'exampleEnabled', label: 'Enable Example', children: ['exampleLimit'] }] };
    }
    return { load, read, getDependencies };
}
```

The real example is `src/features/spoiler-guard/settings/settings.js`. Its state is
private to that feature. Larger editors have their own complete factory files such
as `arr/settings/instances.js` and `seerr/settings/permission-audit.js`; they expose
named operations instead of sharing mutable globals.

To add a setting to an existing feature, add its feature-owned markup and schema
property, then update that feature's `load`, `read` and dependency rules. No host
registration is needed for another field. Preserve the property's serialization
name, default and existing null/migration behavior.

For a new feature module, register its complete script in `scripts.json`, construct
it in `initialize.js`, add it to the ordered `featureSettings` list and include its
markup in the appropriate tab. Host renderers receive explicit feature methods
when a feature contributes a service/overview card. Dependencies returned by
`getDependencies()` use `sections`, `individual`, `parents`, and `customTabsHints`;
the host dependency engine evaluates the collected rules.

## State, side effects and cleanup

`settings-coordinator.js` runs `load(config)` and `read(config)` over the same ordered
feature list. `persistence.js` fetches a fresh server configuration before reading
form values, so unknown server fields survive. Metadata icon normalization runs
after every feature has loaded/read because it constrains both item-details and
Arr fields. The canonical TMDB save field remains the Seerr mirror, matching the
existing page behavior.

The host owns load/save guards, dependency dispatch, navigation/search and dirty
state. Custom Tabs owns its compatibility probe and ownership cache; its second
write merges only ownership flags into a fresh configuration. Feature modules own
their editor data, event handlers and asynchronous request generations. Integrations
are injected as named functions, not an object exposing the old page's entire scope.

Only modules with resources receive a `lifecycle` scope. It owns listeners, timers,
animation frames and observers, and has an explicit `disposed` flag for asynchronous
callbacks. `onDispose(callback)` releases owner-specific resources such as preview
overlays. Native event signals and weak target bookkeeping avoid retaining replaced
editor rows; a manual-removal fallback supports hosts without event signals. A keyed listener refresh replaces that binding on that element while
preserving independent handlers. Modules with startup work expose an idempotent
`initialize()`; a stateless form module needs neither lifecycle nor empty hooks.
Re-executing the page script first invokes persistence cleanup to release its
loading indicator and restore pre-save button states, then disposes the previous
scopes before installing new ones. In-flight writes finish; disposed or superseded read callbacks must not paint
the UI. Seerr user import uses `saveBeforeImport()` to distinguish a confirmed save
from a failed or refused save; the form submit handler retains its existing return
contract. Check both the owner request generation and `lifecycle.disposed` after
asynchronous boundaries.

## Regression boundaries

`tests/compatibility/configuration/` checks source registration, composed markup,
feature load/read behavior, numeric/credential normalization, unknown settings,
shortcut preservation, asynchronous ordering, cleanup and persistence guards.
Historical fixtures capture the original page, including explicitly named baseline
defects; production tests assert the corrected behavior without rewriting those
fixtures. Browser tests additionally compare all controls and outgoing configuration
payloads across default/seeded loads and repeated dashboard visits.
