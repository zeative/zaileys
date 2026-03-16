---
description: List assumptions made during phase planning
argument-hint: "<phase-number>"
---

# /list-phase-assumptions Workflow

<objective>
Surface and document assumptions made during phase planning that should be validated.
</objective>

<process>

## 1. Load Phase Plans

```powershell
Get-ChildItem ".gsd/phases/{N}/*-PLAN.md"
```

---

## 2. Extract Assumptions

Scan plans for:
- Technology choices without justification
- Implied dependencies
- Expected behaviors not verified
- Time estimates
- Scope boundaries

---

## 3. Categorize Assumptions

| Category | Risk Level |
|----------|------------|
| Technical | API exists, library works, syntax correct |
| Integration | Services compatible, auth works |
| Scope | Feature boundaries, what's excluded |
| Performance | Will handle load, fast enough |
| Timeline | Estimates accurate |

---

## 4. Display Assumptions

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PHASE {N} ASSUMPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TECHNICAL
🟡 {assumption 1} — Validate before execution
🟢 {assumption 2} — Low risk

INTEGRATION
🔴 {assumption 3} — High risk, verify first

SCOPE
🟡 {assumption 4} — Confirm with user

───────────────────────────────────────────────────────

▶ ACTIONS

• Validate high-risk assumptions before /execute
• Add verified assumptions to RESEARCH.md
• Flag for user review if scope-related

───────────────────────────────────────────────────────
```

---

## 5. Offer Validation

Ask if user wants to:
- Validate specific assumptions now
- Add to TODO.md for later
- Accept and proceed

</process>
