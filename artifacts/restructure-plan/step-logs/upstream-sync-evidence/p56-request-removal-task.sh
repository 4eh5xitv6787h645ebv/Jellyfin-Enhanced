#!/usr/bin/env bash
# Parity check for upstream 6916b31b (#1050), the server side, on a je12 lab (mock Seerr):
#   1. the Remove request route: a viewer may not remove the administrator's request (403) and its row says so;
#   2. the scheduled task "Remove watched requests from Seerr": hidden until the setting is on; with it on, the mock
#      lists two approved, available requests for one library movie, one made by real-admin (who has watched it) and
#      one by real-viewer (who has not), and the run deletes the first and keeps the second.
# The setting, the played mark, the stored request and the mock rules are put back at the end.
# Usage: JE12=<path to je12> p56-request-removal-task.sh
set -uo pipefail
J=${JE12:?path to je12}
ADMIN=7ef882cd307344279240d0eca8333a9f
VIEWER=c799f011678d4423bd7c07d24c672de8
MOVIE=0ff8461bed0a2658ec63487586efdbd3   # 101 Dalmatians II: Patch's London Adventure, TMDB 13654
KEY=JellyfinEnhancedAutoRequestRemoval
json() { "$J" api admin GET "$1" --json 2>/dev/null; }
plugin_id() { json /Plugins | python3 -c 'import json,sys; print([p["Id"] for p in json.load(sys.stdin) if "Jellyfin Enhanced" in p["Name"]][0])'; }
set_enabled() {
  local id tmp; id=$(plugin_id); tmp=$(mktemp)
  json "/Plugins/$id/Configuration" | python3 -c 'import json,sys; c=json.load(sys.stdin); c["AutoRequestRemovalEnabled"]=sys.argv[1]=="true"; print(json.dumps(c))' "$1" > "$tmp"
  "$J" api admin POST "/Plugins/$id/Configuration" "@$tmp" --expect 204 | head -1
}
task() { json '/ScheduledTasks' | python3 -c 'import json,sys; t=[t for t in json.load(sys.stdin) if t["Key"]==sys.argv[1]][0]; print(json.dumps({k: t.get(k) for k in sys.argv[2:]}))' "$KEY" "$@"; }
shown() { json '/ScheduledTasks?isHidden=false' | python3 -c 'import json,sys; print(any(t["Key"]==sys.argv[1] for t in json.load(sys.stdin)))' "$KEY"; }

echo "== 1. the Remove request route =="
"$J" mock reset > /dev/null
"$J" api admin POST '/JellyfinEnhanced/jellyseerr/request' '{"mediaType":"movie","mediaId":990001}' | head -1
echo "administrator's row:"; "$J" api admin GET '/JellyfinEnhanced/arr/requests?take=5' --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print([{k: r.get(k) for k in ("id","title","requestedBy","canRemove")} for r in d["requests"]], "canApproveRequests", d.get("canApproveRequests"))'
echo "viewer's rows:"; "$J" api viewer GET '/JellyfinEnhanced/arr/requests?take=5' --json 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print([{k: r.get(k) for k in ("id","title","requestedBy","canRemove")} for r in d["requests"]], "canApproveRequests", d.get("canApproveRequests"))'
echo "viewer removes the administrator's request:"; "$J" api viewer DELETE '/JellyfinEnhanced/arr/requests/1' --expect 403 | head -2
echo "Seerr saw (no DELETE):"; "$J" mock seerr log 6 | grep -E ' (GET|DELETE) .*/api/v1/request/' | sed -E 's/^[0-9:Z]+ //'
echo "administrator removes it:"; "$J" api admin DELETE '/JellyfinEnhanced/arr/requests/1' | head -2
echo "Seerr saw:"; "$J" mock seerr log 4 | grep -E ' (GET|DELETE) .*/api/v1/request/' | sed -E 's/^[0-9:Z]+ //'

echo "== 2. the scheduled task =="
task Name Category IsHidden Description
echo "listed among the visible tasks while the setting is off: $(shown)"
set_enabled true
sleep 2
echo "listed among the visible tasks with the setting on: $(shown)"
"$J" api admin POST "/UserPlayedItems/$MOVIE?userId=$ADMIN" --expect 200 | head -1
"$J" mock seerr rule GET '^/api/v1/request\?take=100' '{"pageInfo":{"results":2},"results":[{"id":4242,"type":"movie","status":2,"is4k":false,"media":{"tmdbId":13654,"status":5},"requestedBy":{"id":1,"jellyfinUserId":"'$ADMIN'"}},{"id":4243,"type":"movie","status":2,"is4k":false,"media":{"tmdbId":13654,"status":5},"requestedBy":{"id":2,"jellyfinUserId":"'$VIEWER'"}}]}' > /dev/null
TASK_ID=$(json '/ScheduledTasks' | python3 -c 'import json,sys; print([t["Id"] for t in json.load(sys.stdin) if t["Key"]==sys.argv[1]][0])' "$KEY")
"$J" api admin POST "/ScheduledTasks/Running/$TASK_ID" --expect 204 | head -1
for _ in $(seq 1 40); do sleep 1; [ "$(task State | python3 -c 'import json,sys; print(json.load(sys.stdin)["State"])')" = Idle ] && break; done
json '/ScheduledTasks' | python3 -c 'import json,sys; t=[t for t in json.load(sys.stdin) if t["Key"]==sys.argv[1]][0]; print("run result:", (t.get("LastExecutionResult") or {}).get("Status"))' "$KEY"
echo "Seerr saw during the run:"; "$J" mock seerr log 6 | grep -E " (GET|DELETE) .*/api/v1/request" | sed -E "s/^[0-9:Z]+ //" | tail -2

echo "== put back =="
"$J" api admin DELETE "/UserPlayedItems/$MOVIE?userId=$ADMIN" --expect 200 | head -1
set_enabled false
"$J" mock reset > /dev/null
echo "listed among the visible tasks after turning the setting off: $(shown)"
