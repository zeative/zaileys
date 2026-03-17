---
phase: 3
plan: 1
wave: 1
---

# Plan 3.1: Native Unicode V8 Normalization

## Objective
Remove the `unorm` library from `package.json` entirely. Utilize native Javascript `String.prototype.normalize()` which natively supports `NFKD` and `NFKC` parsing without external dependency injections, optimizing overall application bundle size and memory usage.

## Context
- `src/Utils/validate.ts`
- `package.json`

## Tasks

<task type="auto">
  <name>Refactor Text Normalizer</name>
  <files>src/Utils/validate.ts</files>
  <action>
    - Remove the `unorm` import block.
    - Rewrite `.map((char) => unorm.nfkd(char))` into native Javascript: `.map((char) => char.normalize('NFKD'))`
    - Rewrite `.map((char) => unorm.nfkc(char))` into native Javascript: `.map((char) => char.normalize('NFKC'))`
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Text normalization succeeds using purely standard internal string iterations without `unorm` fallback.</done>
</task>

<task type="auto">
  <name>Clear Dependencies</name>
  <files>package.json</files>
  <action>
    - Remove `"unorm": "^1.6.0"` from `"dependencies"`.
    - Run an installation cleanup.
  </action>
  <verify>bun pm ls</verify>
  <done>Package directory explicitly flags `unorm` as non-existent.</done>
</task>

## Success Criteria
- [ ] Codebase compiles natively via `tsc` with `0` errors.
- [ ] No footprint of `unorm` exists in `package.json`.
