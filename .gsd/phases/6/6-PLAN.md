---
phase: 6
plan: 1
wave: 1
---

# Plan 6.1: Architecting the Fluid Media Builder API

## Objective
The current `mediaModifier` singleton object API forces manual type branching and lacks intuitive intellisense tracking. This plan redesigns `MediaModifier` into a robust `Media` class representing a Media wrapper with fluent chaining.

## Context
- .gsd/ROADMAP.md
- src/Library/media-modifier.ts
- src/Signal/index.ts

## Tasks

<task type="auto">
  <name>Redesign `media-modifier.ts` to `Media` Class</name>
  <files>src/Library/media-modifier.ts</files>
  <action>
    - Transform `MediaModifier` from a static nested object into a `Media` class builder.
    - Expose methods that operate on a private `this.input` Buffer instance.
    - Organize functions into explicit intent boundaries: `.asAudio()`, `.asVideo()`, `.asImage()`.
    - Drop the awkward nested arrow functions in favor of class getter prototypes.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Media class implements fluid builder paradigm safely</done>
</task>

<task type="auto">
  <name>Refactor Internal Consumers</name>
  <files>src/Signal/index.ts, src/Signal/group.ts, src/Signal/newsletter.ts</files>
  <action>
    - Replace all legacy `mediaModifier.xxx(media)` calls with the new `new Media(media).asX()` syntax.
    - Ensure TypeScript typings align properly with the new object shapes.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>All internal library consumers map flawlessly to the new syntax.</done>
</task>

## Success Criteria
- [x] `Media` class provides a beautiful DX chain API.
- [x] No `any` casting is required to circumvent type breakages.
- [x] Type tests execute securely without warnings.
