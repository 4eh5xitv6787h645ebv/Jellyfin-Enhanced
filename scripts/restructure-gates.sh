#!/usr/bin/env bash
# Gates for the v12 restructure (artifacts/restructure-plan/PLAN.md "Gates", backend.md §4 "Commands",
# frontend.md §3 gate G). Each gate runs in a `set -e` subshell; the script exits non-zero on the first failure.
#
#   scripts/restructure-gates.sh be              backend B, G, T, F + INV + TOOL
#   scripts/restructure-gates.sh fe              frontend gate G (includes INV and TOOL)
#   scripts/restructure-gates.sh r <pattern>     no stale references: fails if `git grep -nE <pattern>` matches outside artifacts/
#   scripts/restructure-gates.sh h               poster harness builds + gen-resolution-data --check
#   scripts/restructure-gates.sh inv             generate.py --check + route list == baselines/inventory-routes.txt (never regenerates)
#   scripts/restructure-gates.sh tool            python3 tests/run.py tooling + mutation/history path check vs baselines/mutation-check.txt
#   scripts/restructure-gates.sh bundle <out.js> raw bytes of the in-process GET /JellyfinEnhanced/bundle.js; prints nothing on stdout
#
# Run dotnet gates one worktree at a time on the 16 GB worker (PLAN.md "Worktrees and parallelism").
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
BASELINES=artifacts/restructure-plan/baselines
PLUGIN=Jellyfin.Plugin.JellyfinEnhanced/JellyfinEnhanced.csproj
TESTS=tests/backend/JE.Tests.csproj

step() { printf '\n== %s\n' "$*" >&2; }

no_snapshot_updates() {
  if [ -n "${JE_UPDATE_SNAPSHOTS:-}" ]; then
    echo "JE_UPDATE_SNAPSHOTS is set; gates never update snapshots (PLAN.md gate BE). Unset it." >&2
    return 1
  fi
}

