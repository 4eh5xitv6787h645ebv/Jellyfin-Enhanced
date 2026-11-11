#!/usr/bin/env bash
# Port 30: the Activity Feed read as each lab user, on the build the lab has now.
#   JE12=<path to je12> artifacts/restructure-plan/step-logs/upstream-sync-evidence/p30-activity-versions.read.sh > <file>
# Run from the checkout after p30-activity-versions.setup.mjs. Prints the deployed build, then per user the command
# and the script's SCRIPT line (and any failure line). real-admin is an administrator; real-viewer and lab-viewer2
# are plain users; lab-kid has a parental limit (up to PG, unrated blocked); lab-guest has the Movies library only.
set -u
here=$(cd "$(dirname "$0")" && pwd)
"$JE12" status 2>&1 | sed -n 1p | sed -E 's#; screenshots go to .*##'
for user in admin viewer lab-viewer2 lab-kid lab-guest; do
  echo "\$ je12 browse '#/home' --user $user --script artifacts/restructure-plan/step-logs/upstream-sync-evidence/p30-activity-versions.mjs"
  "$JE12" browse '#/home' --user "$user" --script "$here/p30-activity-versions.mjs" 2>&1 | grep -E '^SCRIPT|FAILED|^next:|PAGEERROR'
done
