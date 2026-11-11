#!/bin/bash
# Port 32 (upstream 8fe1e705): what a refresh does when a page address answers JSON that is not a page.
#   JE12=<path to je12> p32-not-a-page.sh <scratch dir>        (in the checkout whose lab is up)
# Part 1: a source without the paged route (every page address answers the collections list again).
# Part 2: a source that pages, with one page answered by the list once: first a later page, then a first page.
# Every step is the Media Tags tab's Refresh now (POST admin/leaving-soon/refresh), whose answer is the status the
# tab shows. Each fault is a mock rule used once, laid over the setup's rules. The source is removed at the end.
set -u
here=$(cd "$(dirname "$0")" && pwd)
scratch=$1
refresh() { "$JE12" api admin POST /JellyfinEnhanced/admin/leaving-soon/refresh | tr '\n' ' ' | sed -E 's/"(LastSuccess|LastAttempt|NextRefresh)": [0-9]+(, )?//g; s/, \}/}/'; echo; }
asked() { "$JE12" mock sonarr log 40 | awk -v since="$1" '$1 >= since && /\/api\/collections/ { print "   asked: " $2, $3, $5 }'; }

echo "== part 1: a source without the paged route: every address under /api/collections/media/ answers the list again"
python3 "$here/p32-not-a-page.setup.py" "$scratch" list-only
sleep 3   # the source change reads the source once by itself
since=$(date -u +%H:%M:%SZ)
refresh
asked "$since"

echo "== part 2: a source that pages (971 members: 351 movies in collection 7, 620 episodes in collection 9)"
python3 "$here/p32-not-a-page.setup.py" "$scratch" paged
sleep 3
refresh
echo "== the second page of collection 9 answers the collections list once (its first page and collection 7 answer as before)"
"$JE12" mock sonarr rule GET '^/api/collections/media/9/content/2\?size=500$' "@$scratch/p32-list.json" --times 1 > /dev/null
refresh
echo "== no fault again"
refresh
echo "== the first page of collection 7 answers the collections list once"
"$JE12" mock sonarr rule GET '^/api/collections/media/7/content/1\?size=500$' "@$scratch/p32-list.json" --times 1 > /dev/null
refresh
echo "== no fault again"
refresh
echo "== the source and the mock's rules are removed"
python3 "$here/p32-not-a-page.setup.py" "$scratch" off
