---
phase: 4
plan: 2
wave: 2
---

# Plan 4.2: Transpile Zod Types to Valibot

## Objective
The entire `src/Types` directory implements Zod schemas (`z.object`, `z.string`, `z.number`, `.default()`, `.optional()`, `.enum()`, `.union()`). All of these must be transposed precisely into standard `valibot` syntax (`v.object`, `v.string`, `v.number`, `v.optional(v.string(), "default")`, `v.picklist()` / `v.union()`) without losing default structures or optional constraints.

## Context
- `src/Types/button.ts`
- `src/Types/calls.ts`
- `src/Types/client.ts`
- `src/Types/connection.ts`
- `src/Types/messages.ts`
- `src/Types/Signal/signal.ts`

## Tasks

<task type="auto">
  <name>Rewrite Core Connection and Event Types</name>
  <files>
    src/Types/calls.ts
    src/Types/connection.ts
    src/Types/messages.ts
    src/Types/Signal/signal.ts
  </files>
  <action>
    - Drop `import { z } from 'zod'` and import `* as v from 'valibot'`.
    - Translate schemas strictly maintaining keys and literal combinations.
    - Example transformation: `z.object({ id: z.string() })` -> `v.object({ id: v.string() })`.
    - Remember that `*.default()` in Zod becomes the second parameter of `v.optional(schema, default)` or `v.fallback()` in Valibot. Use `v.optional(schema)` for things that are strictly optional.
  </action>
  <verify>cat src/Types/connection.ts src/Types/messages.ts | grep 'zod' || echo "Clean"</verify>
  <done>Validation objects completely ported.</done>
</task>

<task type="auto">
  <name>Rewrite Complex Client Config Types</name>
  <files>
    src/Types/client.ts
    src/Types/button.ts
  </files>
  <action>
    - Eliminate `import { z } from 'zod'` and implement `import * as v from 'valibot'`.
    - The heavy `client.ts` contains `z.union`, `z.literal`, `z.array`, `.extend()`.
    - In Valibot, `z.literal` -> `v.literal`.
    - In Valibot, `z.union` -> `v.union`.
    - `ClientBaseType.extend` doesn't exist out of the box, map via `v.object({ ...A.entries, ...B.entries })` or use `v.intersect`.
  </action>
  <verify>cat src/Types/client.ts | grep 'zod' || echo "Clean"</verify>
  <done>Client schemas transposed over to Valibot successfully.</done>
</task>

## Success Criteria
- [ ] No `.schema` or `.zod` remnants in the `Types` directory block.
- [ ] All definitions correspond to strictly structured `valibot` standards.
