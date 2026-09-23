# Backend HTTP and integration contracts

Run from the repository root with the .NET 10 SDK:

```sh
dotnet run --project tests/compatibility/api/backend-contracts.csproj
```

The executable has no test-framework package dependencies. It uses Roslyn from the SDK to
compare the 149 upstream action signatures against the refactored controller sources. The
fixture protects routes/verbs, all action attributes (including authorization, body limits,
and cache behavior), parameter types/binding, and default values. It also checks the shared
route prefix and rejects accidental public controller helpers that MVC could expose.

`controller-contract-baseline.json` was captured from the original monolithic controller.
An intentional API change must update the corresponding fixture entry alongside the change
and its behavior tests. Do not regenerate the fixture merely to hide an unexpected failure.

`SeerrStatusScenarios` compiles the actual status service, shared cache owner, and Seerr HTTP
helper. An in-memory HTTP handler exercises instance fallback, outbound authentication, named
client selection, timeout, positive/negative caching across service instances, TTL expiry,
and configuration invalidation. `SeerrHostStubs` substitutes only host configuration/logging
and the identity cache invalidation callback; these scenarios do not contact a live Seerr
server. Actual host route/resource discovery is covered separately in `tests/runtime` and
`tests/compatibility/integration/plugin-pages`.
