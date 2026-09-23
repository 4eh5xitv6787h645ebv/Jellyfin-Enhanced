# Player features

`playback.js` provides video/session identity, shared translation and track labels,
basic transport shortcuts, and aspect ratio. Other player modules use its private
`JE.internals.player` context. Existing shortcut entry points stay on `JE` so the
keyboard and event dispatchers do not need feature-specific imports.

| Module | Owns |
| --- | --- |
| `frame-step.js` | FPS lookup/cache and frame overlay timers |
| `seek-history.js` | Stable pre-seek position and jump-back guard |
| `segment-skip.js` | Manual segment cache and skip-button fallback |
| `track-menu.js` | Native action-sheet opening/closing and selection memory |
| `track-cycle.js` | Per-kind command queues, item ownership, optimistic server selection |
| `playback-info.js` | Statistics overlay and refresh timer |
| `long-press.js` | Speed-boost gesture state and feedback overlay |
| `auto-skip.js` | Automatic intro/outro segment monitoring |
| `pausescreen.js` | Pause-screen DOM, video observers, interaction listeners, and delayed display |
| `pause-screen-data.js` | Pause-screen credentials, authenticated item/image requests, caches and blob URL disposal |
| `pause-screen-styles.js` | Pause-screen stylesheet injection |
| `subtitles.js` | Subtitle selection preferences |
| `osd-rating.js`, `playback-rating-badge.js` | Rating display in playback surfaces |

Load `playback.js` before the other playback modules and `track-menu.js` before
`track-cycle.js`. Load both `pause-screen-data.js` and `pause-screen-styles.js`
before `pausescreen.js`. The feature descriptor `../feature.json` records named prerequisites;
adding a module here requires its source/dependency entry there.

State stays with the module performing the action. Track commands deliberately
capture item ownership at keypress time and serialize per track type; do not move
their identity checks after queueing. Playback-info refreshes guard overlay
identity across asynchronous session requests, so toggling or leaving playback
cannot start an additional refresh loop. Pause-screen cache invalidation occurs
on video changes, while user changes and destruction also revoke owned blob URLs.
The pause-screen controller owns its fetch cancellation signal; the data object
accepts it when requesting metadata.

Run the behavior tests from the repository root:

```sh
node --test src/features/playback/tests/client/player.test.cjs
```

These use native Node VM contexts and controlled video, DOM, session, and network
substitutes. They cover transport behavior, stream-specific FPS caching,
transcode offsets, asynchronous track ownership, localized native menus, timer
teardown, active-server credentials, and image-cache disposal. Browser checks
remain necessary for Jellyfin's real OSD and video element integration.
