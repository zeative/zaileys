#!/usr/bin/env bash
# Scaffold helper: links a prepared dependency set into the run workspace and writes a matching package.json.
# Usage from a case's setup script: source "<path>/deps.sh" <set>   (sets live in deps-list.sh)
set -euo pipefail
_fixtures="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_set="${1:-base}"
_dir="$_fixtures/../../.eval-deps/$_set"
if [ ! -f "$_dir/.ready" ]; then
  echo "dependency set '$_set' is not prepared — run evals/_fixtures/prepare-deps.sh first" >&2
  exit 1
fi
# zaileys is copied so agents can Glob/Grep its types like in a real project (search tools skip symlinked dirs);
# the rest stays symlinked to keep scaffolding fast.
mkdir -p node_modules
for _entry in "$_dir"/node_modules/* "$_dir"/node_modules/.bin; do
  _name="$(basename "$_entry")"
  if [ "$_name" = zaileys ]; then cp -R "$_entry" node_modules/zaileys; else ln -sfn "$_entry" "node_modules/$_name"; fi
done
node -e '
const deps = require(process.argv[1] + "/package.json").dependencies;
require("fs").writeFileSync("package.json", JSON.stringify({ name: "my-bot", private: true, type: "module", dependencies: deps }, null, 2) + "\n");
' "$_dir"
