#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -R "$here/project/." .
source "$here/../../_fixtures/deps.sh" express
sed -i.bak 's/"zaileys": "[^"]*"/"zaileys": "4.14.1"/' package.json && rm package.json.bak
