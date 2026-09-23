# Analytics privacy contracts

Run `dotnet run --project src/features/analytics/tests/server/AnalyticsTests.csproj`
from the repository root with .NET 10.

The test links the production analytics projection, wire models and complete
plugin configuration schema. Only Jellyfin's configuration base class is stubbed.
It populates every unannotated string field, including future additions, to
ensure credentials and free text never enter shared analytics settings. It also
checks language-code normalization, affected-user privacy, API-key presence flags
and event wire names. It performs no network calls and does not exercise consent
or scheduling, which remain in the analytics service.
