# A Spoiler Guard change from setting to test

Start in `src/features/spoiler-guard/`. This walkthrough follows the existing
**Strict refresh mode** setting and series toggle, then shows where to register
new pieces. It is a navigation and extension example; it does not add a new
setting or endpoint to the plugin.

## Follow an existing change

Suppose a report says that enabling Spoiler Guard updates images but leaves the
old episode text visible. Search the feature first:

```sh
rg -n 'SpoilerBlurStrictRefresh|spoilerBlurStrictRefresh' src/features/spoiler-guard
```

The current behavior is intentional: images refresh in place after a successful
toggle; Strict refresh also schedules a page reload so Jellyfin fetches fresh
text. A failed toggle shows the error toast and releases the button.

| Part of the flow | Source |
| --- | --- |
| Persisted administrator setting and default | `settings/PluginConfiguration.SpoilerGuard.cs` |
| Administrator control and explanation | `settings/sections/spoiler-guard.html` |
| Form loading, reads and dependency rules | `settings/settings.js`, `createSpoilerGuardSettings()` |
| Exposed browser configuration | `src/host/api/ConfigurationController.cs`, `GetPublicConfig` |
| Button action, success/error handling and Strict refresh branch | `client/detail-button.js` |
| Browser state and HTTP operations | `client/state.js` |
| ID normalization | `client/ids.js` |
| Image refresh and delayed full reload | `client/image-refresh.js` |
| Authenticated series opt-in endpoint | `api/SpoilerOptInController.cs` |
| Persisted user opt-ins | `settings/UserSpoilerBlur.cs`, `settings/SpoilerBlurSeriesEntry.cs` |

Paths without `src/` in this guide are relative to `src/features/spoiler-guard/`.
An edit to an existing function needs no new asset or startup registration.

## Change a setting deliberately

The server default is beside the property:

```csharp
public bool SpoilerBlurStrictRefresh { get; set; } = false;
```

An existing installation can already contain an explicit value. Changing this
default does not overwrite that saved value. Keep `SpoilerStripSeriesOverview`
nullable: its `null` value identifies older configurations and intentionally
falls back to the previous overview policy.

The dashboard control is `spoilerBlurStrictRefresh` in
`settings/sections/spoiler-guard.html`. Its behavior lives together in
`settings/settings.js`. `createSpoilerGuardSettings()` returns:

- `load(config)`, which reads saved values into controls, with explicit fallbacks
  for absent values;
- `read(config)`, which writes controls into the current configuration;
- `getDependencies()`, which returns the parent-switch rules for those controls.

Strict refresh appears in the load tuple list with default `false`, in the read
control-ID list, and in the `spoilerBlurEnabled` parent's children. Change those
entries together with the markup and server property when adding a comparable
setting. Nullable overview inheritance, intensity bounds and placeholder
sanitization also stay in this module. No host registration is needed for another
control handled by these existing methods.

The module is already composed through these concrete points:

1. `src/host/dashboard/scripts.json` includes
   `features/spoiler-guard/settings/settings.js`.
2. `src/host/dashboard/initialize.js` constructs `createSpoilerGuardSettings()`
   and places its instance in the ordered `featureSettings` array. The coordinator
   calls its `load` and `read` methods; the dependency engine receives its returned
   rules through that same array.
3. `src/host/dashboard/tabs/display.html` includes
   `features/spoiler-guard/settings/sections/spoiler-guard.html`.

If adding a different feature's first settings module, add those three composition
entries for that owner. Keep the factory's external operations explicit and inject
only what it uses. A settings editor that installs listeners, timers or observers
also needs an explicit initialization call and an owned lifecycle scope in
`initialize.js`, following an existing editor; the simple Spoiler Guard module
needs neither. New CSS belongs in the host dashboard's ordered `styles.json`.
Dashboard sources are composed into the page, so do not register these settings
modules as ordinary client assets in `feature.json`.

The dashboard saves administrator configuration through Jellyfin's plugin
configuration API, using `ApiClient.updatePluginConfiguration`. This is separate
from the per-user `/spoiler-blur/...` endpoints used by the detail-page buttons.
The host form starts from fresh configuration so properties without a dashboard
control survive a save.

A setting needed by ordinary browser components also needs an explicit entry in
`ConfigurationController.GetPublicConfig`: the bootstrap loads that projection
into `JE.pluginConfig`. Strict refresh already has one. A server-only property
needs no projection. Decide whether a new value is safe for this endpoint,
including unauthenticated callers; configuration locality does not make secrets
public automatically.

There is no defaults helper or host-constructor call to register. Keep the public
property name, CLR type and serialized shape stable unless a data-contract change
is part of the intended feature change.

## Follow the endpoint and browser boundary

`detail-button.js` chooses the operation for a series, movie or collection.
For a series, `state.js` normalizes its ID and calls:

```text
POST /JellyfinEnhanced/spoiler-blur/series/{seriesId}
```

`SpoilerOptInController.EnableSpoilerBlurForSeries` owns that route. It checks
identity and series access, then updates the user's `spoilerblur.json` through
the configuration manager's read-modify-write operation. Keep the strict read
and corruption handling: a broken saved file must not become an empty list that
erases other opt-ins. Existing entries retain their original enable timestamp.

The browser adds the ID to its enabled set only after the request succeeds. The
request uses `skipRetry: true`, preserving the current mutation policy.
`detail-button.js` then updates presentation, invalidates tag data, refreshes
images, and reads `JE.pluginConfig.SpoilerBlurStrictRefresh` before scheduling a
reload. Change policy in its owning layer; avoid adding a second HTTP request or
another copy of the enabled set to the button code.

