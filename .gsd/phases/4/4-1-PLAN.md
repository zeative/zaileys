---
phase: 4
plan: 1
wave: 1
---

# Plan 4.1: Setup Valibot and Wrapper Migration

## Objective
Uninstall `zod` and `zod-validation-error`. Install completely modular `valibot` dependency. Replace the library validation wrapper with `valibot` semantics (`v.safeParse` and `v.summarize`/`v.flatten`).

## Context
- `package.json`
- `src/Library/zod.ts` (This file should be renamed to `src/Library/valibot.ts`!)

## Tasks

<task type="auto">
  <name>Dependency Swap</name>
  <files>package.json</files>
  <action>
    - Execute `pnpm remove zod zod-validation-error`.
    - Execute `pnpm add valibot`.
  </action>
  <verify>bun pm ls</verify>
  <done>package.json explicitly lists `valibot` and omits entirely `zod` and `zod-validation-error`.</done>
</task>

<task type="auto">
  <name>Implement Valibot Wrapper</name>
  <files>src/Library/zod.ts</files>
  <action>
    - Rename the file gracefully from `src/Library/zod.ts` to `src/Library/valibot.ts`.
    - Drop `zod` and `fromError` imports. Import `* as v from 'valibot'`.
    - Create an export `parseValibot = <T extends v.BaseSchema<any, any, any>>(schema: T, data: unknown)` that executes `v.safeParse`.
    - If `result.issues` exist, extract and throw an Error via `v.summarize(result.issues)` or by joining `v.flatten()`.
  </action>
  <verify>test -f src/Library/valibot.ts && ! test -f src/Library/zod.ts</verify>
  <done>Wrapper has successfully transitioned to `valibot` with functional Error reporting.</done>
</task>

## Success Criteria
- [ ] Dependencies swapped cleanly.
- [ ] `valibot.ts` gracefully replaces `zod.ts`.