# backend.md §4: the mutation/history path check (stdlib only, no dotnet).
mutation_check() { python3 - <<'PY'
import glob, importlib.util, json, re, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location('mutations', 'tests/runner/mutations.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)   # main() is guarded by __name__
defaults = set(re.findall(r"case\.get\('test_file', '([^']+)'\)", Path('tests/runner/mutations.py').read_text()))
cases = [('mutations.py', c) for c in m.CASES]
for f in sorted(glob.glob('tests/history/*-mutations.json')):
    cases += [(f, c) for c in json.load(open(f))]
bad = [f'default test_file missing: {d}' for d in defaults if not Path(d).is_file()]
for src, c in cases:
    if not Path(c['file']).is_file(): bad.append(f"{src}:{c['name']}: file missing {c['file']}"); continue
    if c.get('test_file') and not Path(c['test_file']).is_file(): bad.append(f"{src}:{c['name']}: test_file missing {c['test_file']}")
    n = Path(c['file']).read_text().count(c['before'])
    if n != 1: bad.append(f"{src}:{c['name']}: anchor occurs {n}x in {c['file']}")
print('\n'.join(sorted(bad)))
PY
}

inventory_routes() {
  python3 -c "import json;[print(r['verb'],r['path']) for r in sorted(json.load(open('tests/docs/production-inventory.json'))['routes'],key=lambda r:(r['path'],r['verb']))]"
}

gate_inv() (
  set -e
  step "INV: generate.py --check"
  python3 tests/inventory/generate.py --check
  step "INV: route list vs $BASELINES/inventory-routes.txt"
  inventory_routes | diff - "$BASELINES/inventory-routes.txt"
)

gate_tool() (
  set -e
  step "TOOL: python3 tests/run.py tooling"
  python3 tests/run.py tooling
  step "TOOL: mutation/history path check vs $BASELINES/mutation-check.txt"
  local out new
  out=$(mutation_check)
  new=$(printf '%s\n' "$out" | sed '/^$/d' | LC_ALL=C sort | LC_ALL=C comm -13 "$BASELINES/mutation-check.txt" -)
  if [ -n "$new" ]; then echo "New mutation/history path failures:" >&2; echo "$new"; false; fi
)

gate_be() (
  set -e
  no_snapshot_updates
  step "B: build plugin"
  dotnet build "$PLUGIN" -c Release -p:JellyfinTarget=jf12 --no-restore
  if [ -d tests/backend/Architecture ]; then
    step "G: Architecture gates"
    dotnet test "$TESTS" -c Release --no-restore -p:JellyfinTarget=jf12 --filter "FullyQualifiedName~Architecture"
  else
    step "G: skipped (tests/backend/Architecture does not exist yet; added by backend S0)"
  fi
  step "T: full backend suite"
  dotnet test "$TESTS" -c Release --no-restore -p:JellyfinTarget=jf12
  step "F: frontend + contracts + path readers"
  npm run test:frontend
  npm run test:client-build
  npm run contracts:check
  npm run test:contract-boundary
  npm run verify:rewrite
  npm run inventory:rewrite:check
  gate_inv
  gate_tool
)

gate_fe() (
  set -e
  step "FE G: typecheck, build, inventory"
  npm run client:typecheck
  npm run client:build
  npm run inventory:rewrite
  npm run client:check
  npm run inventory:rewrite:check
  gate_inv
  gate_tool
  step "FE G: client-build tests, bootstrap manifest, npm test"
  npm run test:client-build
  node --test tests/frontend/bootstrap/bootstrap-manifest.test.mjs
  npm test
  step "FE G: component-scripts.json and client/entries output keys vs restructure-base"
  git diff --exit-code restructure-base -- Jellyfin.Plugin.JellyfinEnhanced/js/component-scripts.json
  local f
  for f in client/entries/*.json; do
    diff <(git show "restructure-base:$f" | jq -S keys) <(jq -S keys "$f")
  done
)

gate_r() (
  set -e
  local pattern=$1
  step "R: stale references to /$pattern/"
  # git grep: 0 = matches (stale refs), 1 = none; anything else (e.g. a bad regex) is an error, not a pass.
  local rc=0
  git grep -nE "$pattern" -- . ':!artifacts' || rc=$?
  case $rc in
    1) return 0 ;;
    0) echo "R: stale references found" >&2; return 1 ;;
    *) echo "R: git grep failed (exit $rc)" >&2; return "$rc" ;;
  esac
)

gate_h() (
  set -e
  no_snapshot_updates
  local p
  # Unlike the backend.md loop (`|| break`, which ends the loop with status 0), a failed build fails the gate.
  for p in tests/poster/rendering/PosterTagsHarness.csproj tests/poster/pipeline/PosterTagsPipelineHarness.csproj tests/poster/parity/PosterTagParity/PosterTagParity.csproj; do
    step "H: build $p"
    dotnet build "$p" -c Release -p:JellyfinTarget=jf12
  done
  step "H: gen-resolution-data --check"
  node tests/poster/parity/gen-resolution-data.mjs --check
)

# stdout carries nothing; the dotnet log goes to stderr only on failure.
gate_bundle() (
  set -e
  local out log
  out=$(realpath -m "$1")
  log=$(mktemp)
  trap 'rm -f "$log"' EXIT
  rm -f "$out"
  if ! JE_BUNDLE_OUT="$out" dotnet test "$TESTS" -c Release --no-restore -p:JellyfinTarget=jf12 \
      --filter "FullyQualifiedName=JE.Tests.BundleDump.WritesServedBundleWhenRequested" >"$log" 2>&1; then
    cat "$log" >&2; false
  fi
  if [ ! -s "$out" ]; then
    cat "$log" >&2; echo "bundle: $out was not written (did the BundleDump test run?)" >&2; false
  fi
)

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[ $# -ge 1 ] || usage
cmd=$1; shift
case "$cmd" in
  be|fe|h|inv|tool) [ $# -eq 0 ] || usage; "gate_$cmd" ;;
  r) [ $# -eq 1 ] && [ -n "$1" ] || usage; gate_r "$1" ;;
  bundle) [ $# -eq 1 ] && [ -n "$1" ] || usage; gate_bundle "$1" ;;
  *) usage ;;
esac
echo "restructure-gates: $cmd passed" >&2
