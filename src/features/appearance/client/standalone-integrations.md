# Early appearance assets

`splashscreen.js` runs during bootstrap, before normal feature modules and before a signed-in user are available. Its closure owns readiness observation, progress and timeout timers, competing-splash suppression and cleanup. Preserve its public show/hide hooks and early loading contract.

`login-image.js` is loaded by prelogin handling only when enabled by public configuration. Register these dedicated loading reasons in the appearance feature descriptor rather than adding them to the ordinary component sequence.

Letterboxd links belong to [item details](../../item-details/README.md). MDBList display belongs to [ratings](../../ratings/README.md). Their historical `js/others/` public paths do not determine source ownership.
