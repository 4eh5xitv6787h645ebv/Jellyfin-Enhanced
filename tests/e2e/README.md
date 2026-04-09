# E2E tests

End-to-end Playwright tests for Jellyfin Enhanced. These run against a
**live Jellyfin dev server** with the plugin DLL deployed. They do not
mock Jellyfin — they actually log in, click through, and assert on the
real DOM.

## Requirements

- A running Jellyfin container with the plugin installed. The scripts
  default to `http://localhost:8097`; override with `TEST_JELLYFIN_URL`.
- An admin account named `admin` with password `4817` (matches the dev
  container convention used throughout `REVIEW_FINDINGS.md` and the
  `/JE` skill).
- Node.js 20+ and `npm install` completed in this directory.

## Running

```bash
cd tests/e2e
npm install           # first time only
npm test              # full sweep — sequential with pauses
```

Or run a single test:

```bash
npm run test:asset-cache
npm run test:theme-selector
npm run test:sidebar
```

## Why sequential-with-pauses

`jellyfin-dev` can OOM-restart under rapid E2E load. The `npm test`
script explicitly sleeps between test files. If you see
`ERR_CONNECTION_RESET` or login timeouts, check
`docker ps --filter name=jellyfin-dev --format '{{.Status}}'` — under 30
seconds means the container restarted, wait another 20 seconds.

## CI

CI runs these tests on manual workflow dispatch only (they need a
jellyfin-dev instance that CI doesn't have by default). See
`.github/workflows/ci.yml`.

## Adding a new test

Tests are plain Node scripts that use the `playwright` package directly
(no test runner framework). The pattern:

```js
const { chromium } = require('playwright');
const BASE = process.env.TEST_JELLYFIN_URL || 'http://localhost:8097';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];
  function check(label, cond, info) { /* ... */ }

  try {
    // ... test steps ...
    check('thing worked', condition);
  } finally {
    // ... print results + exit ...
  }
}
run();
```

Name each test file by the behavior it locks in
(`test-theme-selector-referror.js`, `test-sidebar-teardown.js`). A good
test is one that would have caught the original bug — if you're adding
it in response to a regression, include the empirical error in a
comment so future reviewers can see the failure mode.
