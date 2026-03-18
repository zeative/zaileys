---
phase: 2
plan: 4
wave: 2
---

# Plan 2.4: Metadata, Flags & Reply Chain

## Objective
Implement the advanced context features: metadata parsing, the intelligent flag system, and the recursive reply chain builder.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 9.4, 9.5, 9.6)

## Tasks

<task type="auto">
  <name>Implement Metadata & Flag Parser</name>
  <files>src/context/metadata-parser.ts, src/context/flag-system.ts</files>
  <action>
    Implement metadata extraction and flag computation.
    - Metadata: Extract `room.id`, `sender.id`, `pushName`, `device`.
    - Flags: Compute `isGroup`, `isBot`, `isForwarded`, `isNewsletter`, `isFromMe`, `isLid`.
  </action>
  <verify>npx vitest __tests__/context/flags.test.ts</verify>
  <done>
    Flags and metadata are correctly populated for both personal and group chats.
  </done>
</task>

<task type="auto">
  <name>Implement Recursive Reply Chain</name>
  <files>src/context/reply-chain.ts</files>
  <action>
    Implement `buildReplied` logic.
    - Recursively fetch quoted messages from the store.
    - Depth control: Stop at `options.maxReplies`.
    - Handle `quotedMessage` property in Baileys content.
  </action>
  <verify>npx vitest __tests__/context/replied.test.ts</verify>
  <done>
    `ctx.replied` correctly builds a chain of previous messages up to the max depth.
  </done>
</task>

## Success Criteria
- [ ] Flags, metadata, and reply chain systems implemented.
- [ ] `__tests__/context/builder.test.ts` covers full integration.
