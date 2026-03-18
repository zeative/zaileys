---
phase: 1
plan: 4
wave: 2
---

# Plan 1.4: Unit Testing Foundation

## Objective
Establish the testing framework (Vitest) and create the baseline tests for all Phase 1 components.

## Context
- .gsd/SPEC.md
- tech-docs-v4.txt (Section 15, 23.1)

## Tasks

<task type="auto">
  <name>Setup Vitest</name>
  <files>package.json, vitest.config.ts</files>
  <action>
    Install `vitest` and configure it for ESM native testing.
    - Setup `test` script in `package.json`.
  </action>
  <verify>npm test -- --version</verify>
  <done>
    `npm test` executes Vitest correctly.
  </done>
</task>

<task type="auto">
  <name>Comprehensive Unit Tests</name>
  <files>__tests__/utils/*.test.ts, __tests__/store/*.test.ts</files>
  <action>
    Create exhaustive test cases for all Phase 1 files.
    - Focus: `normalizeText` edge cases, JID resolving, and Store event timing.
  </action>
  <verify>npm test</verify>
  <done>
    All unit tests pass with >90% coverage for Phase 1 code.
  </done>
</task>

## Success Criteria
- [ ] Vitest configured and baseline tests passing.
- [ ] `__tests__` directory structured according to V4 docs.
