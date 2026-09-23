# Features

Choose the feature first. Its README maps API, server behavior, browser code, settings, adapters and tests. Infrastructure lives in [host](../host/README.md) and [shared](../shared/README.md).

| Feature | Entry point |
| --- | --- |
| Active streams | [active-streams/](active-streams/README.md) |
| Activity | [activity/](activity/README.md) |
| Analytics | [analytics/](analytics/README.md) |
| Appearance | [appearance/](appearance/README.md) |
| ARR connections and links | [arr/](arr/README.md) |
| Bookmarks | [bookmarks/](bookmarks/README.md) |
| Calendar | [calendar/](calendar/README.md) |
| Downloads and request management | [downloads/](downloads/README.md) |
| Hidden content | [hidden-content/](hidden-content/README.md) |
| Item details | [item-details/](item-details/README.md) |
| Maintenance mode | [maintenance/](maintenance/README.md) |
| Navigation and page integration | [navigation/](navigation/README.md) |
| Playback | [playback/](playback/README.md) |
| Ratings and awards | [ratings/](ratings/README.md) |
| Reviews | [reviews/](reviews/README.md) |
| Seerr | [seerr/](seerr/README.md) |
| Spoiler Guard | [spoiler-guard/](spoiler-guard/README.md) |
| Streaming availability | [streaming-availability/](streaming-availability/README.md) |
| Tags | [tags/](tags/README.md) |
| User settings | [user-settings/](user-settings/README.md) |

New files go with their owner. Add a shared primitive only for actual cross-feature consumers, and keep registration in the owning `feature.json`. See the [feature-layout guide](../../docs/advanced/feature-layout.md) and [CONTRIBUTING](../../CONTRIBUTING.md).
