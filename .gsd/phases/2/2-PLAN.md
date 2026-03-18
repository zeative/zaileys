---
phase: 2
plan: 2
wave: 1
---

# Plan 2.2: Context Actions

## Objective
Implement the auto-bind actions for the `MessageContext`, allowing developers to call `ctx.send()`, `ctx.reply()`, and `ctx.react()` directly from the context object.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 8.2)

## Tasks

<task type="auto">
  <name>Implement Context Actions</name>
  <files>src/context/context-actions.ts</files>
  <action>
    Implement the `ContextActions` class.
    - `send(payload: SendPayload)`: Unified send method.
    - `reply(payload: SendPayload)`: Auto-quoting reply method.
    - `react(emoji: string)`: Emoji reaction shorthand.
    - `presence(state: PresenceState)`: Presence update toggle.
    - Attach these to the context via a builder pattern.
  </action>
  <verify>npx vitest src/context/context-actions.ts</verify>
  <done>
    Actions correctly interface with the (mocked) Signal System.
  </done>
</task>

## Success Criteria
- [ ] `src/context/context-actions.ts` implemented and ready for signal integration.
