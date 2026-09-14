#!/usr/bin/env bash
# Installs every dependency set once into .eval-deps/<set> at the repo root (outside evals/: eval dirs may not hold symlinks or bulk deps). Run before `claude plugin eval --scaffold`:
# eval runs have no network, so scaffolds only link what this script installed.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$here/deps-list.sh"
while read -r name packages; do
  [ -n "$name" ] || continue
  dir="$here/../../.eval-deps/$name"
  if [ -f "$dir/.ready" ] && [ "$(cat "$dir/.ready")" = "$packages" ]; then echo "✓ $name (cached)"; continue; fi
  rm -rf "$dir" && mkdir -p "$dir"
  printf '{"name":"eval-deps-%s","private":true,"type":"module"}\n' "$name" > "$dir/package.json"
  # shellcheck disable=SC2086
  (cd "$dir" && npm install --no-audit --no-fund --silent $packages)
  printf '%s' "$packages" > "$dir/.ready"
  echo "✓ $name"
done <<< "$DEP_SETS"
