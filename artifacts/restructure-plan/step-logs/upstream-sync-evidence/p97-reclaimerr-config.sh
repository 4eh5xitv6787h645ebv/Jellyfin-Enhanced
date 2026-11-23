#!/bin/sh
# p97-reclaimerr-config.sh on|off <scratch dir>: switch Reclaimerr on for the Leaving soon page (an address that does not
# exist in the lab, a token, the page and its actions on), or put back the configuration saved by `on`, through Jellyfin's
# plugin configuration API. Like p96-reclaimerr-config.sh, without the service account fields; nothing leaves the lab.
set -e
J=${JE12:?set JE12}
PLUGIN=f69e946a4b3c4e9a8f0a8d7c1b2c4d9b
DIR=${2:?scratch dir}
if [ "$1" = on ]; then
  "$J" api admin GET /Plugins/$PLUGIN/Configuration --json > "$DIR/p97-config-saved.json" 2>/dev/null
  python3 "$(dirname "$0")/p97-reclaimerr-config.py" "$DIR/p97-config-saved.json" "$DIR/p97-config-on.json"
  "$J" api admin POST /Plugins/$PLUGIN/Configuration @"$DIR/p97-config-on.json" --expect 204 | head -1
else
  "$J" api admin POST /Plugins/$PLUGIN/Configuration @"$DIR/p97-config-saved.json" --expect 204 | head -1
fi
