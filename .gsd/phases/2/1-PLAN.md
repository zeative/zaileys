---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Context Types & Shorthands

## Objective
Define the core interfaces and types for the `MessageContext` and implement the basic root-level getters (shorthands) that provide the foundation for the V4 Developer Experience.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 8.1, 9.1)

## Tasks

<task type="auto">
  <name>Define Context Types</name>
  <files>src/types/context.ts</files>
  <action>
    Define `MessageContext`, `RoomType`, `DeviceType`, and `MessageType` interfaces as specified in `tech-docs-v4.txt` section 9.1.
    - Ensure `MessageContext` includes `raw`, `content`, `room`, `sender`, `flags`, and `actions`.
    - Use `InferOutput` if any schemas are involved.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>
    `src/types/context.ts` is fully typed and exported.
  </done>
</task>

<task type="auto">
  <name>Implement Context Shorthands</name>
  <files>src/context/message-context.ts</files>
  <action>
    Implement the base `MessageContext` class with root-level getters.
    - `get text()`: Returns the main text content, caption, or option text.
    - `get type()`: Returns the normalized message type (e.g., 'image', 'text').
    - `get jid()`: Shorthand for `room.id`.
  </action>
  <verify>npx vitest src/context/message-context.ts</verify>
  <done>
    Shorthands correctly extract data from the internal context structure.
  </done>
</task>

## Success Criteria
- [ ] `src/types/context.ts` created.
- [ ] Base `MessageContext` class with working getters (text, type, jid) implemented.
