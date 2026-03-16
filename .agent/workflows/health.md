---
description: Health Check — Validate directory and state integrity
argument-hint: "[--repair]"
---

# /health Workflow

<role>
You are a GSD Health Check orchestrator. Your job is to validate `.gsd/` directory integrity and report actionable issues.
</role>

<objective>
Check for missing files, invalid configurations, inconsistent state, and orphaned plans. Optionally repair auto-fixable issues.
</objective>

<context>
**Flags:**
- `--repair` — Auto-fix repairable issues

**Required files to check:**
- `.gsd/ROADMAP.md`
- `.gsd/STATE.md`
- `.gsd/PROJECT_RULES.md`
- `.gsd/SPEC.md`
</context>

<process>

## 1. Parse Arguments
Determine if the `--repair` flag is active.

## 2. Validate Core Documents

Run checks:
1. Does `.agent/workflows/` exist and contain at least 5 standard workflows?
2. Does `.gsd/ROADMAP.md` exist?
3. Does `.gsd/STATE.md` exist?
4. Does `.gsd/SPEC.md` exist?

If any missing, note it as an Error [E00X] and set health to **BROKEN**.

## 3. Validate Phase Directories

Cross-reference `.gsd/ROADMAP.md` with `.gsd/phases/` directories:
1. Parse roadmap for Phase numbers.
2. Ensure there's a `.gsd/phases/{N}/` directory for each phase.
3. Check Phase naming convention (e.g. `01-setup`, `02-auth`).
4. Look for plans `*.PLAN.md` without matching `*.SUMMARY.md` across phases.

If discrepancies are found:
- Warning [W00X] phase directory mismatch.
- Warning [W00Y] phase on disk but not in roadmap.
- Info [I00X] Plan without SUMMARY (may be in progress).

## 4. Validate Structural Integrity Using Script

Run the validation script to check structural integrity of templates, workflows, and skills:
```bash
bun .gsd/scripts/validate-all.ts
```
If errors occur, parse the output and include in the health check.

## 5. Attempt Repairs (if `--repair`)

For issues marked as repairable (e.g., missing `.gsd/STATE.md` but roadmap exists):
- **STATE.md recovery**: Create fresh `STATE.md` based on roadmap structure.
- **Phase matching**: Create missing `.gsd/phases/{N}/` directories based on roadmap.

Log what repairs were performed.

## 6. Report Status

Output the results clearly.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► Health Check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Status: HEALTHY | DEGRADED | BROKEN
Errors: N | Warnings: N | Info: N
```

**If repairs were performed:**
```
## Repairs Performed
- ✓ STATE.md: Regenerated from roadmap
- ✓ .gsd/phases/01/: Directory created
```

**If errors exist:**
```
## Errors
- [E001] .gsd/ROADMAP.md not found
  Fix: Run /plan to create
```

**If warnings exist:**
```
## Warnings
- [W001] STATE.md references phase 5, but only phases 1-3 exist
  Fix: Run /health --repair to regenerate
```

**If info exists:**
```
## Info
- [I001] phases/02/02-01-PLAN.md has no SUMMARY.md
  Note: May be in progress
```

**Footer (if repairable issues exist and --repair was NOT used):**
```
---
N issues can be auto-repaired. Run: /health --repair
```
</process>

<offer_next>
If repairable issues exist and `--repair` was not used, prompt the user:
"Would you like to run `/health --repair` to fix these issues automatically?"
</offer_next>
