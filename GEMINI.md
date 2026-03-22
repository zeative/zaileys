# GEMINI.md
> Antigravity (Gemini CLI) specific configuration. Supplements AGENTS.md.
> Priority: This file > AGENTS.md (Antigravity reads both, this wins on conflicts)

---

## KELAR FRAMEWORK ACTIVE

You are operating under the KELAR execution framework.
Read AGENTS.md for universal rules. This file contains Antigravity-specific additions only.

---

## ANTIGRAVITY-SPECIFIC RULES

### Loading AGENTS.md (Critical Fix for pre-v1.20.3)
If Antigravity is older than v1.20.3, AGENTS.md won't auto-load.
In that case, treat this file as the primary rules file AND read AGENTS.md manually
by looking for it in the project workspace.

Instruction: Check for the presence of AGENTS.md in the project workspace.
There may be additional AGENTS.md in sub-folders with specific instructions.
Apply all rules found in AGENTS.md as if they were written here.

### Skills location
`.gemini/skills/` (symlinked from `.kelar/skills/`)

### Workflows location
`.gemini/workflows/` (symlinked from `.kelar/workflows/`)

---

## ANTIGRAVITY MULTI-AGENT NOTES

When spawning sub-agents:
- Each sub-agent must also read AGENTS.md on start
- Pass current TASKS.md state to sub-agents
- Sub-agent results must be logged back to TASKS.md

---

## KNOWLEDGE ITEMS

When discovering reusable knowledge during a session:
- Save to Antigravity Knowledge Items AND to `.kelar/memory/[topic].md`
- This ensures knowledge persists even outside Antigravity

---

## AUTO-CONTINUE SAFETY GUARDS

Auto-continue is enabled by default in Antigravity v1.20.3+.
ALWAYS pause and ask before:
- Writing to database
- Deleting files
- Deploying to production
- Running destructive commands
- Modifying files outside declared scope
