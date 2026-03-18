---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Signal Core

## Objective
Establish the foundational components of the Signal System: the `Resolver` for payload type detection, the `SignalEngine` for managing the flow, and the `SentMessage` abstraction for interactive responses.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 5.1, 5.2)

## Tasks

<task type="auto">
  <name>Implement Payload Resolver</name>
  <files>src/signal/resolver.ts</files>
  <action>
    Implement the `Resolver` class with `detect()` method.
    - WHAT: Use priority-based detection to identify the payload type (e.g., if `{ image: ... }` exists, type is 'image').
    - HANDLE: All 12+ payload types defined in `MessageType`.
  </action>
  <verify>npx vitest src/signal/resolver.ts</verify>
  <done>
    Resolver correctly identifies all supported payload types.
  </done>
</task>

<task type="auto">
  <name>Implement Signal Engine & SentMessage</name>
  <files>src/signal/engine.ts, src/signal/sent-message.ts</files>
  <action>
    Implement the core engine and sent message abstraction.
    - Engine: Core `send` loop that traverses transformers.
    - SentMessage: Class with `.edit()`, `.delete()`, and `.react()` methods for fluent follow-ups.
  </action>
  <verify>npx tsc --noEmit</verify>
  <done>
    Signal Engine can process a simple text payload and returns a `SentMessage` instance.
  </done>
</task>

## Success Criteria
- [ ] `Resolver` handles all V4 payload types.
- [ ] `SentMessage` provides a rich API for interacting with sent messages.
