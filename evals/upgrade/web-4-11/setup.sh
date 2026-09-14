#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -R "$here/project/." .
source "$here/../../_fixtures/deps.sh" base
# The project still declares the version it was written for; node_modules already holds the target release.
sed -i.bak 's/"zaileys": "[^"]*"/"zaileys": "4.11.2"/' package.json && rm package.json.bak
mkdir -p .zaileys/auth/toko.utama && echo '{}' > .zaileys/auth/toko.utama/creds.json
