# Playwright E2E

This suite exercises the installed Jellyfin Enhanced client and server through
real Jellyfin pages. It is intentionally read-only: a route guard fails the run
if a test attempts to change plugin settings, hidden content, bookmarks,
reviews, playback state, favorites, or watched state.

The default fixture is the local Jellyfin 10.11 instance on port 8097 with the
visible passwordless users `TestAdmin` and `Test`. Before running the suite,
build the plugin, install that build on the target server, and restart Jellyfin;
the production loader test intentionally fails when the served bundle does not
match this checkout.

```bash
npm ci
npm run test:e2e
```

On a machine without system Chromium, install Playwright's pinned browser once:

```bash
npx playwright install chromium
```

Environment overrides:

```bash
JE_E2E_BASE_URL=http://127.0.0.1:8097/ \
JE_E2E_ADMIN_USER=TestAdmin \
JE_E2E_USER=Test \
JE_E2E_CHROMIUM_PATH=/usr/bin/chromium \
npm run test:e2e
```

`JE_E2E_ADMIN_PASSWORD` and `JE_E2E_USER_PASSWORD` are supported for other
fixtures, but are empty by default. Generated browser authentication is stored
under `playwright/.auth/` with owner-only permissions. Authentication state,
HTML reports, and test results are gitignored.

Traces, screenshots, and videos are disabled by default because network traces
contain live authentication headers and admin-page captures can expose API
keys. For local debugging only, set `JE_E2E_TRACE=1` and/or
`JE_E2E_ARTIFACTS=1`. Treat every failure report and artifact as credentials,
do not publish it, and remove it after use.

The default fixture currently returns 403 for the read-only Seerr issue-list
request. Diagnostics allow only that exact GET while continuing to fail other
unexpected plugin 4xx/5xx responses.

Coverage includes:

- production bundle, Dev Mode, and missing-bundle fallback loading;
- exact component ordering and installed-bundle hash parity;
- administrator configuration bootstrap and declarative field binding;
- repeated SPA navigation with stable lifecycle/observer registrations;
- media details, Seerr search and more-info modal rendering;
- Requests, Calendar, Bookmarks, and native Hidden Content tabs;
- Enhanced Panel rendering; and
- standard-user private/admin endpoint isolation and embedded view access.

The suite is not a required hosted CI check yet. A trustworthy CI E2E job must
first provision a disposable Jellyfin server, install the DLL built from the
tested commit, and seed deterministic users/media. Pointing pull requests at a
shared external server would test mutable deployment state rather than the PR.
