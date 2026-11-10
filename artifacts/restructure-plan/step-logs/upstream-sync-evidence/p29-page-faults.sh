#!/bin/bash
# Port 29: what a refresh does when one page of members fails, and when a page comes back without rows.
#   JE12=<path to je12> p29-page-faults.sh        (after p29-maintainerr-paging.setup.py, in the checkout whose lab is up)
# Each fault is a mock rule used once, laid over the setup's rules; every step is the Media Tags tab's Refresh now
# (POST admin/leaving-soon/refresh), whose answer is the status the tab shows. The last refresh has no fault.
refresh() { "$JE12" api admin POST /JellyfinEnhanced/admin/leaving-soon/refresh | tr '\n' ' ' | sed -E 's/"(LastSuccess|LastAttempt|NextRefresh)": [0-9]+(, )?//g; s/, \}/}/'; echo; }
echo "== no fault (971 members: 351 movies in collection 7, 620 episodes in collection 9)"
refresh
echo "== the second page of collection 9 answers HTTP 500 once (its other 500 rows and collection 7 answer as before)"
"$JE12" mock sonarr rule GET '^/api/collections/media/9/content/2\?size=500$' '{"message":"boom"}' --status 500 --times 1 > /dev/null
refresh
echo "== no fault again"
refresh
echo "== the page of collection 7 comes back without rows once ({\"totalSize\":351,\"items\":[]}: Maintainerr could not read their metadata)"
"$JE12" mock sonarr rule GET '^/api/collections/media/7/content/1\?size=500$' '{"totalSize":351,"items":[]}' --times 1 > /dev/null
refresh
echo "== no fault again"
refresh
