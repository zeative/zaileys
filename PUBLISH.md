# Publishing Zaileys

The runbook for shipping a release: npm package, GitHub (`main`, `v4`, tag), and the docs site. It records how releases
are actually cut today (4.16.0 and 4.17.0 were shipped exactly this way).

Written for maintainers and for AI agents asked to "publish", "release", "rilis", or "deploy docs".

## Contents

- 0. Ground rules
- 1. What "publish" covers
- 2. Preflight
- 3. Decide the version
- 4. Write the release notes
- 5. Publish to npm
- 6. Commit, tag, and push
- 7. Deploy the docs
- 8. Verify
- 9. Troubleshooting

---

## 0. Ground rules

- **Only publish when the maintainer asks.** Publishing to npm is permanent: a version number can never be reused.
  Pushing and deploying are outward-facing too. If a tool or policy blocks a push or deploy, stop and tell the
  maintainer the exact commands; never work around the block.
- **Ask before a major version.** The skill and docs target the v4 line. If the computed bump is `major`, stop and ask
  (see step 3).
- **Secrets stay secret.** The npm token lives in `.env` (gitignored) as `NPM_TOKEN`. Never print it, paste it into a
  command, commit it, or write it into a file other than the temporary npm config in step 5.
- **Work on `main`.** `v4` mirrors `main`. Always push both together (`git push origin main main:v4`), after checking
  that `v4` has no commits of its own.
- **Commit messages:** English, Conventional Commits, one line, no AI attribution (see `RULES.md` section 15).

## 1. What "publish" covers

| Part | Where it goes | How |
| --- | --- | --- |
| npm package `zaileys` | registry.npmjs.org, dist-tag `latest` | `npm publish` from this machine with `NPM_TOKEN` (step 5) |
| Git | `origin/main`, `origin/v4`, tag `zaileys@X.Y.Z` | `git push` (step 6) |
| Docs | https://zaileys.kejaa.id (Vercel project `zaileys-docs`) | static export deployed with the Vercel CLI (step 7) |
| Agent Skill / Claude Code plugin | installed straight from the GitHub repo | nothing to do: the plugin has no `version`, so every pushed commit reaches users |

Not used: GitHub Releases and `.github/workflows/release.yml` (it only triggers on `v*` tags; our tags are
`zaileys@X.Y.Z`), `pnpm changeset version`, and publishing from CI.

## 2. Preflight

```bash
git status --short                      # clean, except files the maintainer knows about
git fetch origin
git rev-list --left-right --count main...origin/main   # right number must be 0 (nothing to pull)
git rev-list --count main..origin/v4                   # must be 0 (v4 has no commits of its own)
```

If `origin/main` has commits you don't have, pull them first and re-run everything below on the result.

Run every quality gate on the exact tree you will publish:

```bash
pnpm typecheck
pnpm audit:comments
pnpm audit:any src
pnpm exec vitest run          # full suite; known flaky tests are listed in section 9
pnpm build
pnpm size                     # 260 KB budget per bundle
pnpm skill:check
pnpm docs:check
pnpm docs:errors:check
pnpm docs:templates:check
pnpm docs:search && pnpm docs:search:check
```

A red gate is fixed, never skipped. If one test fails once, re-run it alone; if it passes, note it as flaky and run
the full suite again before publishing.

## 3. Decide the version

```bash
node scripts/release.mjs --dry-run
```

The script reads commit subjects since the last `zaileys@*` tag: `feat` → minor, `fix`/`perf` → patch, `!` or
`BREAKING CHANGE` → major. `chore`, `docs`, `test`, `ci` don't bump.

- **Read the computed bump before doing anything.** A `feat!` commit anywhere since the last tag forces a major, even if
  a later commit undid the break. That happened before 4.16.0: the script said 5.0.0 while the real change was a
  minor redesign of an experimental API. The maintainer chose 4.16.0.
- **Major bumps need the maintainer's decision**, with the reason (what breaks, for whom).
- **No feat/fix/perf since the last tag** means there is no npm release; only deploy the docs if they changed.
- The dry run's changelog lists commit subjects as-is, including skill and docs commits. Use it as input, not as the
  final text (step 4).

## 4. Write the release notes

