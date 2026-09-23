# User-file persistence

`UserConfigurationManager` keeps the established generic API for per-user files,
canonical user IDs, path checks, lock identity, read policies, atomic writes, corrupt
file backups and directory migration. Existing filenames and directory layout remain
unchanged.

Feature stores own feature-specific persistence:

- `features/reviews/server/ReviewStore.cs`: server-wide `reviews.json`.
- `features/activity/server/ActivityStore.cs`: server-wide `activity.json`.
- `features/seerr/server/ProcessedWatchlistStore.cs`: processed-watchlist filenames
  and retention rules using the generic user-file API.

The small feature-local `UserConfigurationManager.<Feature>.cs` partials retain public
compatibility accessors and forward to these stores. The manager constructor composes
the stores once, preserving their previous lifetime and static write locks. New feature
logic belongs in a feature store, not in the generic manager.
