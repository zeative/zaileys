#!/usr/bin/env bash
# Copies the plugin as users receive it (tracked and new files, no node_modules or ignored files) into <dest>,
# so `claude plugin eval <dest>` runs on a clean tree; evaluating the repo root directly fails with E2BIG.
# Usage: evals/_tools/stage-plugin.sh <dest>
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
dest="${1:?usage: stage-plugin.sh <dest>}"
rm -rf "$dest" && mkdir -p "$dest"
(cd "$root" && git ls-files -co --exclude-standard -z | rsync -a --from0 --files-from=- ./ "$dest/")
# Scaffold scripts resolve prepared dependencies relative to the plugin root.
[ -d "$root/.eval-deps" ] && ln -sfn "$root/.eval-deps" "$dest/.eval-deps"
echo "staged $(cd "$dest" && find . -type f | wc -l | tr -d ' ') files in $dest"
