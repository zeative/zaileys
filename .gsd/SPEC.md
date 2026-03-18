# SPEC.md - Zaileys V4 Migration
> **Status**: FINALIZED

## Overview
Zaileys V4 is a full-scale refactor from V3 focused on Developer Experience (DX), type safety, and modularity. This specification defines the requirements for the V4 architecture as outlined in the technical documentation.

## Core Requirements
1. **Type Safety**: 100% type safety using TypeScript 5.x. Zero `any` or `ignoreLint`.
2. **Context System**: Reach, nested `MessageContext` with auto-bind actions.
3. **Signal System**: Transformer-based outgoing message pipeline.
4. **Command System**: Declarative, chainable API with typed argument parsing.
5. **Management API**: Fluent interfaces for Groups, Communities, and Newsletters.
6. **Backward Compatibility**: Optional `compat` layer for V3 -> V4 transition.

## Architecture Guidelines
- **Directory Structure**: As defined in `tech-docs-v4.txt` section 3.
- **Dependencies**: Use `eventemitter3` for events, `lmdb` for storage, `radashi` for utilities.
- **Performance**: Optimized `normalizeText` with pre-compiled regex.

## Phase 1: Foundation Cleanup (Scope)
- **Utils**: Text, JID, Media, ID.
- **Types**: Base types, ClientOptions.
- **Store**: LRU-cache and LMDB abstraction.
- **Testing**: Vitest unit tests for all components.

---
*Signed by: GSD Architect*
