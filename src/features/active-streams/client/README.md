# Active streams

The existing `extras/active-streams.js` is the public feature entry point. It
publishes `JE.activeStreams.initialize()` and `destroy()`, owns header placement,
visibility, navigation/observer subscriptions and session requests, and invalidates
in-flight responses when the user changes. Requests remain on demand: initial
mount, panel open, and the Refresh button.

The modules in this directory load before the entry point:

| Module | Owns |
| --- | --- |
| `model.js` | Tick formatting and ordered badge descriptors derived from session metadata |
| `styles.js` | Idempotent injection of the feature's CSS under the existing style ID |
| `view.js` | Session cards and panel rendering; receives the last-updated timestamp explicitly |
| `broadcast.js` | An admin broadcast form controller, its open state and collapse timer |

Internal exports live under `JE.internals.activeStreams`. The view depends on the
model. Loading these modules alone starts no requests, observers, or timers. The
entry creates the broadcast controller and disposes it when the feature is torn
down. Session cards use `textContent` for server-provided labels; preserve that
boundary when extending their markup. Existing IDs and classes also support user
CSS and must remain stable.

Broadcast requests explicitly set `skipRetry: true` because repeating a POST would
send a message twice. Visibility remains enforced both by the entry and server
API; only administrators receive broadcast controls. API routes and payloads are
unchanged by this separation.

Run `node --test src/features/active-streams/tests/client/active-streams.test.js` from the repository
root. These checks use controlled session responses and a small DOM substitute to
cover formatting, cards, panel replacement, visibility, stale session responses,
style injection, broadcasts and disposal. Browser/server smoke tests complement
these focused tests.
