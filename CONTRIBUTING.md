# Contributing to Jellyfin Enhanced

Contributions can improve features, fix bugs, clarify documentation, or translate the UI. Check existing [issues](https://github.com/n00bcodr/Jellyfin-Enhanced/issues), [pull requests](https://github.com/n00bcodr/Jellyfin-Enhanced/pulls), and [discussions](https://github.com/n00bcodr/Jellyfin-Enhanced/discussions) before starting overlapping work.

## Build and check locally

Install **.NET SDK 10** and **Node.js 22 or later**. Build and regression tools use their standard libraries; **no `npm install` is needed**. Python 3 is needed only for the optional documentation build and Docker/browser smoke harness. Run commands from the repository root.

```sh
npm run generate       # Compose resource maps, bootstrap and dashboard assets
npm run check:static   # Freshness, registration, syntax, translations and Node tests
npm run check:backend  # Both release targets, compiled resources and backend tests
npm run check          # Combined validation
npm test               # Node regression tests only
```

`dotnet build` from the root uses `JellyfinEnhanced.slnx` and builds the default `jf12` target. Tests run separately through the commands above. To build explicitly:

```sh
dotnet build src/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf12
dotnet build src/JellyfinEnhanced.csproj -c Release -p:JellyfinTarget=jf10
```

| Target | Host | Output directory |
| --- | --- | --- |
| `jf12` (default) | Jellyfin 12 / .NET 10 | `artifacts/bin/Release/net10.0/` |
| `jf10` | Jellyfin 10.11 / .NET 9 | `artifacts/bin/Release/net9.0/` |

Generated assets and resource mappings under `artifacts/generated/` are committed so a .NET-only consumer can build the plugin. When changing their sources, regenerate and include both source and artifact changes. The [maintainability workflow](.github/workflows/maintainability.yml) runs the same validation commands; security, dependency, translation and documentation workflows provide additional checks.

## Start with the feature

Open [`src/features/`](src/features/), choose the feature, and read its `README.md`. Each feature owns its API, server behavior, browser UI, settings, event/integration adapters and focused tests. The [feature ownership map](docs/advanced/feature-layout.md) identifies all feature directories and explains their boundaries.

For example, a bookmark change starts in [`src/features/bookmarks/`](src/features/bookmarks/): routes are in `api/`, browser behavior in `client/`, persisted properties and dashboard controls in `settings/`, and tests in `tests/`. Do not add bookmark-specific code to a global layer directory.

| Concern | Owner |
| --- | --- |
| A feature's endpoint, behavior, setting or test | `src/features/<feature>/{api,server,client,settings,tests}/` |
| Plugin lifecycle, DI and Jellyfin compatibility | `src/host/` |
| Web asset delivery and bootstrap | `src/host/assets/`, `src/host/bootstrap/` |
| Dashboard shell and cross-feature composition | [src/host/dashboard](src/host/dashboard/README.md) |
| Reusable browser, identity, HTTP or persistence mechanics | [src/shared](src/shared/README.md) |
| Translation strings | `locales/` |
| Build/check tools and common test helpers | `tools/` |
| Whole-plugin compatibility and disposable runtime checks | `tests/compatibility/`, [tests/runtime](tests/runtime/README.md) |

**Do not edit `artifacts/generated/` directly.** Existing API routes, public asset URLs, embedded-resource names, serialized properties and defaults remain compatibility contracts. Source locations describe ownership; explicit resource mappings preserve delivery names independently.

## Add or change a backend endpoint

1. Use the owning feature's `api/` directory. Keep route binding, authorization, status codes and response envelopes explicit. Host configuration/assets endpoints belong in `src/host/api/`.
2. Put application behavior and feature-owned state in `server/`. Use `integrations/` for an adapter that connects this feature to another feature or provider. Share mechanisms through `src/shared/` only when they have multiple real consumers.
3. Register injected services with host composition. Preserve lifetime, cache scope, cancellation and disposal ownership. Pure helpers can share their owner's lifetime instead of getting a new global registration.
4. Add behavior coverage beside the feature. Intentional HTTP changes also require a deliberate update to `tests/compatibility/api/controller-contract-baseline.json`; do not regenerate the whole fixture to hide unexpected differences.
5. Run `npm run check:backend` and update `docs/advanced/api.md` for public contract changes. Both Jellyfin targets must build.

`src/shared/identity/UserControllerBase.cs` contains common identity/auth helpers. Seerr owns its proxy base in `src/features/seerr/api/`. Public helper methods can become MVC actions: keep non-action helpers private/protected or explicitly excluded.

## Add or change browser behavior

1. Work in the feature's `client/` directory. Keep transport, rendering, state and lifecycle responsibilities clear. Preserve existing public `JE.*` entry points when extracting helpers.
2. Register a new ordinary script in the feature's `feature.json` under `modules`: the key is its feature-relative source, and the value lists named prerequisites. For example, `"client/policy.js": ["spoiler-guard/ids"]` gives the new module the ID `spoiler-guard/policy`. Add that ID to each consumer's dependencies. Editing an already registered script needs no descriptor change.
3. New modules receive a public path such as `/JellyfinEnhanced/js/features/spoiler-guard/policy.js`. `src/host/compatibility/asset-aliases.json` retains historical delivery names, and `src/host/bootstrap/module-order.json` retains historical component order. Ordinary additions need no entry in either file. A dedicated early/lazy script instead belongs in `standalone`, with a loading reason; its caller must still load it.
4. If initialization needs a new call, define a named function in the feature's private `client/startup.js` and call it explicitly from `src/host/bootstrap/feature-startup.js`. Declare the private source through `startup` in the feature descriptor if absent. Keep feature conditions in that initializer. These sources are composed into the bootstrap, not fetched as components; existing startup functions can be edited without adding registrations.
5. Use `src/shared/browser` infrastructure for SPA navigation, request coordination and cleanup. A feature coordinator owns listeners, timers, observers and abortable work. Register synchronous user-data resets with `JE.session.onUserChange`, and check a captured session epoch before applying asynchronous user-scoped results.
6. Add tests under the feature's `tests/client/`, run `npm run generate` and `npm run check:static`, and rebuild the DLL to serve changed embedded assets.

Non-script embedded files are listed in the descriptor's `assets` array. Embedding a new HTML, CSS or other file does not automatically add an HTTP endpoint: page registration and asset-serving routes remain explicit host/feature responsibilities. Generated resource/module manifests are outputs, not authoring locations. See the [Spoiler Guard walkthrough](docs/advanced/spoiler-guard-development.md) for a concrete dependency change and browser test.

## Add or change a setting

Start in the feature's `settings/` and the [dashboard composition guide](src/host/dashboard/README.md). Feature-owned `PluginConfiguration.<Feature>.cs` and `UserSettings.<Feature>.cs` parts preserve the existing flat public models. Keep names, types, namespace and defaults compatible; a move does not require a data migration. Defaults are property initializers beside their declarations, with no defaults-helper registration.

Put the control in a feature settings section and its `load`, `read` and `getDependencies` behavior in `settings/settings.js`. An existing module needs no new host entry when adding another control. For a new module, register its source in `src/host/dashboard/scripts.json`, construct its factory and add the instance to `featureSettings` in `initialize.js`, and include its markup in the appropriate host tab. See the dashboard guide for editor lifecycle and injected operations. Host dashboard code owns the form shell, save/reset lifecycle, fresh-config merge and cross-feature editor coordination. Preserve failed-load guards so a failed editor load cannot erase saved data.

A setting consumed by ordinary browser features also needs an explicit, safe projection in `src/host/api/ConfigurationController.cs` (`GetPublicConfig`). Server-only settings do not. That endpoint is a security boundary; do not expose credentials merely because a control exists.

Add focused tests beside the feature and retain the whole-form/control contract checks under `tests/compatibility/configuration/`. Register CSS composition in the dashboard style list and preserve cascade order. Run `npm run generate` and `npm run check:static`. The host dashboard's `whats-new-seed.json` is a historical release baseline and should not be edited for new settings.

## Translations

Contribute translations through [Weblate](https://hosted.weblate.org/projects/jellyfinenhanced/); see the [translation guide](docs/faq-support/contributing-translations.md). Code-facing strings live in `locales/en.json`. Maintain locale key sets and interpolation/icon placeholders when adding keys. `src/shared/localization/resources.json` registers locale resources independently of their historical public URLs. When adding a language file, add its source to the `assets` list there and run `npm run generate`; keep `locales/` limited to translation JSON files.

```sh
node tools/checks/validate-translations.js validate
node tools/checks/validate-translations.js validate de
node tools/checks/validate-translations.js find-unused
```

Unused-key reports need investigation because code can build keys dynamically. Remove a key only after checking its consumers.

## Tests and runtime checks

Feature tests belong in `src/features/<feature>/tests/`; host/shared behavior tests live beside those owners. Node uses its native test runner for `.test.js`, `.test.cjs` and `.test.mjs`. Common adapters live in `tools/testing/`. Exercise observable behavior and compatibility boundaries with controlled responses and temporary data rather than reproducing implementation details.

Backend regression projects are executable programs run with `dotnet run --project <project.csproj>`, not `dotnet test`. The check runner discovers these projects separately from the plugin build. Whole-plugin routes, resources, configuration schemas and page-integration contracts remain under `tests/compatibility/`.

For real server/browser checks, use the optional [disposable Docker runtime harness](tests/runtime/README.md). It creates isolated Jellyfin servers and users, tests API and persisted configuration, and can exercise Chromium login/bootstrap/admin forms. It requires Python and Docker; browser dependencies live in an isolated virtual environment. It does not replace playback or live Seerr/ARR/TMDB validation.

For browser changes, test repeated SPA navigation, user switching, relevant themes/layouts and keyboard/TV interactions. For Shoko calendar changes, test standalone and mixed providers, missing Shokofin matches, restricted content, episode-type filters, partial failures and deliberately separate Shoko/Sonarr entries. Report the checks actually performed.

## Submit a pull request

Use a focused branch and describe the concrete problem, resulting behavior and validation. Include screenshots for UI changes. Explain non-obvious contracts, state ownership, cancellation and failure policy in comments where needed.

AI-assisted contributions are welcome. Understand and review the submitted code, disclose assistance in the PR description, and be ready to explain and revise the implementation. For help, use [GitHub Discussions](https://github.com/n00bcodr/Jellyfin-Enhanced/discussions) or the [Jellyfin Community Discord](https://discord.gg/EYNFf7y4CG).
