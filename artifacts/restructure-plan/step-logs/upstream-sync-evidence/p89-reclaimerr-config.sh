#!/bin/sh
# p89-reclaimerr-config.sh on|off: switch Reclaimerr on (an address that does not exist in the lab, a token, no service
# account) or back off in the lab's plugin configuration, through Jellyfin's plugin configuration API.
set -e
J=${JE12:?set JE12}
PLUGIN=f69e946a4b3c4e9a8f0a8d7c1b2c4d9b
TMP=$(mktemp -d)
"$J" api admin GET /Plugins/$PLUGIN/Configuration --json > "$TMP/config.json" 2>/dev/null
python3 - "$1" "$TMP/config.json" <<'PY'
import json, sys
on = sys.argv[1] == 'on'
path = sys.argv[2]
c = json.load(open(path))
c['ReclaimerrEnabled'] = on
c['LeavingSoonMaintainerrEnabled'] = False
c['ReclaimerrUrl'] = 'http://reclaimerr:8000' if on else ''
c['ReclaimerrToken'] = 'lab-token' if on else ''
c['ReclaimerrUsername'] = ''
c['ReclaimerrPassword'] = ''
json.dump(c, open(path, 'w'))
PY
"$J" api admin POST /Plugins/$PLUGIN/Configuration @"$TMP/config.json" --expect 204 | head -1
rm -rf "$TMP"
