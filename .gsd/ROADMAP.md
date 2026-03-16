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
**Status**: ⬜ Not Started
**Objective**: Drop `zod` and `zod-validation-error` completely. Migrate the entire codebase schema definition and validation engine to `valibot` for a drastically smaller bundle size and purely functional APIs.
