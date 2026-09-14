# SPEC — Rebuild the zaileys Agent Skill as one evaluation-driven skill

## 1. Objective

The zaileys Agent Skill teaches AI coding assistants to build and run WhatsApp bots with zaileys. The
current suite — four overlapping skills (`zaileys-assist`, `zaileys-scaffold`, `zaileys-debug`,
`zaileys-review`) mirrored into `plugins/zaileys-official/` — is outdated (pre-4.15 behaviour, pinned
versions), competes with itself for triggers, links across skill folders, and has never been measured.
Installed users also never receive updates, because `version: "4.2.0"` is pinned in both manifests.

**Goal:** replace it with **one skill, `zaileys`**, that measurably improves the result of the four jobs a
zaileys user brings — **start a new bot, add a feature to an existing bot, debug and review, upgrade and
deploy** — on both providers (WhatsApp Web and the Cloud API), for the **v4** line.

**Target users:** developers who install it with `/plugin install zaileys-official@zeative` or
`npx skills add zeative/zaileys`, on Claude Code, Codex, Cursor, OpenCode, and other agents that read
Agent Skills; and the agents that load it.

Plan and research: `tasks/plan-skills-rebuild.md` (local). Principles: Anthropic's skill authoring best
practices and the Agent Skills specification.

## 2. Acceptance criteria

1. Exactly one skill exists, `skills/zaileys/`, with `name: zaileys`; the four old skills and
   `plugins/zaileys-official/` are gone.
2. Frontmatter uses spec fields only; the description is third person, states what it does and when, and is
   at most 1,024 characters.
3. `SKILL.md` body is under 500 lines; every other file over 100 lines starts with a table of contents; only
   `SKILL.md` links to other skill files; no `../` links.
4. Every ```ts block and every template type-checks against `src/`; every `*ErrorCode` in `src/` is covered in
   `references/errors.md`; every `zaileys.kejaa.id` link resolves to a real page and anchor.
5. `scripts/doctor.mjs` reports project problems read-only, with `--json`, and makes no network call without
   `--online`.
6. Evals (`claude plugin eval`, with vs without the skill): trigger rate ≥ 90% on should-trigger prompts and
   ≤ 10% on near-misses; every job case scores ≥ 0.8 with the skill, Δ > 0 against no skill, and not below
   the old skills' baseline.
7. The repo root is the plugin (`.claude-plugin/plugin.json`, marketplace `"source": "./"`), with no `version`
   in either manifest, and `claude plugin validate .` passes.
8. `pnpm skill:check` runs in CI on every pull request and push to `main`.
9. The docs page `ai.mdx` and the README describe exactly what ships, including how to remove the old skills.

## 3. Commands

```bash
pnpm skill:check                 # structure, portability, snippet type-check, error codes, links
pnpm test -- skills              # guard and doctor unit tests
claude plugin validate .         # plugin + marketplace manifests
claude plugin eval . --no-publish --model sonnet            # full suite, with vs without the skill
claude plugin eval . --no-publish --tag trigger --runs 1    # quick trigger pass while iterating
```

`claude plugin eval` needs Claude Code ≥ 2.1.269. Always pass `--no-publish`: reports are published to
claude.ai by default.

## 4. Project structure (files touched)

```
skills/zaileys/SKILL.md                    # overview, core facts, job router, verification loop
skills/zaileys/workflows/*.md              # new-bot, add-feature, debug, review, upgrade-and-deploy
skills/zaileys/references/*.md             # one topic each (providers, messaging, receiving, bots, …)
skills/zaileys/assets/templates/{web,cloud}/  # minimal runnable projects
skills/zaileys/scripts/doctor.mjs          # read-only project check
evals/<case>/                              # claude plugin eval suite (results/ gitignored)
scripts/check-skill.mjs                    # the skill guard
tests/skills/**                            # guard + doctor tests and fixtures
.claude-plugin/plugin.json                 # NEW — root is the plugin
.claude-plugin/marketplace.json            # source "./", no version
.github/workflows/skills.yml               # CI guard
docs/ai.mdx, README.md                     # what ships + migration
removed: skills/zaileys-{assist,scaffold,debug,review}/, plugins/zaileys-official/, scripts/sync-skill.mjs
```

## 5. Code style (content style)

- Only what Claude doesn't already know: zaileys APIs, defaults, and failure modes — no general TypeScript or
  WhatsApp tutorials.
- Explain the reason behind a rule instead of ALL-CAPS commands.
- One term per concept, matching the docs: `client`, "WhatsApp Web", "Cloud API".
- Current behaviour in the main text; version history only in `references/migration.md`.
- English content; triggers and evals include Indonesian phrasing.
- Fragile work (project setup, checks) gets exact templates or the doctor script; review and feature work
  follow the user's existing codebase.

## 6. Testing strategy

1. **Guards** (`scripts/check-skill.mjs`, TDD with good/bad fixtures): format, budgets, link depth,
   portability, terminology, snippet and template type-check against `src/`, error-code coverage, docs links.
2. **Doctor tests**: each check has a fixture project that triggers it and one that doesn't.
3. **Evals**: trigger set plus outcome cases per job, baseline first on the old skills and on no skill; result
   graders are regex/file checks where possible, `llm` graders only for short outputs with PASS/FAIL rubrics.
4. **Cross-model**: full suite on Sonnet; spot runs on Haiku and Opus before release.

## 7. Boundaries

- **Always:** target the v4 line; keep frontmatter to spec fields; run `pnpm skill:check` before every commit
  that touches the skill; pass `--no-publish` to every eval run; keep the repo root free of other plugin
  component paths (`.mcp.json`, `agents/`, `commands/`, `hooks/`).
- **Ask first:** pushing to `main`/`v4`, deploying the docs site, publishing an npm release.
- **Never:** invent APIs or behaviour not in `src/`; pin `version` in the plugin manifests; link between skill
  files outside `SKILL.md`; publish eval reports.
