#!/usr/bin/env bash
# Evidence for the port of upstream a10b7eab (fix(tests): make generator scripts and coverage test work on Windows).
# No Windows machine is used. Both faults also show on Linux:
#   1. the generators read and write text in the default encoding: run them with a default that is not UTF-8;
#   2. the coverage test builds a file path from URL.pathname: run it in a checkout whose path has a space.
#
# Usage: p31-windows-tooling.sh <commit> [<commit or checkout to take the port's two generator tests from>]
# Extracts <commit> into a new folder whose name has a space and runs the checks there. With a second argument the
# two test files that hold the port's new tests come from it, so that those tests run on a tree before the port.
# Starts no server and opens no connection. Needs the checkout's node_modules (npm ci) for the config generator.
set -u
repo=$(git rev-parse --show-toplevel)
commit=$1
tests=${2:-}
new_tests=(tests/frontend/features/media-tags/features-tag-runtime-generators.test.mjs
           tests/frontend/admin/config/features-config-flag-check.test.mjs)
coverage=tests/frontend/features/media-tags/features-tag-translation-coverage.test.mjs

holder=$(mktemp -d)
trap 'rm -rf "$holder"' EXIT
work="$holder/je sync check"
mkdir "$work"
git -C "$repo" archive "$commit" | tar -x -C "$work"
ln -s "$repo/node_modules" "$work/node_modules"
if [ -n "$tests" ]; then
  for file in "${new_tests[@]}"; do
    if [ -d "$tests" ]; then cp "$tests/$file" "$work/$file"; else git -C "$repo" show "$tests:$file" > "$work/$file"; fi
  done
fi
cd "$work" || exit 2

echo "tree: $(git -C "$repo" rev-parse --short=8 "$commit")${tests:+, the two generator test files from $([ -d "$tests" ] && echo 'the working tree' || git -C "$repo" rev-parse --short=8 "$tests")}"
echo "folder: <temporary>/$(basename "$work")"
echo "python3 $(python3 -c 'import sys; print(sys.version.split()[0])'), node $(node --version)"

ascii=(env PYTHONUTF8=0 PYTHONCOERCECLOCALE=0 LC_ALL=C LANG=C)
echo
echo "default encoding with ${ascii[*]:1}: $("${ascii[@]}" python3 -c 'import locale; print(locale.getpreferredencoding(False))')"
for script in scripts/generate_genre_labels.py scripts/generate_config_flag_groups.py; do
  echo
  echo "\$ ${ascii[*]:1} python3 $script --check"
  out=$("${ascii[@]}" python3 "$script" --check 2>&1)
  code=$?
  [ -n "$out" ] && printf '%s\n' "$out" | tail -n 1
  echo "exit $code"
done

summary() { grep -E '^(✔|✖|ℹ (tests|pass|fail) )|ENOENT: |UnicodeDecodeError' | sed -E -e "s#$holder#<temporary>#g" -e 's/ \([0-9.]+ms\)$//' | awk '!seen[$0]++'; }
echo
echo "\$ node --test --test-name-pattern 'whatever the default' ${new_tests[*]}"
TZ=UTC LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node --test --test-name-pattern 'whatever the default' "${new_tests[@]}" 2>&1 | summary
echo
echo "\$ node --test $coverage    (in a folder whose name has a space)"
TZ=UTC LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 node --test "$coverage" 2>&1 | summary
