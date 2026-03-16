---
phase: 4
plan: 3
wave: 3
---

# Plan 4.3: Implementing Wrapper In Consumers

## Objective
Now that all underlying schemas and the validation parser are natively `valibot`, transition the classes and utilities consuming them to import from `src/Library/valibot` and execute schema evaluations via the newly minted parser format. Also verify that TypeScript inferences continue to successfully emit.

## Context
- `src/Classes/button.ts`
- `src/Classes/client.ts`
- `src/Library/ffmpeg/sticker.ts`
- `src/Library/media-modifier.ts`
- `src/Signal/index.ts`

## Tasks

<task type="auto">
  <name>Refactor Validations Across Classes</name>
  <files>
    src/Classes/button.ts
    src/Classes/client.ts
    src/Library/ffmpeg/sticker.ts
    src/Library/media-modifier.ts
    src/Signal/index.ts
  </files>
  <action>
    - Purge `import z from 'zod'` across all files.
    - Repoint `import { parseZod } from '../Library/zod'` references to `import { parseValibot } from '../Library/valibot'`.
    - Replace usage calls like `parseZod(Schema, object)` with `parseValibot(Schema, object)`.
    - For inline inferences like `z.infer<typeof Schema>`, transpose to `v.InferInput<typeof Schema>` or `v.InferOutput<typeof Schema>` importing `* as v from 'valibot'`.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Complete zero-error compilation mapping indicating Valibot interfaces are 1-1.</done>
</task>

## Success Criteria
- [ ] TypeScript transpiles cleanly without implicit typings failing down the prop chain.
- [ ] Project effectively purges Zod globally.
