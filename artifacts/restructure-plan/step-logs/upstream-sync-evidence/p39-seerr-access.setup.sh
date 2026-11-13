#!/usr/bin/env bash
# p39 setup (upstream 076012a2, #1055), run once on the lab before the three builds; the state lives in Jellyfin's
# database and the mock, so each deploy keeps it. real-viewer gets an Allowed Tags list (je-lab-allowed) and a
# parental limit of 12 without block-unrated; the server's metadata country becomes DE; the Seerr mock answers
# show 990101 with an empty German rating and a US TV-MA, and show 990102 (control) with a German 16. Both carry
# the keyword je-lab-allowed, so the viewer's allow-list passes them.
set -euo pipefail
J=${JE12:?path to je12}
O=$(dirname "$0")
VIEWER=c799f011678d4423bd7c07d24c672de8
# Saved first, and POSTed back (with p39-server-config.saved.json) before the closing smoke.
"$J" api admin GET "/Users/$VIEWER" --full | tail -n +2 | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["Policy"]))' > "$O/p39-viewer-policy.saved.json"
python3 - "$O/p39-viewer-policy.saved.json" > "$O/p39-viewer-policy.staged.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
p.update({"AllowedTags": ["je-lab-allowed"], "MaxParentalRating": 12, "BlockUnratedItems": []})
print(json.dumps(p))
PY
"$J" api admin POST "/Users/$VIEWER/Policy" "@$O/p39-viewer-policy.staged.json" --expect 204
"$J" api admin GET /System/Configuration --full | tail -n +2 > "$O/p39-server-config.saved.json"
python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); c["MetadataCountryCode"]="DE"; print(json.dumps(c))' "$O/p39-server-config.saved.json" > "$O/p39-server-config.staged.json"
"$J" api admin POST /System/Configuration "@$O/p39-server-config.staged.json" --expect 204
"$J" mock seerr rule GET /api/v1/tv/990101 '{"contentRatings":{"results":[{"iso_3166_1":"DE","rating":""},{"iso_3166_1":"US","rating":"TV-MA"}]},"keywords":[{"id":9001,"name":"je-lab-allowed"}]}' --merge
"$J" mock seerr rule GET /api/v1/tv/990102 '{"contentRatings":{"results":[{"iso_3166_1":"DE","rating":"16"},{"iso_3166_1":"US","rating":"TV-14"}]},"keywords":[{"id":9001,"name":"je-lab-allowed"}]}' --merge
