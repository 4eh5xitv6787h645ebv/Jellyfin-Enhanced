# Web assets

These services keep their existing `Jellyfin.Plugin.JellyfinEnhanced.Services` namespace and dependency-injection registration.

- `CdnAssetService` coordinates the hot, disk and negative caches, limits concurrent outbound requests, and runs the scheduled refresh inventory.
- `CdnAssetCatalog` owns the upstream allow-list, accepted content types, fixed URL mappings, safe request-path policy, and ordered warm-up inventory. Add a new upstream or warm asset here.
- `CdnAssetFetcher` owns HTTP requests, content-type checks, the streaming byte limit, and content-derived ETags.
- `CdnAssetDiskCache` owns hashed filenames, JSON metadata, atomic writes, and oldest-first disk-budget eviction.
- `ScriptInjectionStartupFilter` injects the client bootstrap into the web index response.
- Branding interception belongs to `src/features/appearance/server/BrandingAssetStartupFilter.cs`; it serves uploaded replacements for Jellyfin web branding assets.

The CDN service's constructor, `KnownAssets`, nested `CdnAsset` record and public methods are compatibility surfaces. Disk entries retain their existing source directory, SHA-256 filename and `ContentType`/`ETag`/`FetchedAt` metadata. Preserve freshness and negative-cache intervals, stale fallback, caller cancellation, bounded fetch concurrency, and per-host refresh pacing when editing the coordinator. Fixed-path sources must remain restricted to their exact registered keys.

The host injection filter and appearance feature filter are intentionally separate middleware: injection buffers an HTML response, while branding intercepts a static asset request. Their request matching, fallthrough behavior, header handling, and configuration switches have different lifecycles.

Run the isolated CDN contracts with:

```sh
dotnet run --project src/host/assets/tests/server/AssetTests.csproj
```

Tests link the production CDN source files, use the real Newtonsoft serializer, and substitute only host wiring and the upstream HTTP handler. No external CDN is contacted and cache files live in a disposable temporary directory.
