#!/bin/sh
# Ports 75-79: every recording on whatever build the lab runs, into $EV/p75-79.<label>.txt.
#   JE12=<path to je12> EV=<this folder> p75-79-run.sh <label> [before|after]
# With a second argument each pair is also kept for je12 evidence (before:<pair> or after:<pair>).
set -e
label=$1; half=${2:-}
keep() { [ -n "$half" ] && echo "--keep $half:$1" || true; }
out="$EV/p75-79.$label.txt"
: > "$out"
run() { echo "## $1" >> "$out"; shift; echo "\$ je12 $*" | sed "s#$EV/##" >> "$out"; "$JE12" "$@" 2>&1 | grep -v '^URL ' >> "$out"; echo >> "$out"; }
run ratings browse '#/configurationpage?name=Jellyfin%20Enhanced' --script "$EV/p75-ratings.mjs" --wait 2000 $(keep ratings)
run leaving-admin browse '#/configurationpage?name=Jellyfin%20Enhanced' --script "$EV/p76-77-admin.mjs" --wait 2000 $(keep leaving-admin)
echo "## items setup" >> "$out"; python3 "$EV/p76-maintainerr.setup.py" "${TMPDIR:-/tmp}/p76" on >> "$out"; echo >> "$out"
run items browse '#/home' --user viewer --script "$EV/p76-items.mjs" --wait 1500 $(keep items)
echo "## items teardown" >> "$out"; python3 "$EV/p76-maintainerr.setup.py" "${TMPDIR:-/tmp}/p76" off >> "$out"; echo >> "$out"
run search browse '#/home' --script "$EV/p79-search.mjs" --wait 1500 $(keep search)
cat "$out"
