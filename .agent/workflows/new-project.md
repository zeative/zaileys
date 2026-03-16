---
description: Initialize a new project with deep context gathering
---

# /new-project Workflow

<objective>
Initialize a new project through unified flow: questioning → research (optional) → requirements → roadmap.

This is the most leveraged moment in any project. Deep questioning here means better plans, better execution, better outcomes. One command takes you from idea to ready-for-planning.

**Creates:**
- `.gsd/SPEC.md` — project specification
- `.gsd/ROADMAP.md` — phase structure
- `.gsd/STATE.md` — project memory
- `.gsd/ARCHITECTURE.md` — system design (if brownfield)
- All other .gsd/ documentation files

**After this command:** Run `/plan 1` to start execution.
</objective>

<process>

## Phase 1: Setup
**MANDATORY FIRST STEP — Execute these checks before ANY user interaction:**

1. **Abort if project exists:**

   **PowerShell:**
   ```powershell
   if (Test-Path ".gsd/SPEC.md") {
       Write-Error "Project already initialized. Use /progress"
       exit 1
   }
   ```

   **Bash:**
   ```bash
   if [ -f ".gsd/SPEC.md" ]; then
       echo "Error: Project already initialized. Use /progress" >&2
       exit 1
   fi
   ```

2. **Initialize git repo** (if not exists):

   **PowerShell:**
   ```powershell
   if (-not (Test-Path ".git")) {
       git init
       Write-Output "Initialized new git repo"
   }
   ```

   **Bash:**
   ```bash
   if [ ! -d ".git" ]; then
       git init
       echo "Initialized new git repo"
   fi
   ```

3. **Detect existing code (brownfield detection):**

   **PowerShell:**
   ```powershell
   $codeFiles = Get-ChildItem -Recurse -Include "*.ts","*.js","*.py","*.go","*.rs" | 
       Where-Object { $_.FullName -notmatch "node_modules|\.git" } | 
       Select-Object -First 20
   
   $hasPackage = Test-Path "package.json" -or Test-Path "requirements.txt" -or Test-Path "Cargo.toml"
   $hasArchitecture = Test-Path ".gsd/ARCHITECTURE.md"
   ```

   **Bash:**
   ```bash
   code_files=$(find . -type f \( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) \
       -not -path '*/node_modules/*' -not -path '*/.git/*' | head -20)
   
   has_package=$(test -f "package.json" -o -f "requirements.txt" -o -f "Cargo.toml" && echo true || echo false)
   has_architecture=$(test -f ".gsd/ARCHITECTURE.md" && echo true || echo false)
   ```

---

## Phase 2: Brownfield Offer
**If existing code detected and ARCHITECTURE.md doesn't exist:**

```
⚠️ EXISTING CODE DETECTED

Found {N} source files in this directory.

Options:
A) Map codebase first — Run /map to understand existing architecture (Recommended)
B) Skip mapping — Proceed with project initialization

Which do you prefer?
```

**If "Map codebase first":**
```
Run `/map` first, then return to `/new-project`
```
Exit command.

**If "Skip mapping":** Continue to Phase 3.
**If no existing code detected OR codebase already mapped:** Continue to Phase 3.

---

## Phase 3: Deep Questioning

Display banner:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► QUESTIONING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Open the conversation:**

Ask: "What do you want to build?"

Wait for response. This gives context for intelligent follow-ups.

**Follow the thread:**

Based on their answer, ask follow-up questions that dig deeper:
- What excited them about this idea
- What problem sparked this
- What they mean by vague terms
- What it would actually look like
- What's already decided

**Questioning techniques:**
- Challenge vagueness: "When you say 'fast', what does that mean specifically?"
- Make abstract concrete: "Give me an example of how a user would..."
- Surface assumptions: "You're assuming users will... Is that validated?"
- Find edges: "What's explicitly NOT in scope?"
- Reveal motivation: "Why does this matter now?"

**Context checklist (gather mentally, not as interrogation):**
- [ ] Vision — What does success look like?
- [ ] Users — Who is this for?
- [ ] Problem — What pain does it solve?
- [ ] Scope — What's in, what's out?
- [ ] Constraints — Technical, timeline, budget?
- [ ] Prior art — What exists already?

**Decision gate:**

When you could write a clear SPEC.md:
```
Ready to create SPEC.md?

A) Create SPEC.md — Let's move forward
B) Keep exploring — I want to share more
```

