# AI Skill

> Source: https://zeative.github.io/zaileys/skill

# AI Skill

Zaileys ships an **official Agent Skill** that turns your AI assistant into a zaileys expert.
Instead of guessing the API, your assistant gets the verified surface, copy-paste recipes,
error diagnostics, and a list of anti-patterns to avoid — so it implements best practices and
fixes problems by symptom → cause → fix.

The skill lives in the zaileys repo itself (`skills/zaileys/`), so installing is just pointing
your tool at `zeative/zaileys`. No separate package.

## Install

Native Claude Code plugin — supports auto-update when the repo changes.

```bash
/plugin marketplace add zeative/zaileys
/plugin install zaileys-official@zeative
```

Update later with `/plugin marketplace update zeative/zaileys`. Commands are namespaced as `/zaileys-official:<skill>`.

[`npx skills`](https://github.com/vercel-labs/skills) works across Claude Code, Codex, Cursor,
and OpenCode.

```bash
npx skills add zeative/zaileys        # into the current project (.claude/skills/)
npx skills add zeative/zaileys -g     # global (~/.claude/skills/)
```

Both methods install the **same** skill suite — pick whichever fits your tool.

## The suite

One orchestrator that auto-routes, plus three focused skills:

| Skill | Plugin command | npx command | Does |
| ----- | -------------- | ----------- | ---- |
| **zaileys-assist** | `/zaileys-official:zaileys-assist` | `/zaileys-assist` | Orchestrator — auto-detects intent (build / debug / review / explain) so you don't pick a command |
| **zaileys-scaffold** | `/zaileys-official:zaileys-scaffold` | `/zaileys-scaffold` | Generate a complete, runnable bot from a short spec (auth, storage, features) |
| **zaileys-debug** | `/zaileys-official:zaileys-debug` | `/zaileys-debug` | Paste an error/symptom → error class + `.code` or runtime cause → concrete fix |
| **zaileys-review** | `/zaileys-official:zaileys-review` | `/zaileys-review` | Audit code against best practices, anti-patterns, and ban-safety |

You usually don't need to pick a command — `zaileys-assist` has a broad trigger and auto-activates on any
zaileys task, then routes internally. Use the focused commands when you want a specific job.

## What you get

After installing, your AI assistant can:

- **Implement with best practices** — typed events (including the `message` umbrella event), the fluent send builder, interactive messages, AIRich, commands, broadcast, and the right storage adapter for your runtime.
- **Use the full v4.4 surface** — new send methods (`videoNote`, `event`, `groupInvite`, `product`, `requestPhoneNumber`, `sharePhoneNumber`, `limitSharing`), message helpers (`client.pin`/`unpin`/`setDisappearing`), new domain modules (`client.profile`/`chat`/`contact`/`business`), new `chatType`s (`album`, `group-invite`, `product`, `order`, `payment`), and the matching `ctx.media` variants.
- **Diagnose errors precisely** — identify the error class and `.code`, what it means, and how to fix it.
- **Catch anti-patterns** — flag tight send loops, missing `await` on keys, raw-JID owner checks, wrong `expiresAt` units, and more during review.
- **Stay accurate** — every reference is grounded in the zaileys source, so the assistant won't invent methods or options.

## What's inside

Each focused skill is a self-contained `SKILL.md`. The **zaileys-assist** orchestrator additionally
carries the deep references the whole suite draws on:

| File | Purpose |
| ---- | ------- |
| `zaileys-assist/SKILL.md` | Orchestrator: mental model, golden rules, intent routing, API cheat-sheet |
| `zaileys-assist/references/api.md` | Full API surface: `ClientOptions`, send builder, events, mutations, domain, storage, media |
| `zaileys-assist/references/recipes.md` | Best-practice, copy-paste patterns for every common bot |
| `zaileys-assist/references/errors.md` | Every error class + code → meaning → fix |
| `zaileys-assist/references/troubleshooting.md` | Runtime symptoms (QR loops, sessions, disconnects, peer deps) → fix |
| `zaileys-assist/references/pitfalls.md` | Common mistakes → the correct way |
| `zaileys-scaffold/SKILL.md` · `zaileys-debug/SKILL.md` · `zaileys-review/SKILL.md` | Focused task skills (project generation, error diagnosis, code review) |

Prefer to feed an LLM directly? The whole documentation is also available as a single file at
[`/llms-full.txt`](/llms-full.txt), with an index at [`/llms.txt`](/llms.txt).

## Keeping it updated

The skill is versioned alongside the library. With the Claude Code plugin, run
`/plugin marketplace update zeative/zaileys` to pull the latest; with `npx skills`, re-run the
`add` command. New releases bump the plugin version so updates are detected.
