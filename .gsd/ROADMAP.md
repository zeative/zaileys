# ROADMAP.md

> **Current Phase**: 1
> **Milestone**: v1.0

## Must-Haves (from SPEC)
- [ ] Replace jetdb with lmdb
- [ ] Ensure project compiles successfully

## Phases

### Phase 1: Database Migration
**Status**: ✅ Completed
**Objective**: Drop jetdb entirely and replace with direct LMDB integration across Config, Auth, Client, Health, and Listeners.

### Phase 2: Utility Modernization (Radashi Migration)
**Status**: ✅ Completed
**Objective**: Replace `lodash` completely and refactor complex native javascript abstractions (chunking, deep nesting, validation) into elegant `radashi` utility functional equivalents to reduce boilerplate and complexity.

### Phase 3: Unorm Elimination
**Status**: ✅ Completed
**Objective**: Remove the heavy `unorm` library dependency and replace all Unicode formatting functionalities (e.g., `unorm.nfkc`) with modern Native V8 equivalents like `String.prototype.normalize()`.

### Phase 4: Validation Migration (Zod -> Valibot)
**Status**: ✅ Completed
**Objective**: Drop `zod` and `zod-validation-error` completely. Migrate the entire codebase schema definition and validation engine to `valibot` for a drastically smaller bundle size and purely functional APIs.

### Phase 5: Media Processing Mega Refactor (FFmpeg Core)
**Status**: ✅ Completed
**Objective**: Overhaul `audio.ts`, `video.ts`, `document.ts`, `core.ts`, and `index.ts` to implement best-practice WhatsApp media processing, strict format conversions (Opus OGGs, H264 MP4s), and improve error handling/efficiency.

### Phase 6: Media Processing DX Overhaul
**Status**: ✅ Completed
**Objective**: Redesign the structural export logic and Developer Experience (DX) for `media-modifier.ts` and underlying FFmpeg wrappers. Abstract everything into a seamless, unified Builder/Facade API that simplifies end-user code and encapsulates buffer streams smoothly.

### Phase 7: Extracting Media Handler to NPM
**Status**: 🛠️ Planning
**Objective**: Extract the `ffmpeg` library and `media-modifier.ts` to a standalone local NPM package `@zeative/media-process` using `pnpm` workspaces. This uncouples heavy media bindings from the core WhatsApp connector matrix.