Do this in a commit **before** publishing (`docs: add the X.Y.Z release notes and current version`). Keep
`CHANGELOG.md` for the release commit in step 6.

1. **`CHANGELOG.md`** (repo root): add `## X.Y.Z` under `# zaileys`, with `### Minor Changes` / `### Patch Changes`
   (and a clearly labelled section for anything that can break a working bot). Write what changed for users; drop
   docs/skill-only commits.
2. **`docs/releases/changelog.mdx`**: add `<Update label="vX.Y.Z">` at the top, with **Check before upgrading** (breaks
   or behaviour changes), **Changed**, **Added**, **Fixed**, and links to the guides. Match the existing entries.
3. **`docs/releases/versioning.mdx`**: replace the current version everywhere it is used as "current" (the example
   version, the `v4 — current` row, the `^X.Y.Z` examples, the no-backports example). If the release can break a
   working bot, update the "minor releases have carried changes that can break a working bot" paragraph.
4. **`skills/zaileys/references/migration.md`**: add an entry under "Changes within v4" for every removed/renamed
   export or behaviour change, with what breaks, a grep pattern, and the fix. Replace any "Unreleased on main" label
   with the version.
5. **`.changeset/`**: delete the changesets this release ships (keep `config.json` and `README.md`).
6. Run `pnpm skill:check`, `pnpm docs:check docs/releases`, and `pnpm docs:search && pnpm docs:search:check`.

## 5. Publish to npm

The npm account has 2FA, so a plain `npm publish` from a non-interactive shell fails with `EOTP`. Publish with the
automation token from `.env` through a temporary npm config that references the variable — the token value never
appears in a command, a log, or the repo.

```bash
# Version and build (package.json only; CHANGELOG.md was edited in step 4)
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.version="X.Y.Z";fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
pnpm build

# Publish with NPM_TOKEN from .env
export NPM_TOKEN="$(grep '^NPM_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')"
NPMRC="$(mktemp)"
printf '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n' > "$NPMRC"   # single quotes: npm expands ${NPM_TOKEN} itself
npm whoami --userconfig "$NPMRC"                                      # expect the maintainer's npm user
npm publish --userconfig "$NPMRC"
rm -f "$NPMRC"; unset NPM_TOKEN
```

- `npm publish` runs `prepublishOnly` (`pnpm run build`) again; that's fine.
- Expect `+ zaileys@X.Y.Z`. The registry can take a minute or two before `latest` shows the new version:
  `curl -s https://registry.npmjs.org/zaileys | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d)["dist-tags"].latest))'`.
- If publishing fails after the version bump, do not commit or tag. Fix the cause and publish the same version again.

`scripts/release.mjs` (without `--dry-run`) does steps 5–6 in one go: it bumps, writes the changelog from commit subjects,
builds, runs `npm publish`, commits with `--no-verify`, tags, and pushes the branch and `main` — but **not `v4`**, and it
uses a plain `npm publish` that needs the token config above. Prefer the manual steps: they keep curated release notes
and push `v4`. If the script dies halfway, restore `package.json` and `CHANGELOG.md` (`git checkout -- package.json
CHANGELOG.md`) before trying again, or it bumps twice.

## 6. Commit, tag, and push

```bash
git commit -m "chore: release vX.Y.Z" -- package.json CHANGELOG.md
git tag zaileys@X.Y.Z
git fetch origin && git rev-list --count main..origin/v4      # still 0
git push origin main main:v4
git push origin zaileys@X.Y.Z
```

The pre-commit hook runs typecheck, audits, and tests; let it run.

## 7. Deploy the docs

Deploy whenever `docs/` changed, and after every npm release (the changelog and versioning pages changed).

The static build exports the Mintlify site and adds everything the export lacks: search index, anchors check,
`llms.txt`/`llms-full.txt`, per-page `.md`, 404 page, Open Graph images, canonical URLs, JSON-LD, `sitemap.xml`,
`robots.txt`, and `vercel.json`. It needs dependencies installed (`pnpm install`).

```bash
node docs/scripts/build-static.mjs            # writes docs-dist/ (gitignored); takes a few minutes
```

