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
#   scripts/restructure-gates.sh bundle-hash <f> prints `<stable sha256> <comment-stripped sha256>` of a bundle file
#   scripts/restructure-gates.sh image           the HOST image tag in baselines/jf12-digest.txt still has the recorded RepoDigest
#
# Pre-existing test failures are ratcheted, not fixed: a dotnet or node test run passes when every failing test is
# listed in baselines/{dotnet,npm}-failures.txt and the total and passed counts are >= baselines/{dotnet,npm}-tests.txt.
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

# Failure ratchet. $1 label, $2 baseline failure list, $3/$4 baseline total/passed, $5 results file
# (`PASS|FAIL|SKIP <id>` lines), $6/$7 observed total/passed. New failures fail; listed tests that pass are a note.
ratchet() {
  local label=$1 list=$2 btotal=$3 bpassed=$4 results=$5 total=$6 passed=$7 rc=0 new gone
  new=$(sed -n 's/^FAIL //p' "$results" | LC_ALL=C sort -u | LC_ALL=C comm -23 - "$list")
  gone=$(sed -n 's/^FAIL //p' "$results" | LC_ALL=C sort -u | LC_ALL=C comm -13 - "$list")
  if [ -n "$new" ]; then
    echo "$label: $(printf '%s\n' "$new" | wc -l) failing test(s) not in $list:" >&2
    printf '  %s\n' "$new" >&2
    rc=1
  fi
  if [ -n "$gone" ]; then
    echo "$label: note: listed in $list but did not fail (now passing, or no longer run; remove it from the list):" >&2
    printf '  %s\n' "$gone" >&2
  fi
  if [ -z "$total" ] || [ -z "$passed" ]; then echo "$label: could not read the test counts" >&2; return 1; fi
  if [ "$total" -lt "$btotal" ]; then echo "$label: total $total < baseline $btotal" >&2; rc=1; fi
  if [ "$passed" -lt "$bpassed" ]; then echo "$label: passed $passed < baseline $bpassed" >&2; rc=1; fi
  echo "$label: total $total (baseline $btotal), passed $passed (baseline $bpassed), failed $(grep -c '^FAIL ' "$results" || true) (baseline list $(wc -l < "$list"))" >&2
  return "$rc"
}

# npm test == npm run test:frontend == node tests/frontend/run.mjs (package.json), so one ratcheted runner serves
# both FE G (`npm test`) and BE F (`npm run test:frontend`). Counts come from the spec reporter's `ℹ tests|pass N` lines.
frontend_tests() {
  local dir rc=0
  dir=$(mktemp -d)
  node tests/frontend/run.mjs --test-reporter=spec --test-reporter-destination=stdout \
    --test-reporter="$ROOT/scripts/restructure-gates-reporter.mjs" --test-reporter-destination="$dir/results" \
    | tee "$dir/out" || rc=$?
  [ -s "$dir/results" ] || { echo "frontend tests: no results written (node exit $rc)" >&2; rm -rf "$dir"; return 1; }
  rc=0
  ratchet "npm test" "$BASELINES/npm-failures.txt" \
    "$(awk '$1=="ℹ" && $2=="tests" {print $3}' "$BASELINES/npm-tests.txt")" \
    "$(awk '$1=="ℹ" && $2=="pass" {print $3}' "$BASELINES/npm-tests.txt")" \
    "$dir/results" "$(awk '$1=="ℹ" && $2=="tests" {print $3}' "$dir/out")" "$(awk '$1=="ℹ" && $2=="pass" {print $3}' "$dir/out")" || rc=$?
  rm -rf "$dir"
  return "$rc"
}

# TRX -> first line `<total> <passed>`, then `PASS|FAIL|SKIP <testName>` per result.
trx_results() { python3 - "$1" <<'PY'
import sys, xml.etree.ElementTree as ET
ns = '{http://microsoft.com/schemas/VisualStudio/TeamTest/2010}'
root = ET.parse(sys.argv[1]).getroot()
c = root.find(f'{ns}ResultSummary/{ns}Counters')
print(c.get('total'), c.get('passed'))
for r in root.iter(f'{ns}UnitTestResult'):
    o = r.get('outcome')
    print('PASS' if o == 'Passed' else 'SKIP' if o == 'NotExecuted' else 'FAIL', r.get('testName'))
PY
}

