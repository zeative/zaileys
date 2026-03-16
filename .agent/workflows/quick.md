---
description: Quick Mode — Execute small, ad-hoc tasks with lightweight guarantees
argument-hint: "[description] [--full] [--discuss]"
---

# /quick Workflow

<role>
You are a GSD Quick Mode orchestrator. Quick mode is for small, ad-hoc tasks that do not warrant a full roadmap phase, but still need atomicity and tracking.
</role>

<objective>
Execute a small task swiftly by automatically planning, executing, and (optional) verifying it inline, then tracking it in `STATE.md`.
</objective>

<context>
**Description:** $ARGUMENTS (everything not a flag)
**Flags:**
- `--full` — Enables strict verification after execution
- `--discuss` — Pre-planning discussion to capture intent

**Required files:**
- `.gsd/STATE.md`
</context>

<process>
## 1. Parse Arguments

Extract `--full` and `--discuss`. The remaining text is the `DESCRIPTION`.
If `DESCRIPTION` is empty, prompt the user: "What do you want to quickly accomplish?"

## 2. Generate Task Number

Find the next available quick task number:
Check `.gsd/quick/` directory (create if it doesn't exist).
Find the highest `NNN` prefix across all files (e.g., `001-PLAN.md`). Next number is `NNN + 1`.

## 3. Discuss Phase (if `--discuss`)

If `--discuss` was passed:
1. Identify 2-4 gray areas or implementation decisions derived from the `DESCRIPTION`.
2. Ask the user focused questions about these areas.
3. Wait for the user's response.
4. Record the decisions in `.gsd/quick/{NNN}-CONTEXT.md`.

## 4. Gather Context & Create Plan

Read relevant context for the `DESCRIPTION`.
Generate a minimal plan at `.gsd/quick/{NNN}-PLAN.md`:

```markdown
# Quick Plan {NNN}: {DESCRIPTION}

## Objective
{What this does}

## Context
{Files or context used}
{If --discuss was used, reference the extracted decisions}

## Tasks
<task type="auto">
  <name>{Task name}</name>
  <files>{exact file paths}</files>
  <action>{Instructions}</action>
  <verify>{Command}</verify>
  <done>{Measure}</done>
</task>
```
*Note: Keep it to 1-3 tasks max.*

## 5. Execute Plan

Execute the `<task>` blocks inside the plan.
Commit changes when all tasks succeed:
```bash
git add -A
git commit -m "feat(quick-{NNN}): {DESCRIPTION}"
```

Create a summary at `.gsd/quick/{NNN}-SUMMARY.md`.

## 6. Verification (if `--full`)

If `--full` was passed:
Perform a verification step that ensures the original `DESCRIPTION` was satisfied.
Document findings in `.gsd/quick/{NNN}-VERIFICATION.md`.

## 7. Track in STATE.md

Check `.gsd/STATE.md` for a `### Quick Tasks Completed` table.
If it doesn't exist, create it under `### Blockers/Concerns` (or at the bottom):

```markdown
### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
```

Append the new task:
```markdown
| {NNN} | {DESCRIPTION} | {YYYY-MM-DD} | {commit-hash} | {Verified / Done} | [.gsd/quick/](./) |
```

Update the "Last activity" line in `STATE.md`.

## 8. Commit GSD Updates

```bash
git add .gsd/
git commit -m "docs(quick-{NNN}): track quick task execution"
```

</process>

<offer_next>
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUICK TASK {NNN} COMPLETE ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task: {DESCRIPTION}
Summary: .gsd/quick/{NNN}-SUMMARY.md

───────────────────────────────────────────────────────
```
</offer_next>
