#!/bin/sh
# Port 44: the three recordings on whatever build the lab runs, into $EV/p44-*.<label>.txt.
#   p44-run.sh <label> [--keep before|after]
set -e
label=$1; shift
EV=<worker path>
python3 $EV/p44-maintainerr.setup.py $EV/tmp on > $EV/p44-setup.$label.txt
sleep 65   # the home row's service looks again within a minute of the source being set
$JE12 browse '#/home' --script $EV/p44-maintainerr-menu.mjs "$@" 2>&1 | grep -E '^SCRIPT|^kept' > $EV/p44-maintainerr-menu.$label.txt
$JE12 mock sonarr log 40 | grep -E ' (POST|GET) .*/api/collections' | sed 's/^[0-9:]*Z //' | uniq -c > $EV/p44-maintainerr-mock.$label.txt
$JE12 browse '#/home' --script $EV/p44-maintainerr-menu.mjs --user viewer 2>&1 | grep -E '^SCRIPT' > $EV/p44-maintainerr-menu-viewer.$label.txt
$JE12 api viewer GET /JellyfinEnhanced/maintainerr/item/06de48d758074756c732c7de70aa79f8 --expect 403 >> $EV/p44-maintainerr-menu-viewer.$label.txt 2>&1 || true
$JE12 api viewer POST /JellyfinEnhanced/maintainerr/mark '{"itemId":"06de48d758074756c732c7de70aa79f8"}' --expect 403 >> $EV/p44-maintainerr-menu-viewer.$label.txt 2>&1 || true
$JE12 browse '#/home' --script $EV/p44-maintainerr-settings.mjs 2>&1 | grep -E '^SCRIPT' > $EV/p44-maintainerr-settings.$label.txt
wc -c $EV/p44-*.$label.txt
