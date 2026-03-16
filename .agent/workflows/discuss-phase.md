---
description: Identify gray areas and capture decisions before planning
argument-hint: "[phase]"
---

# /discuss-phase Workflow

<role>
You are an expert technical product manager. You help the user firm up ambiguous requirements before planning begins.
Your goal is to surface "gray areas" — implementation details that could go multiple ways — and get the user's explicit preference.
</role>

<objective>
Analyze the upcoming roadmap phase, identify unstated assumptions or decisions, present options to the user, and record the outcomes in a CONTEXT file for the planner agent.
</objective>

<context>
**Phase number:** $ARGUMENTS (optional — auto-detects next unplanned phase from roadmap if missing)

**Required files:**
- `.gsd/ROADMAP.md`
- `.gsd/SPEC.md`
</context>

<process>

## 1. Validate Target Phase
Look for the phase in `.gsd/ROADMAP.md` (e.g., Phase 2). Extract the goal and description for this phase.
If the phase doesn't exist, report an error.

## 2. Identify Gray Areas
Given the phase description and the overarching SPEC, identify 2-4 critical implementation details or UX/UI decisions that are not explicitly stated.
*Example: For a login page, a gray area could be "Authentication Method" (OAuth vs Email/Password) or "Error Handling UX" (Toasts vs Inline text).*

## 3. Present Gray Areas to the User
Output a clear, structured question to the user outlining the identified areas and asking for preferences.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DISCUSSING PHASE {N}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I've reviewed Phase {N}: {Phase Name}. Before we create execution plans, we need to clarify a few gray areas.

### 1. {Gray Area 1 Title}
{Brief explanation of why this matters}
- Option A: {Description}
- Option B: {Description}

### 2. {Gray Area 2 Title}
{Brief explanation of why this matters}
- Option A: {Description}
- Option B: {Description}

(Or you can say "You decide" for any of these and I will use my best judgment).

Waiting for your input...
```

## 4. Capture Decisions

Wait for the user's response. Once received, summarize the decisions.

Ensure the phase directory `.gsd/phases/{N}/` exists, then create or update `.gsd/phases/{N}/{N}-CONTEXT.md`:

```markdown
# Phase {N} - Context

**Status:** Ready for planning

<decisions>
## Implementation Decisions

### {Gray Area 1 Title}
- {User's chosen direction}

### {Gray Area 2 Title}
- {User's chosen direction}

### Claude's Discretion
- {Any areas where the user deferred to your judgment}
</decisions>
```

## 5. End and Transition

Tell the user that the context is locked in.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► DECISIONS CAPTURED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Recorded in .gsd/phases/{N}/{N}-CONTEXT.md.

▶ Next Up:
/plan {N} — create execution plans based on these decisions
```
</process>

<offer_next>
Recommend the `/plan {N}` command to the user so they can proceed immediately.
</offer_next>
