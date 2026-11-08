# Browser entry manifests

Each feature owner adds a flat `<feature>.json` object mapping output paths relative to
`Jellyfin.Plugin.JellyfinEnhanced/` to entry sources relative to the repository:

```json
{ "js/core/session.js": "client/src/core/session-entry.ts" }
```

The schema is `../entry-manifest.schema.json` (outside this directory so it is not
discovered as an entry). No metadata keys or empty placeholder manifests. Every
JSON file here is discovered in filename order. Keep manifests directly in this
directory. Paths use `/`, with no absolute paths, traversal or symlinks. Outputs
must end in `.js`; entries must be non-declaration `.ts` files under `client/src`.
Outputs must not collide by case or embedded-resource name. Output directories
must be ASCII identifiers (`[A-Za-z_][A-Za-z0-9_]*`); basenames allow letters,
digits, underscores and hyphens, followed by one `.js` extension. The schema and
builder reject hyphenated directories and extra filename dots because MSBuild
can rename them or interpret a suffix as a satellite-resource culture. TypeScript
source paths are independent of this production-resource naming restriction.

Run `npm run client:build`, then commit source, manifests, generated `.js` and
`.js.map` files, and `client/generated-manifest.json` together. The build never
changes unmapped legacy JavaScript. An empty directory is temporarily supported
while the first runtime entry is implemented, with an explicit status message;
it does not mean the rewrite is complete.

See [frontend build](../../docs/rewrite/frontend-build.md) for validation and
removing or moving an entry.
