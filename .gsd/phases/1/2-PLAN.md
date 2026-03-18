---
phase: 1
plan: 2
wave: 1
---

# Plan 1.2: Core Utilities (Part B) & Types

## Objective
Finalize the foundational ID utilities and establish the base types for the Zaileys V4 Client.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 3, 13)

## Tasks

<task type="auto">
  <name>Implement ID Utils</name>
  <files>src/utils/id.ts</files>
  <action>
    Implement `generateId` and `hashMessage`.
    - Use `crypto` to generate consistent hashes for dedup and unique identifiers.
  </action>
  <verify>npx vitest src/utils/id.ts</verify>
  <done>
    `generateId` returns consistent hashes for the same input.
  </done>
</task>

<task type="auto">
  <name>Define Core Types</name>
  <files>src/types/client.ts, src/types/index.ts</files>
  <action>
    Implement `ClientOptions` schema using `valibot`.
    - Required: `auth`, `store`.
    - Optional: `autoPresence`, `autoMentions`, `maxReplies`.
    - Re-export all types in `src/types/index.ts`.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>
    `ClientOptions` is properly typed and validated.
  </done>
</task>

## Success Criteria
- [ ] `src/utils/id.ts` implemented.
- [ ] Base type system established without `any` usage.
