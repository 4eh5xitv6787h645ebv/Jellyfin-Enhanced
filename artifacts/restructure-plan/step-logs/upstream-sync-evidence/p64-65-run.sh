#!/bin/sh
# Ports 64 and 65: the recording on whatever build the lab runs, into $EV/p64-65-*.<label>.txt.
#   JE12=<path to je12> EV=<this folder> p64-65-run.sh <label> [--keep before|after]
set -e
label=$1; shift
python3 "$EV/p64-65-maintainerr.setup.py" "${TMPDIR:-/tmp}/p64-65" > "$EV/p64-65-setup.$label.txt"
"$JE12" browse '#/home' --script "$EV/p64-65-maintainerr-menu.mjs" "$@" 2>&1 | grep -E '^SCRIPT|^kept' > "$EV/p64-65-maintainerr-menu.$label.txt"
{ echo '# Sonarr mock (Maintainerr, Radarr 1, Sonarr 1)'; "$JE12" mock sonarr log 60 | grep -E ' (POST|GET) +[0-9]+ +[a-z:]+ +/api/(v3|settings|collections/media/add)' | sed 's/^[0-9:.TZ-]* //';
  echo '# Radarr mock (Radarr 4K, Sonarr 4K)'; "$JE12" mock radarr log 60 | grep -E ' GET +[0-9]+ +[a-z:]+ +/api/v3/(movie|series)\?' | sed 's/^[0-9:.TZ-]* //'; } > "$EV/p64-65-maintainerr-mock.$label.txt"
wc -c "$EV"/p64-65-*."$label".txt
