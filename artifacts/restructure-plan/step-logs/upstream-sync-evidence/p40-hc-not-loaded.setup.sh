#!/bin/sh
# Run before each p40-hc-not-loaded.mjs run: real-admin's stored hidden list does not parse; no earlier set-aside copies.
D=/config/plugins/configurations/Jellyfin.Plugin.JellyfinEnhanced/7ef882cd307344279240d0eca8333a9f
docker exec je125ce284 sh -c "rm -f $D/hidden-content.json.corrupt-*; printf '{\"Items\":{\"kept\":' > $D/hidden-content.json; chmod 666 $D/hidden-content.json"

# Run after it: what was set aside and what the file holds now.
D=/config/plugins/configurations/Jellyfin.Plugin.JellyfinEnhanced/7ef882cd307344279240d0eca8333a9f
docker exec je125ce284 sh -c "for f in $D/hidden-content.json.corrupt-*; do echo \"set aside: \$(basename \$f): \$(cat \$f)\"; done; echo \"hidden-content.json now: \$(cat $D/hidden-content.json 2>/dev/null | tr -d ' \n' | head -c 120)\""
