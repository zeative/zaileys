#!/usr/bin/env bash
# Deploy docs ke GitHub Pages via branch gh-pages — TANPA GitHub Actions.
# Pakai builder Pages bawaan GitHub (pages-build-deployment) yang tetap jalan
# walau workflow Actions custom gagal (runner:none / billing).
#
# Usage:  cd docs && ./deploy.sh
set -euo pipefail

REPO_SLUG="zeative/zaileys"
BRANCH="gh-pages"
DOCS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DOCS_DIR/.." && pwd)"
WORKTREE="$(mktemp -d -t zaileys-ghp-XXXXXX)"

cleanup() { git -C "$ROOT_DIR" worktree remove "$WORKTREE" --force >/dev/null 2>&1 || true; rm -rf "$WORKTREE"; }
trap cleanup EXIT

echo "▸ Build static export…"
cd "$DOCS_DIR"
npm run build
[ -f out/index.html ] || { echo "✗ out/index.html tidak ada — build gagal"; exit 1; }
touch out/.nojekyll
echo "  ✓ $(find out -name '*.html' | wc -l | tr -d ' ') halaman"

echo "▸ Publish ke branch $BRANCH…"
git -C "$ROOT_DIR" worktree add --detach "$WORKTREE" >/dev/null
cd "$WORKTREE"
git checkout --orphan "$BRANCH" >/dev/null 2>&1
git rm -rf . --quiet >/dev/null 2>&1 || true
cp -R "$DOCS_DIR/out/." .
touch .nojekyll
git add -A
git -c user.email=zaadevofc@gmail.com -c user.name=zeative \
    commit -q -m "deploy: docs site ($(find . -name '*.html' | wc -l | tr -d ' ') pages)"
git push -f origin "$BRANCH"
echo "  ✓ pushed $(git rev-parse --short HEAD)"

echo "▸ Trigger GitHub Pages build…"
gh api --method PUT "repos/$REPO_SLUG/pages" \
  -f build_type=legacy -F "source[branch]=$BRANCH" -F "source[path]=/" >/dev/null 2>&1 || true
gh api --method POST "repos/$REPO_SLUG/pages/builds" >/dev/null

echo "▸ Tunggu build selesai…"
for _ in $(seq 1 20); do
  st="$(gh api "repos/$REPO_SLUG/pages/builds/latest" --jq .status 2>/dev/null || echo '?')"
  [ "$st" = "built" ] && break
  sleep 6
done
echo "  ✓ build status: ${st:-unknown}"

echo "▸ Verifikasi…"
code="$(curl -s -o /dev/null -w '%{http_code}' -L https://zeative.github.io/zaileys/ || echo 000)"
echo "  https://zeative.github.io/zaileys/ → http=$code"
[ "$code" = "200" ] && echo "✅ Live" || { echo "⚠ Belum 200 — cek beberapa menit lagi (propagasi CDN)"; exit 1; }
