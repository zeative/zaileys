# ROADMAP.md

> **Current Milestone**: Zaileys V4 Migration - Core & Foundation
> **Goal**: Rebuild Zaileys from the ground up as a modern, type-safe, and modular WhatsApp bot framework.

## Must-Haves
- [ ] 100% Type-safety (zero ignoreLint)
- [ ] Modular Signal System (Transformers)
- [ ] Declarative Command System (Router & Parser)
- [ ] Fluent Management API (Group/Community/Newsletter)
- [ ] Backward Compatibility Layer (V3 Compat)

## Phases

### Phase 1: Foundation Cleanout & Core Utilities
**Status**: ✅ Complete
**Objective**: Establish the core utilities, base types, and high-performance storage layer.
- [x] **1.1 Text Utils**: Implement optimized `normalizeText` with pre-compiled regex.
- [x] **1.2 JID Utils**: Implement `cleanJid`, `resolveJids`, and `jidToName`.
- [x] **1.3 Media Utils**: Implement `cleanMediaObject` for buffer/URL handling.
- [x] **1.4 ID Utils**: Implement `generateId` for message hashing.
- [x] **1.5 Core Types**: Define `ClientOptions`, base interfaces, and `index.ts` exports.
- [x] **1.6 Store Layer**: Initialize LRU-cache using `eventemitter3`.
- [x] **1.7 Database**: Implement LMDB abstraction with scoped access.
- [x] **1.8 Testing**: Setup unit tests for all foundation utilities.

### Phase 2: Context System (The Heart of V4)
**Status**: ✅ Complete
**Objective**: Build the rich, nested `MessageContext` that powers the developer experience.
- [x] **2.1 Context Types**: Define `MessageContext`, `RoomType`, `DeviceType`, and `MessageType`.
- [x] **2.2 Context Actions**: Implement `ctx.send`, `ctx.reply`, `ctx.react`, and `ctx.presence`.
- [x] **2.3 Builder Core**: Implement `MessageContextBuilder` with `isValidMessage` guard.
- [x] **2.4 Content Resolver**: Implement `extractContent` for all WA payload types.
- [x] **2.5 Metadata Parser**: Extract Room, Sender, and Receiver metadata.
- [x] **2.6 Flag System**: Compute flags (isGroup, isBot, isSpam, isForwarded, etc.).
- [x] **2.7 Reply Chain**: Implement recursive `buildReplied` logic with max depth depth.
- [x] **2.8 Shorthand**: Setup root-level getters for `text`, `type`, `media`, `mentions`.
- [x] **2.9 Integration**: Connect `ContextActions` to the context builder.

### Phase 3: Signal System (Transformer Pipeline)
**Status**: ⬜ Not Started
**Objective**: Implement the modular transformer pipeline for outgoing messages.
- [ ] **3.1 Resolver**: Implement intelligent payload type detection.
- [ ] **3.2 Signal Engine**: Build the core `SignalEngine` for managing the send pipeline.
- [ ] **3.3 SentMessage**: Implement `SentMessage` class with rich methods (edit, delete, react).
- [ ] **3.4 Transformer: Text**: Support plain text and auto-mentions.
- [ ] **3.5 Transformer: Image**: Support Buffer/URL with auto-thumbnailing.
- [ ] **3.6 Transformer: Video**: Support MP4 with caption and PTV mode.
- [ ] **3.7 Transformer: Audio**: Support Opus/MP3 with Voice/PTT switch.
- [ ] **3.8 Transformer: Sticker**: Support WebP with shape metadata.
- [ ] **3.9 Transformer: Document**: Support Filename and Mimetype.
- [ ] **3.10 Transformer: Location**: Implement Lat/Lng shorthand transformer.
- [ ] **3.11 Transformer: Contact**: Implement VCard generation for single/multi-contacts.
- [ ] **3.12 Transformer: Poll**: Implement semantic poll payload construction.
- [ ] **3.13 Transformer: Buttons**: Build the generic button transformer.
- [ ] **3.14 Button Detector**: Implement auto-detect logic (Simple/Interactive/Carousel/List).
- [ ] **3.15 Middleware**: Implement `useSignal` pipeline support.

### Phase 4: Command System (Declarative API)
**Status**: ⬜ Not Started
**Objective**: Build a powerful, chainable command system with typed argument parsing.
- [ ] **4.1 Registry**: Implement command storage and lookup logic.
- [ ] **4.2 ArgParser Core**: Implement `tokenize` with quoted string support.
- [ ] **4.3 Flag Parser**: Parse `--key value` and boolean flags.
- [ ] **4.4 Schema Mapper**: Implement `typedArgs` mapping from `ArgDefinition`.
- [ ] **4.5 Router API**: Implement command grouping and prefix management.
- [ ] **4.6 Executor**: Implement async middleware execution chain with `.use()`.
- [ ] **4.7 File Loader**: Recursive folder scanner and auto-router mapping (Folder -> Prefix).
- [ ] **4.8 Help Menu**: Implement auto-generator from command metadata.
- [ ] **4.9 Guards**: Implement `onlyGroup`, `onlyAdmin`, `cooldown`, and `rateLimit`.

### Phase 5: Management API (Fluent Interface)
**Status**: ⬜ Not Started
**Objective**: Implement the unified `wa.group()`, `wa.community()`, and `wa.newsletter()` APIs.
- [ ] **5.1 Group Members**: Implement add, remove, promote, demote with participants result.
- [ ] **5.2 Group Permissions**: Toggle messaging, info, and member add modes.
- [ ] **5.3 Group Profile**: Manage name, description, and avatar (with deletion).
- [ ] **5.4 Group Invite**: Get link/code, revoke, join info, and code join.
- [ ] **5.5 Group Requests**: Approval pipeline for join requests.
- [ ] **5.6 Group Factory**: Bulk group creation and participating group fetcher.
- [ ] **5.7 Community**: Implement linking/unlinking groups and community-specific permissions.
- [ ] **5.8 Newsletter**: Post management, reaction support, and admin/subscriber listing.
- [ ] **5.9 Privacy**: Unified PrivacyManager for LastSeen, Online, Blocklist, etc.

### Phase 6: Core Lifecycle & Connection
**Status**: ⬜ Not Started
**Objective**: Setup the bot lifecycle and listener management.
- [ ] **6.1 Client Core**: Implement the main `Client` entry point class.
- [ ] **6.2 Lifecycle**: Manage connection state machine and eventemitter3 integration.
- [ ] **6.3 Listener: Connection**: Implement Auth (QR/Pairing) and Reconnect strategy.
- [ ] **6.4 Listener: Message**: integrate builder with global middleware and router.
- [ ] **6.5 Health**: Implement `HealthManager` watchdog and `CleanupManager`.

### Phase 7: Backward Compatibility (Compat Layer)
**Status**: ⬜ Not Started
**Objective**: Ensure smooth migration for V3 users with a dedicated compat module.
- [ ] **7.1 Warning Utility**: Implement single-use deprecation logging.
- [ ] **7.2 Context Proxy**: Map V3 `ctx` properties (e.g., `roomId`, `isGroup`) to V4.
- [ ] **7.3 Client Wrapper**: Implement V3 `wa.send()` and `wa.reaction()` signatures.

### Phase 8: Integration & Documentation
**Status**: ⬜ Not Started
**Objective**: Final polish, examples, and documentation update.
- [ ] **8.1 Basic Examples**: Create "Hello World" and minimal command bot examples.
- [ ] **8.2 Advanced Examples**: Create nested router and management API examples.
- [ ] **8.3 README Update**: Full V4 migration guide, API reference, and screenshots.
