---
phase: 2
plan: 1
wave: 1
---

# Plan 2.1: Native to Radashi Optimization

## Objective
Convert bloated, boilerplate native javascript abstractions (such as nested object retrieval and array chunking) to clean, elegant Radashi utility methods `radashi.get`, `radashi.isEmpty`, and `radashi.cluster`. This shrinks the codebase, reduces cognitive load, and leverages reliable community-tested utility patterns without adding extra dependencies.

## Context
- .gsd/ROADMAP.md
- src/Utils/helper.ts
- src/Library/cleanup-manager.ts
- src/Auth/state.ts

## Tasks

<task type="auto">
  <name>Refactor Object Helpers</name>
  <files>src/Utils/helper.ts</files>
  <action>
    - Refactor `pickKeysFromArray`. Radashi's `get(obj, path)` can completely replace the 15+ lines of the `getNested` custom path parser algorithm.
    - Rewrite custom `isEmpty` function. We can use `radashi.isEmpty()` alongside a `.trim()` check to maintain space-only string detection.
    - Replace `findNestedByKeys` iterations with pure functional Radashi implementations.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Boilerplate manual loops inside `helper.ts` are eliminated, leveraging minimal lines with Radashi object traversals.</done>
</task>

<task type="auto">
  <name>Refactor Chunking Integrations</name>
  <files>src/Library/cleanup-manager.ts, src/Auth/state.ts</files>
  <action>
    - Both `cleanup-manager.ts` and `state.ts` contain manual 500-size array slicing chunk mechanisms.
    - Replace `for (let i = 0; i < operations.length; i += chunkSize) { const chunk = operations.slice(...) }` with an elegant iteration over `radashi.cluster`(array, size).
    - Ensure asynchronous arrays `Promise.all()` operate smoothly on the returned sub-matrices.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Array partitioning is successfully replaced with `radashi.cluster` leading to less cognitive complexity.</done>
</task>

## Success Criteria
- [ ] Nested path abstractions (`obj[arrayKey][index]`) are successfully abstracted via `radashi.get`
- [ ] Array chunking `slice` boilerplate loops are replaced natively with `radashi.cluster(arr, 500)`
- [ ] TypeScript validations complete with exactly `0` errors.
