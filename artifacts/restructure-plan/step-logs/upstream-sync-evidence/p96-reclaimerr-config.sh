#!/bin/sh
# p96-reclaimerr-config.sh on|off <scratch dir>: switch Reclaimerr on for the Leaving soon page (an address that does not
# exist in the lab, a token, no service account, the page and its actions on), or put back the configuration saved by
# `on`, through Jellyfin's plugin configuration API. Like p89-reclaimerr-config.sh; nothing leaves the lab.
set -e
J=${JE12:?set JE12}
PLUGIN=f69e946a4b3c4e9a8f0a8d7c1b2c4d9b
DIR=${2:?scratch dir}
if [ "$1" = on ]; then
  "$J" api admin GET /Plugins/$PLUGIN/Configuration --json > "$DIR/p96-config-saved.json" 2>/dev/null
  python3 - "$DIR/p96-config-saved.json" "$DIR/p96-config-on.json" <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
c['ReclaimerrEnabled'] = True
c['LeavingSoonMaintainerrEnabled'] = False
c['LeavingSoonMaintainerrActions'] = True
c['LeavingSoonPageEnabled'] = True
c['ReclaimerrUrl'] = 'http://reclaimerr:8000'
c['ReclaimerrToken'] = 'lab-token'
c['ReclaimerrUsername'] = ''
c['ReclaimerrPassword'] = ''
json.dump(c, open(sys.argv[2], 'w'))
PY
  "$J" api admin POST /Plugins/$PLUGIN/Configuration @"$DIR/p96-config-on.json" --expect 204 | head -1
else
  "$J" api admin POST /Plugins/$PLUGIN/Configuration @"$DIR/p96-config-saved.json" --expect 204 | head -1
fi
