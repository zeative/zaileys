# Project State: Zaileys

## 🏗️ Architecture
Zaileys is a high-level, type-safe wrapper for the Baileys WhatsApp library. It follows a layered, modular architecture focused on performance and developer experience.

### Core Components
- **Client (src/Classes/client.ts)**: The main entry point. Uses a `class-proxy` to combine multiple specialized classes (`Signal`, `SignalGroup`, `SignalPrivacy`, etc.) into a single interface.
- **Unified Store (src/Store/unified-store.ts)**: Implements a Registry Pattern. Provides namespaced memory stores using `LRUCache` for efficiency and `async-mutex` for thread safety.
- **Fire & Forget (src/Library/fire-forget.ts)**: A prioritized task execution engine. Handles background operations with configurable concurrency, timeouts, and retries.
- **Plugin System (src/Classes/plugins.ts)**: Automatically loads plugins from a directory with Hot Module Replacement (HMR) support.
- **Middleware (src/Classes/middleware.ts)**: Allows intercepting and processing events globally.

### Data Flow
1. **Events**: WhatsApp socket events are received by `Listener`.
2. **Context**: Events are wrapped into a rich `Context` object.
3. **Execution**: Handlers (listeners or plugins) are executed, often utilizing `fireForget` for non-blocking actions.
4. **Storage**: Persistent data (sessions, chats) is stored in `LMDB` via `Store` modules.

## 🛠️ Stack
- **Runtime**: Node.js (v20+)
- **Language**: TypeScript (v5+)
- **Base Library**: `baileys` (v7)
- **Database**: `lmdb`
- **Validation**: `valibot`
- **Utilities**: `radashi`, `gradient-string`, `figlet`, `nanospinner`
- **Logging**: `pino`
- **Build Tool**: `tsup`
- **Package Manager**: `pnpm`

## 📏 Conventions
- **Validation**: Always use `valibot` for external inputs or configuration.
- **Async Safety**: Use `async-mutex` for operations modifying shared state in `UnifiedStore`.
- **Background Work**: Wrap long-running or non-critical operations in `fireForget.add()`.
- **Namespacing**: Use the `store.ns(name)` pattern for all internal state.
- **Type Safety**: Prefer `v.InferOutput` for working with validated schemas.

Working on: Working on nothing