If the work needs a new endpoint, add it to the appropriate feature controller
or a new controller under `api/`. Preserve the `JellyfinEnhanced` route prefix,
authorization, request binding and explicit response behavior. Controllers are
discovered by the host; there is no controller manifest entry. A newly injected
service needs registration in the appropriate existing phase of
`SpoilerGuardFeature.cs`. Keep MVC response-filter order unchanged unless changing
that contract is explicitly part of the work.

## Register only what the change adds

Changing an existing setting, endpoint, browser function or startup condition
needs no new browser registration. If a change introduces a helper that must run
before `state.js`, create `client/policy.js` and edit the owning `feature.json`:

```json
"client/policy.js": ["spoiler-guard/ids"],
"client/state.js": ["spoiler-guard/policy"]
```

These are entries in the existing `modules` object, not a complete descriptor.
The helper's ID is `spoiler-guard/policy`. This example makes ID normalization
available to the helper and makes the helper available before state is evaluated.
Name any additional real prerequisites explicitly. The build rejects missing or
cyclic dependencies and retains the relative order of the existing modules.

The new helper is served as
`/JellyfinEnhanced/js/features/spoiler-guard/policy.js`. Existing scripts keep
their old URLs through `src/host/compatibility/asset-aliases.json`. Do not add the
new helper to that historical alias map or to `src/host/bootstrap/module-order.json`;
the feature descriptor and consumer dependency are its complete registration.
A deliberate rename of an existing source instead requires updating its alias
key to retain the established public path.

If initialization can stay in the existing `startSpoilerGuard(JE)` function,
change `client/startup.js` there. That private source is already declared by
`"startup": "client/startup.js"`. If a separate startup call is needed:

1. Define a named `start...` function in that file, keeping its configuration
   conditions inside the function.
2. Call it exactly once from `src/host/bootstrap/feature-startup.js` in the needed
   order. The checker verifies every declared initializer is scheduled once.
3. Regenerate the bootstrap and extend startup behavior coverage as appropriate.

Private startup sources are composed into `plugin.js`; do not also register them
as downloadable `modules`. Startup order and configuration readiness are real
behavior: `client/index.js` has an existing guarded initialization at evaluation
time as well as its later startup call. Preserve that idempotent behavior when
extracting helpers.

Non-script `assets` are embedded but do not gain a public endpoint automatically.
A new served page or stylesheet may require explicit host page registration or
an asset-serving action. None is needed for this example's ordinary JavaScript
helper.

## Add a focused browser test

A new `.test.cjs` file under `tests/client/` is discovered by `npm test` and the
static checks. It needs no descriptor entry. This example can be saved as
`src/features/spoiler-guard/tests/client/state.test.cjs`; it exercises the actual
state code and a controlled request boundary:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('series opt-in becomes visible only after the request succeeds', async () => {
    let complete;
    const response = new Promise(resolve => { complete = resolve; });
    const calls = [];
    const JE = {
        core: { api: { plugin(route, options) {
            calls.push({ route, options });
            return response;
        } } }
    };
    const context = vm.createContext({ window: { JellyfinEnhanced: JE } });
    for (const file of ['ids.js', 'state.js']) {
        const source = path.join(__dirname, '../../client', file);
        vm.runInContext(fs.readFileSync(source, 'utf8'), context, { filename: file });
    }

    const state = JE.internals.spoilerGuard;
    const id = '00112233-4455-6677-8899-AABBCCDDEEFF';
    const pending = state.enableForSeries(id);
    assert.equal(state.isEnabledFor(id), false);
    assert.equal(calls[0].route,
        '/spoiler-blur/series/00112233445566778899aabbccddeeff');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.skipRetry, true);

    complete({ success: true });
    await pending;
    assert.equal(state.isEnabledFor(id), true);
});
```

For a fix in Strict refresh itself, cover `detail-button.js` with a button/DOM
adapter and assert the observable result: successful toggles schedule a reload
only when enabled; rejected requests release the button without scheduling one.
For server policy, extend `tests/server/Program.cs` and run its existing executable
project. Node boundary tests do not prove real Jellyfin DOM behavior or image
filtering.

## Validate the complete change

From the repository root:

```sh
node --test src/features/spoiler-guard/tests/client/state.test.cjs
node --test tests/compatibility/configuration/*.test.mjs
dotnet run --project src/features/spoiler-guard/tests/server/SpoilerGuard.Tests.csproj
npm run generate
npm run check
```

The first command assumes you added the example test. Generation updates delivery
assets and configuration documentation metadata; include those outputs with their
source changes.

For an intentional new setting, review the schema/default and form-control
fixtures under `tests/compatibility/configuration/`. For an intentional HTTP
contract change, update only the affected action entry in
`tests/compatibility/api/controller-contract-baseline.json` and its API
documentation. A refactor that preserves behavior should keep those fixtures
unchanged.

Finally, use an isolated Jellyfin instance to check the administrator control,
series toggle, saved state after reload, another user's independent state, and
the failure path. The [runtime harness](https://github.com/n00bcodr/Jellyfin-Enhanced/blob/main/tests/runtime/README.md)
provides disposable server/browser setup. Its generic smoke checks do not
exercise every Spoiler Guard policy; report the feature-specific checks you
actually performed.
