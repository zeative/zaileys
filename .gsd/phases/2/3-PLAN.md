---
phase: 2
plan: 3
wave: 1
---

# Plan 2.3: Context Builder Core & Resolver

## Objective
Implement the core `MessageContextBuilder` responsible for validating incoming messages and extracting content across all supported WhatsApp message types.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 9.2, 9.3)

## Tasks

<task type="auto">
  <name>Implement Message Validator</name>
  <files>src/context/message-context.ts</files>
  <action>
    Implement `isValidMessage` logic in the builder.
    - Check for `message` property in the raw Baileys `WebMessageInfo`.
    - Ignore protocol messages, ephemeral setting updates, and empty stubs.
  </action>
  <verify>npx vitest src/context/message-context.ts</verify>
  <done>
    Builder correctly filters out non-message events.
  </done>
</task>

<task type="auto">
  <name>Implement Content Resolver</name>
  <files>src/context/content-resolver.ts</files>
  <action>
    Implement `extractContent` logic.
    - WHAT: Recursively search for the primary message payload (text, image, video, etc.).
    - HANDLE: `viewOnceMessage`, `ephemeralMessage`, `documentWithCaptionMessage`, etc.
    - RETURN: Normalized object with `type` and `raw` payload.
  </action>
  <verify>npx vitest src/context/content-resolver.ts</verify>
  <done>
    Resolver correctly identifies and extracts content from nested WA structures.
  </done>
</task>

## Success Criteria
- [ ] `src/context/content-resolver.ts` implemented.
- [ ] `MessageContextBuilder` can successfully extract simple text and image payloads.