# Build log -> sorted, de-duplicated `<code> <file relative to repo>` (no line numbers).
build_warnings() { python3 -c '
import os, re, sys
root = os.path.realpath(sys.argv[1]) + os.sep
out = set()
for line in sys.stdin:
    m = re.match(r"\s*(.+?)(?:\(\d+(?:,\d+)*\))?\s*:\s+warning\s+([A-Za-z]+\d+)\s*:", line)
    if m:
        f = m.group(1).strip()
        out.add(f"{m.group(2)} {f[len(root):] if f.startswith(root) else f}")
print("\n".join(sorted(out)))
' "$ROOT" | sed '/^$/d' | LC_ALL=C sort -u
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
  step "B: build plugin (--no-incremental, so every warning is reported) + warnings vs $BASELINES/build-warnings.txt"
  local log res new rc=0
  log=$(mktemp)
  dotnet build "$PLUGIN" -c Release -p:JellyfinTarget=jf12 --no-restore --no-incremental -tl:off | tee "$log"
  new=$(build_warnings <"$log" | LC_ALL=C comm -23 - "$BASELINES/build-warnings.txt")
  rm -f "$log"
  if [ -n "$new" ]; then echo "B: build warnings not in $BASELINES/build-warnings.txt (code file):" >&2; printf '  %s\n' "$new" >&2; false; fi
  if [ -d tests/backend/Architecture ]; then
    step "G: Architecture gates"
    dotnet test "$TESTS" -c Release --no-restore -p:JellyfinTarget=jf12 --filter "FullyQualifiedName~Architecture"
  else
    step "G: skipped (tests/backend/Architecture does not exist yet; added by backend S0)"
  fi
  step "T: full backend suite (failure ratchet vs $BASELINES/dotnet-failures.txt, dotnet-tests.txt)"
  res=$(mktemp -d)
  dotnet test "$TESTS" -c Release --no-restore -p:JellyfinTarget=jf12 \
    --logger "trx;LogFileName=je.trx" --results-directory "$res" --collect:"XPlat Code Coverage" || rc=$?
  [ -s "$res/je.trx" ] || { echo "T: no TRX written (dotnet test exit $rc)" >&2; false; }
  trx_results "$res/je.trx" > "$res/results"
  ratchet "T (dotnet test)" "$BASELINES/dotnet-failures.txt" \
    "$(grep -oE 'Total: *[0-9]+' "$BASELINES/dotnet-tests.txt" | grep -oE '[0-9]+')" \
    "$(grep -oE 'Passed: *[0-9]+' "$BASELINES/dotnet-tests.txt" | grep -oE '[0-9]+')" \
    "$res/results" $(head -1 "$res/results")
  # `npm run verify:rewrite` (scripts/client-verify.mjs) = contracts:check, client:check, inventory:rewrite:check,
  # test:client-build, test:contract-boundary, test:frontend, then `tests/run.py backend` (dotnet test + coverage floors).
  # It stops at the first pre-existing failure, so F runs those parts here instead: test:frontend ratcheted, the dotnet
  # run reused from T, and its coverage floors checked on T's results.
  step "F: verify:rewrite backend part: coverage floors on T's results (tests/runner/coverage.py)"
  python3 tests/runner/coverage.py "$res"
  rm -rf "$res"
  step "F: frontend (ratcheted) + contracts + path readers"
  frontend_tests
  npm run test:client-build
  npm run contracts:check
  npm run test:contract-boundary
  npm run client:check
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
  step "FE G: client-build tests, bootstrap manifest, npm test (ratcheted)"
  npm run test:client-build
  node --test tests/frontend/bootstrap/bootstrap-manifest.test.mjs
  frontend_tests
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

# Stable = without the bundle's own last line, `//# sourceMappingURL=bundle.js.map?v=<version>-<DLL mtime ticks>`, which
# changes on every plugin rebuild (ClientScriptBundle.cs). The ~183 per-module `//# sourceMappingURL=<module>.js.map`
# lines stay. Comment-stripped = stable minus every `// client/src/…` source comment (they are indented).
gate_bundle_hash() (
  set -e
  local map='^//# sourceMappingURL=bundle\.js\.map\?v='
  [ -f "$1" ] || { echo "bundle-hash: $1 not found" >&2; false; }
  [ "$(grep -cE "$map" "$1")" = 1 ] || { echo "bundle-hash: expected exactly one bundle.js.map?v= line in $1" >&2; false; }
  printf '%s %s\n' \
    "$(grep -vE "$map" "$1" | sha256sum | cut -d' ' -f1)" \
    "$(grep -vE "$map|^[[:space:]]*// client/src/" "$1" | sha256sum | cut -d' ' -f1)"
)

# baselines/jf12-digest.txt: `<tag> <RepoDigest>`; HOST runs `je up <name> <port> --image <tag>`.
gate_image() (
  set -e
  local tag digest current
  read -r tag digest < "$BASELINES/jf12-digest.txt"
  current=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$tag")
  if ! grep -qxF "$digest" <<<"$current"; then
    echo "image: $tag is now ${current:-<missing>}, baseline $digest. Restore it with: docker pull $digest && docker tag $digest $tag; never re-record it mid-restructure." >&2
    false
  fi
  echo "image: $tag = $digest" >&2
)

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

[ $# -ge 1 ] || usage
cmd=$1; shift
case "$cmd" in
  be|fe|h|inv|tool) [ $# -eq 0 ] || usage; "gate_$cmd" ;;
  r) [ $# -eq 1 ] && [ -n "$1" ] || usage; gate_r "$1" ;;
  bundle) [ $# -eq 1 ] && [ -n "$1" ] || usage; gate_bundle "$1" ;;
  bundle-hash) [ $# -eq 1 ] && [ -n "$1" ] || usage; gate_bundle_hash "$1"; exit 0 ;;
  image) [ $# -eq 0 ] || usage; gate_image ;;
  *) usage ;;
esac
echo "restructure-gates: $cmd passed" >&2
