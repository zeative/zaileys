# Contributing to Zaileys

Thanks for helping improve Zaileys! This guide covers local setup, the test and quality
gates, commit conventions, and how releases are cut.

## Prerequisites

- **Node.js** `>=20`
- **pnpm** `10` (the repo pins `pnpm@10.24.0` via `packageManager`)

This project uses pnpm exclusively — do not use `npm install` or `yarn` for development.

## Setup

```bash
git clone https://github.com/zeative/zaileys.git
cd zaileys
pnpm install
```

All current v4 work happens on the **`v4`** branch (the v4 rewrite is isolated from
`main`, which carries production v3.3.0). Branch off `v4` for your changes:

```bash
git switch v4
git switch -c feat/my-change
```

## Commands

| Command                 | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `pnpm build`            | Build dual ESM/CJS bundles + `.d.ts` via tsup                 |
| `pnpm typecheck`        | Type-check with the native TypeScript 7 compiler (`tsgo`)     |
| `pnpm typecheck:legacy` | Type-check with the classic `tsc` (fallback)                  |
| `pnpm test`             | Run the full vitest suite once                                |
| `pnpm test:watch`       | Run vitest in watch mode                                      |
| `pnpm audit:comments`   | Enforce the zero-comment policy (see below)                   |
| `pnpm audit:any`        | Enforce the no-`any` policy                                   |
| `pnpm size`             | Check bundle size budgets via size-limit                      |

Run `pnpm test`, `pnpm typecheck`, `pnpm audit:comments`, and `pnpm audit:any` before
opening a PR — these gates also run in CI.

## Tests

Tests live in `tests/` and run on **vitest**. Aim for coverage of any code you touch;
the project targets **≥80% coverage** overall.

```bash
pnpm test                          # all unit + integration tests
pnpm vitest run tests/builder      # a single directory
```

### E2E suite (opt-in)

End-to-end tests talk to a real WhatsApp test account and are **gated behind an environment
variable** so they never run by accident in CI or local default runs:

```bash
ZAILEYS_E2E=1 pnpm test
```

Only enable this when you have a dedicated test account configured.

## Code style — zero-comment policy (HARD RULE)

The codebase is **comment-free** by design. This is enforced by `pnpm audit:comments` and
will fail CI if violated.

- ❌ No inline comments (`// ...`), block comments (`/* ... */`), or HTML comments
  (`<!-- ... -->`) inside source files.
- ❌ No AI-generic narration (e.g. `// this function does X`).
- ✅ The **only** allowed comments are **TSDoc/JSDoc** on the **public API** (the `Client`,
  its public methods, and exported types) — terse, not padding.
- If you feel the urge to write `// because X`, rename a variable or restructure the code so
  that X is obvious from the names instead.

Markdown files (like this one) and code fences inside docs are exempt — the rule applies to
TypeScript source only.

The no-`any` policy (`pnpm audit:any`) similarly forbids `any` annotations and casts; use
`unknown` with narrowing, or proper generics.

## Commit convention

Commits follow **[Conventional Commits](https://www.conventionalcommits.org/)** and are
enforced by commitlint (via a husky `commit-msg` hook).

```
<type>(<scope>): <subject>
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`, `style`. Example:

```
feat(builder): add album() chaining for media groups
```

> **Do not add AI attribution.** Commit messages and PR descriptions must not contain
> `Co-Authored-By: Claude`, "Generated with …", or any similar AI signature.

## Changesets

Every PR that changes published behavior must include a **changeset** (enforced by
`.github/workflows/changeset-check.yml`):

```bash
pnpm changeset          # choose bump (patch / minor / major) + describe the change
```

Docs-only or chore PRs may either add the `no-changeset` label or run
`pnpm changeset --empty`.

## Pull requests

1. Branch off `v4`.
2. Make your change with tests.
3. Run `pnpm test`, `pnpm typecheck`, `pnpm audit:comments`, `pnpm audit:any`.
4. Add a changeset (or `--empty` / `no-changeset` label for docs/chore).
5. Open the PR against `v4`. CI runs lint, typecheck, tests, build, and bundle-size checks.

## Releases & npm publishing

Releases ship as **GitHub Releases**. Publishing to **npm is a deliberate manual step**
performed by the maintainer — it is intentionally **not** automated and no `NPM_TOKEN`
lives in CI.

The short version (full runbook in [RELEASE.md](./RELEASE.md)):

```bash
pnpm changeset version       # apply version bump + update CHANGELOG
pnpm install
git commit -am "chore(release): version packages"
git tag vX.Y.Z               # triggers the GitHub Release workflow
git push --tags

# Then, manually, the maintainer publishes to npm locally:
pnpm build
npm publish
```

See [RELEASE.md](./RELEASE.md) for the complete release process, changeset base-branch
handling, and the rationale behind manual npm publishing.

## Reporting issues

Open an [issue](https://github.com/zeative/zaileys/issues) for bugs and feature requests.
For **security vulnerabilities**, follow the disclosure process in
[SECURITY.md](./SECURITY.md) instead of opening a public issue.
