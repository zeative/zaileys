---
phase: 7
plan: 1
wave: 1
---

# Plan 7.1: Extract Media Handling to `@zaadevofc/media-process` Workspace

## Objective
Convert the monolithic media manipulation engine from the core Zaileys bundle into a dedicated `pnpm` workspace package named `@zaadevofc/media-process`. This isolates the heavy FFmpeg/WebPMux logic, making the main wrapper lighter while establishing a modular ecosystem.

## Context
- `packages/media-process/package.json` (to be created)
- `src/Library/ffmpeg/` -> `packages/media-process/src/`
- `src/Library/media-modifier.ts` -> `packages/media-process/src/`
- `package.json` (core)
- `pnpm-workspace.yaml` (to be created)

## Tasks

<task type="auto">
  <name>Initialize Monorepo Workspace & Package</name>
  <files>
    - pnpm-workspace.yaml
    - packages/media-process/package.json
    - packages/media-process/tsup.config.ts
    - packages/media-process/tsconfig.json
  </files>
  <action>
    - Create `pnpm-workspace.yaml` at the root with `packages: ['packages/*']`.
    - Create the base structure `packages/media-process`.
    - Create `packages/media-process/package.json` configured with name `@zaadevofc/media-process`, version `1.0.0`, type `module`, and tsup build scripts.
    - Setup `tsup.config.ts` and `tsconfig.json` similarly to the main zaileys project for fast bundling.
    - Transfer media dependencies (fluent-ffmpeg, node-webpmux, valibot, sharp, file-type, @ffmpeg-installer, @ffprobe-installer) from the root `package.json` down to the `@zaadevofc/media-process` package.json.
  </action>
  <verify>test -f pnpm-workspace.yaml && test -f packages/media-process/package.json</verify>
  <done>PNPM Workspace initialized and media-process base skeleton defined.</done>
</task>

<task type="auto">
  <name>Relocate and Refactor Source Codes</name>
  <files>
    - src/Library/ffmpeg/ -> packages/media-process/src/ffmpeg/
    - src/Library/media-modifier.ts -> packages/media-process/src/Media.ts
    - packages/media-process/src/index.ts
  </files>
  <action>
    - Move the `src/Library/ffmpeg/` directory entirely into `packages/media-process/src/ffmpeg/`.
    - Move `media-modifier.ts` to `packages/media-process/src/Media.ts` and export it inside the new `packages/media-process/src/index.ts`.
    - Update internal import paths inside `packages/media-process/src` so they don't break (e.g. resolve `#utils` or generic paths gracefully if they relied on root utils).
    - NOTE: Move necessary string/validation utilities like `generateId` into the media package if strictly tied to its logic, or duplicate it temporarily to isolate the workspace.
  </action>
  <verify>test -f packages/media-process/src/index.ts</verify>
  <done>Library logic fully ported into the new NPM package structure.</done>
</task>

<task type="auto">
  <name>Bridge and Re-integrate core Zaileys package</name>
  <files>
    - package.json
    - src/index.ts
    - src/Signal/index.ts
    - src/Signal/group.ts
    - src/Signal/newsletter.ts
  </files>
  <action>
    - Add `"@zaadevofc/media-process": "workspace:*"` to the core `package.json` dependencies.
    - Update all signal handlers (`index.ts`, `group.ts`, `newsletter.ts`) to import `Media` from `@zaadevofc/media-process` instead of local `../Library/media-modifier.ts`.
    - Run `pnpm install` in the root to link workspaces.
  </action>
  <verify>pnpm tsc --noEmit</verify>
  <done>Compilation checks pass flawlessly with the uncoupled builder API.</done>
</task>

## Success Criteria
- [ ] `packages/media-process` successfully bundles via `pnpm build`.
- [ ] The root `zaileys` package resolves `new Media()` directly from `@zaadevofc/media-process`.
- [ ] TypeScript `pnpm tsc --noEmit` runs securely across both the workspace and core package.
