---
phase: 3
plan: 4
wave: 2
---

# Plan 3.4: Advanced Transformers & Middleware

## Objective
Implement the advanced button/list transformers with intelligent detection and the `useSignal` middleware system.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 5.6, 5.7)

## Tasks

<task type="auto">
  <name>Implement Button & List Transformers</name>
  <files>src/signal/transformers/button.ts, src/signal/button-detector.ts</files>
  <action>
    Implement button/list processing and auto-detection.
    - Detector: Identify if buttons should be 'simple', 'interactive', 'carousel', or 'list'.
    - Transformer: Generate the complex nested structures for mobile/desktop compatibility.
  </action>
  <verify>npx vitest __tests__/signal/buttons.test.ts</verify>
  <done>
    Buttons and Lists are correctly detected and transformed.
  </done>
</task>

<task type="auto">
  <name>Implement Signal Middleware</name>
  <files>src/signal/engine.ts</files>
  <action>
    Implement `useSignal` middleware support.
    - WHAT: Allow developers to hook into the send pipeline to modify or log outgoing messages.
    - PATTERN: Standard `(payload, next)` middleware chain.
  </action>
  <verify>npx vitest __tests__/signal/middleware.test.ts</verify>
  <done>
    `wa.useSignal()` correctly intercepts and modifies outgoing payloads.
  </done>
</task>

## Success Criteria
- [ ] Button detector correctly identifies all 4 button types.
- [ ] Middleware chain is functional and async-aware.