If "Keep exploring" — ask what they want to add, or identify gaps and probe naturally.

Loop until "Create SPEC.md" selected.

---

## Phase 4: Write SPEC.md

Create `.gsd/SPEC.md`:

```markdown
# SPEC.md — Project Specification

> **Status**: `FINALIZED`

## Vision
{Distilled from questioning — one paragraph max}

## Goals
1. {Primary goal}
2. {Secondary goal}
3. {Tertiary goal}

## Non-Goals (Out of Scope)
- {Explicitly excluded}
- {Not in this version}

## Users
{Who will use this and how}

## Constraints
- {Technical constraints}
- {Timeline constraints}
- {Other limitations}

## Success Criteria
- [ ] {Measurable outcome 1}
- [ ] {Measurable outcome 2}
```

---

## Phase 5: Research Decision

If project involves unfamiliar technology or architectural decisions:

```
📚 RESEARCH CHECK

This project involves {area where research might help}.

Would you like to:
A) Do research first — Investigate options before committing
B) Skip research — I know what I want, let's plan

```

**If research selected:**
- Create `.gsd/RESEARCH.md` with findings
- Document technology choices and rationale
- Return to continue

---

## Phase 6: Define Requirements

Generate requirements from SPEC.md:

```markdown
# REQUIREMENTS.md

## Format
| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| REQ-01 | {requirement} | SPEC goal 1 | Pending |
| REQ-02 | {requirement} | SPEC goal 2 | Pending |
```

**Rules:**
- Each requirement is testable
- Each maps to a SPEC goal
- Status starts as "Pending"

**If simple project:** Skip formal requirements, SPEC.md is sufficient.

---

## Phase 7: Create Roadmap

Create `.gsd/ROADMAP.md`:

```markdown
# ROADMAP.md

> **Current Phase**: Not started
> **Milestone**: v1.0

## Must-Haves (from SPEC)
- [ ] {must-have 1}
- [ ] {must-have 2}

## Phases

### Phase 1: {Foundation}
**Status**: ⬜ Not Started
**Objective**: {what this delivers}
**Requirements**: REQ-01, REQ-02

### Phase 2: {Core Feature}
**Status**: ⬜ Not Started
**Objective**: {what this delivers}
**Requirements**: REQ-03

### Phase 3: {Integration}
**Status**: ⬜ Not Started
**Objective**: {what this delivers}

### Phase 4: {Polish/Launch}
**Status**: ⬜ Not Started
**Objective**: {final touches}
```

**Phase creation rules:**
- 3-5 phases per milestone
- Each phase has clear deliverable
- Dependencies flow forward

---

## Phase 8: Initialize Remaining Files

Create with templates:
- `.gsd/STATE.md` — Empty state
- `.gsd/DECISIONS.md` — Empty ADR log
- `.gsd/JOURNAL.md` — Empty journal
- `.gsd/TODO.md` — Empty todo list

Create directories:
- `.gsd/phases/`
- `.gsd/templates/`

---

## Phase 9: Initial Commit

```bash
git add .gsd/
git commit -m "chore: initialize GSD project

- SPEC.md with vision and goals
- ROADMAP.md with {N} phases
- Project documentation structure"
```

---

## Phase 10: Done

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 GSD ► PROJECT INITIALIZED ✓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Project: {name}
Phases: {N}

Files created:
• .gsd/SPEC.md (FINALIZED)
• .gsd/ROADMAP.md ({N} phases)
• .gsd/STATE.md
• .gsd/DECISIONS.md
• .gsd/JOURNAL.md

───────────────────────────────────────────────────────

▶ NEXT

/discuss-phase 1 — Clarify scope (optional but recommended)
/plan 1 — Create Phase 1 execution plans

───────────────────────────────────────────────────────

💡 The questioning phase is the highest-leverage moment.
   Time invested here pays dividends throughout execution.

───────────────────────────────────────────────────────
```

</process>

<questioning_philosophy>
## Why Deep Questioning Matters

The original GSD emphasizes that `/new-project` is the most leveraged moment. 
Every minute spent understanding what to build saves hours of building the wrong thing.

**Signs questioning is done:**
- You could explain the project to a stranger
- You know what's NOT being built (scope edges)
- Success criteria are measurable
- You're excited to start planning

**Signs more questioning needed:**
- Vague terms remain unexplained
- You don't know who the user is
- Success is defined as "it works"
- Scope keeps expanding during discussion
</questioning_philosophy>
