# Ratings provider contracts

Run `dotnet run --project src/features/ratings/tests/server/RatingsTests.csproj`
from the repository root with .NET 10.

This package-free executable links the production MDBList response parser,
Wikidata query/result mapper and their models. It covers confirmed misses, mixed
provider field types, provider IDs, aggregate scores, account limits, award
grouping, nomination merging, title/person differences and query escaping.
No network or real credentials are used. The scenarios retain the original
service behavior captured before extraction.

Analytics privacy checks live with their owner in
`src/features/analytics/tests/server`.