- Pass an output path only as a **relative** path (e.g. `docs-dist`). An absolute path is joined onto the repo root and
  lands in a stray folder inside the repo.
- The build must end with `✓ static site ready in docs-dist`. Every check inside it (error codes, templates, search
  ranking, anchors, SEO) must print ✓.

Deploy with the Vercel CLI (the maintainer is logged in on this machine):

```bash
cd docs-dist
test -f .vercel/project.json || npx -y vercel@latest link --yes --project zaileys-docs --scope zaadevofc-d232dd6e
grep -o '"projectName":"[^"]*"' .vercel/project.json     # must say zaileys-docs
rm -f .env.local                                         # `vercel link` pulls project env here; it must not be uploaded
npx -y vercel@latest deploy --prod --yes --scope zaadevofc-d232dd6e
cd ..
```

- Expect `Aliased https://zaileys.kejaa.id` and `readyState: READY`.
- Always check `projectName` first. If the folder isn't linked, `vercel deploy` silently creates a new project named
  `docs-dist`. If that happens, remove it (`echo y | npx -y vercel@latest project rm docs-dist --scope zaadevofc-d232dd6e`) and redeploy to
  `zaileys-docs`.
- Use scope `zaadevofc-d232dd6e`; the scope `zaadevofcs-projects` returns 402.
- The **Deploy Docs** GitHub workflow builds and checks the site on every push that touches `docs/`, but its Vercel
  step is skipped until a `VERCEL_TOKEN` secret (plus `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) is added to the repo. Until
  then, the CLI deploy above is the real deploy.

## 8. Verify

```bash
# npm
npm view zaileys dist-tags.latest

# Git and CI (all green: CI on main and v4, Skill, Deploy Docs)
gh run list --limit 8

# Docs (expect 200, the new version in the changelog, and no .env.local)
curl -s -o /dev/null -w '%{http_code}\n' https://zaileys.kejaa.id/
curl -s https://zaileys.kejaa.id/releases/changelog.md | grep -c 'vX.Y.Z'
curl -s -o /dev/null -w '%{http_code}\n' https://zaileys.kejaa.id/.env.local     # 404
curl -s -o /dev/null -w '%{http_code}\n' https://zaileys.kejaa.id/sitemap.xml    # 200
```

Report to the maintainer: the published version, the commits and tag pushed, the docs deploy URL, CI results (including
any flaky rerun), and anything left open.

## 9. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm publish` fails with `EOTP` | 2FA account, no token config | Publish with the temporary npm config in step 5 |
| `npm whoami` fails with 401 | `NPM_TOKEN` missing, expired, or has quotes/CR from `.env` | Check the key exists in `.env` (don't print the value); ask the maintainer for a new automation token |
| Dry run says a major version | A `feat!` or `BREAKING CHANGE` commit since the last tag | Stop and ask the maintainer (step 3) |
| npm `latest` still shows the old version | Registry propagation | Wait a minute or two, then check `https://registry.npmjs.org/zaileys/X.Y.Z` |
| Every GitHub Actions job fails in seconds | Account billing lock, or an Actions setup error | `gh run view <id>` shows the annotation. A billing lock is fixed at github.com/settings/billing. `Multiple versions of pnpm specified` means a workflow sets `version:` for `pnpm/action-setup` while `package.json` has `packageManager`; remove `version:` |
| `tests/e2e/session-lifecycle.e2e.test.ts` fails "credentials on disk stay owner-only" (0644 vs 0600) | Known flaky in CI | Rerun the failed job; report it (session security, RULES section 7) |
| `tests/store/postgres-message-store.test.ts` E1 fails on real Postgres | Known flaky in CI | Rerun the failed job |
| `vercel deploy` created a project called `docs-dist` | `docs-dist` wasn't linked | Remove that project, link to `zaileys-docs`, redeploy (step 7) |
| Docs build fails at `templates: out of date` | A template source changed without regenerating | `pnpm docs:templates`, commit, rebuild |
| Docs build output appears in a `private/…` folder inside the repo | An absolute path was passed to `build-static.mjs` | Delete that folder; pass a relative path |
| A push or deploy is refused by a tool policy | The environment requires explicit approval | Stop, tell the maintainer the exact command, and wait |
