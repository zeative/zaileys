# Zaileys v4 Dependency Justification

**Last audit:** 2026-05-29
**Policy:** Setiap dependency MUST dijustifikasi di sini. Jika tidak ada justifikasi, dep harus dihapus dari package.json.

## Runtime Dependencies (root)

### baileys
- **Version:** ^7.0.0-rc13
- **Purpose:** Core WhatsApp Web protocol — semua logic WA didelegate ke library ini
- **Alternatives considered:** whatsmeow (Go, tidak compatible), whatsapp-web.js (less protocol coverage, no rc13 features)
- **Decision rationale:** Upstream resmi, rc13 patch CVE-2026-48063, support TC tokens/album/LID
- **Consumers:** src/connection, src/auth, src/store, src/events (semua subsistem)

### @zaileys/media-process
- **Version:** workspace:*
- **Purpose:** Native ffmpeg spawn wrapper untuk media (audio/video/image/sticker/document)
- **Alternatives:** sharp+jimp (deprecated commit 8bc790d), fluent-ffmpeg (overhead)
- **Decision:** Internal workspace, native ffmpeg spawn = zero native binary install pain
- **Consumers:** Phase 5 builder media chain

### async-mutex
- **Version:** ^0.5.0
- **Purpose:** Mutex untuk concurrent writes di AuthStore adapters (Phase 2)
- **Alternatives:** p-queue (overkill — kita butuh Lock saja), @reduxjs/toolkit createAsyncThunk (irrelevant)
- **Decision:** Baileys sendiri pakai async-mutex — match upstream peer expectation
- **Consumers:** Phase 2 AuthStore/MessageStore adapters

### lru-cache
- **Version:** ^11.2.7
- **Purpose:** LRU layer di atas SignalKeyStore (makeCacheableSignalKeyStore pattern dari Baileys)
- **Alternatives:** Native Map dengan manual eviction (~50 LoC, less battle-tested)
- **Decision:** Baileys pakai lru-cache di prod hot path — match
- **Consumers:** Phase 2 AuthStore caching layer

### pino
- **Version:** ^10.1.0 (verify kompatibel dgn baileys ^9.6 peer — bump down jika perlu)
- **Purpose:** Logger interface yang diterima Baileys WASocket config
- **Alternatives:** winston (heavier), bunyan (abandoned), console.log
- **Decision:** Baileys WASocket menerima Pino-compatible logger; matching version mengurangi peer warning
- **Consumers:** src/utils/logger.ts (Phase 1 stub), src/connection (Phase 3)
- **NOTE:** Audit version — Baileys deps mendeklarasikan pino@^9.6. Downgrade ke ^9.6 untuk hindari dual-version

### qrcode-terminal
- **Version:** ^0.12.0
- **Purpose:** Render QR code di terminal untuk pairing flow
- **Alternatives:** qrcode (image output), node-qrcode-terminal (less maintained)
- **Decision:** Stable, zero-dep, support QR rc13 baru (lower ECC, longer URL prefix `wa.me/settings/linked_devices#`)
- **Consumers:** Phase 3 connection QR display

### nanospinner
- **Version:** ^1.2.2
- **Purpose:** Terminal spinner untuk connection lifecycle UX
- **Alternatives:** ora (heavier ~10kb), kleur+manual (DIY)
- **Decision:** Lightweight, no chalk dep. Gated by `process.stdout.isTTY` (silent in server)
- **Consumers:** Phase 3 connection feedback

### valibot
- **Version:** ^1.2.0
- **Purpose:** Runtime schema validation untuk `Client` options + builder arg validation
- **Alternatives:** zod (heavier, slower), arktype (alpha), manual TS guards (no runtime safety)
- **Decision:** Smallest schema lib (~1kb), tree-shakable, TypeScript-native inference
- **Consumers:** src/client/options.ts (Phase 3), src/builder (Phase 5)

### audio-decode
- **Version:** ^2.2.3
- **Purpose:** Decode audio buffer metadata (sample rate, channels) untuk PTT/voice note
- **Alternatives:** music-metadata (Baileys sudah pakai — REUSE itu langsung jika cukup), ffprobe spawn
- **Decision:** EVALUATE — jika music-metadata (transitive via baileys) cukup, HAPUS audio-decode
- **Status:** KEEP for Phase 5 audio metadata extraction; re-evaluate jika music-metadata transitive coverage confirmed (Phase 5)

## Removed Dependencies (v3 → v4)

### @seald-io/nedb — REMOVED
- **Why removed:** v4 architecture mengabstraksi storage via AuthStore/MessageStore interface (Phase 2). Default adapter adalah file-JSON, bukan NeDB. NeDB punya scaling limit ~10MB datafile (per CONCERNS.md).
- **Replacement:** Phase 2 FileAuthStore (JSON file per key, atomic writes via fs.rename)

### lmdb — REMOVED
- **Why removed:** Listed di optionalDependencies tapi `grep -r "lmdb" src/` tanpa hit (per CONCERNS.md L213-216). Bloated install footprint dengan native binaries tidak terpakai.
- **Replacement:** None — jika user butuh fast embedded storage, SqliteAuthStore (Phase 2) lebih portable

### figlet — REMOVED
- **Why removed:** ASCII art banner di library headless = noise produksi. v4 fokus DX silent-by-default.
- **Replacement:** Optional `showBanner: true` opt-in di Phase 3 dengan simple console.log + chalk-free

### gradient-string — REMOVED
- **Why removed:** Pasangan figlet — tidak relevan tanpa banner
- **Replacement:** None

### radashi — REMOVED
- **Why removed:** Hanya 1 fungsi `_.cluster` dipakai (CONCERNS.md L226-230). Heavy dep untuk satu utility.
- **Replacement:** Inline `chunk()` 3-line helper di `src/utils/array.ts` (Phase 1 plan-007 atau plan-006 utils)

### jimp (jika ada di root) — REMOVED
- **Why removed:** Sharp deprecated (commit 8bc790d), ffmpeg native spawn handle semua transform image
- **Replacement:** ffmpeg image processor di @zaileys/media-process
- **Note:** jimp TETAP dipertahankan di `packages/media-process/package.json` karena masih dipakai di `packages/media-process/src/ffmpeg/image.ts` (sticker resize fallback via Jimp). Root tidak pernah declare jimp — confirmed audit.

### typescript (^5.9.3 → ^6.0.3) — KEPT sebagai fallback compiler untuk d.ts emit
- **Why kept:** Primary compiler @typescript/native-preview (TS 7 beta / Project Corsa / tsgo). TypeScript stable (^6.0.3) tetap di devDependencies sebagai fallback untuk d.ts emit jika tsgo belum support (per plan-005 audit) dan untuk `typecheck:legacy` validation.
- **Action:** Bump dari ^5.9.3 ke ^6.0.3 (TS 6 sudah stable per npm registry 2026-05-29). Lihat plan-003.

## DevDependencies (root)

### @changesets/cli, @commitlint/cli, @commitlint/config-conventional, husky
- **Keep:** Existing tooling jalan baik. No change.

### @types/node
- **Version:** ^24.10.1 — align dengan workspace mysql-adapter (currently ^20.11.0 — bump ke ^24 di Phase 2)
- **Keep**

### @types/qrcode-terminal
- **Keep**

### tsup
- **Version:** ^8.5.1 (verify kompatibel dengan TS 7 beta — lihat plan-003 audit)
- **Keep**

### tsx
- **Version:** ^4.21.0 — esbuild internal, independent dari TS compiler choice
- **Keep**

### vitest (NEW)
- **Version:** ^2.x (latest stable)
- **Purpose:** Test runner ESM-native untuk per-phase unit tests
- **Decision:** Phase 1 setup minimal config supaya Phase 2+ langsung pakai
- **Added in plan-008**

## Workspaces

### packages/media-process
- **Status:** KEEP. Phase 5 dependency.
- **Internal audit:** jimp masih ACTIVE dipakai di `src/ffmpeg/image.ts` (Jimp import + sticker resize fallback). TIDAK dihapus dari `packages/media-process/package.json` — masih essential untuk image processing path post-refactor 8bc790d.

### packages/mysql-adapter
- **Status:** EVALUATE for v4 — di v4 arsitektur, ini akan replaced oleh built-in PostgresAuthStore/PostgresMessageStore (Phase 2).
- **Decision:** Keep workspace folder, but mark as DEPRECATED. Will be removed at Phase 2 in favor of built-in adapters.

## Phase 2 — Storage Peer Dependencies (optional)

Storage adapters added in Phase 2 plans 004–006 ship as **optional peer dependencies**. End-users only install the backend they actually use; the library degrades gracefully (throws `STORE_NOT_AVAILABLE` when a peer is missing).

### better-sqlite3
- **Version:** ^11.0.0
- **Purpose:** Embedded SQLite driver for `SqliteAuthStore` and `SqliteMessageStore` (plan-004, plan-006)
- **Why this one:** Industry-standard synchronous API, prebuilt binaries for Node 18–22, fastest prepared statements in the ecosystem; matches Baileys' upstream recommendation for embedded persistence
- **Install:** `pnpm add better-sqlite3`
- **Status:** peerDependency (optional)

### redis
- **Version:** ^4.7.0
- **Purpose:** Official node-redis v4 client for `RedisAuthStore` and `RedisMessageStore` (plan-005)
- **Why this one:** Modern Promise-based API (v4 series), first-party Redis client, supports SCAN/HSET/Stream commands required by adapter migrations
- **Install:** `pnpm add redis`
- **Status:** peerDependency (optional)

### pg
- **Version:** ^8.11.0
- **Purpose:** node-postgres driver for `PostgresAuthStore` and `PostgresMessageStore` (plan-006)
- **Why this one:** Accepts caller-owned `Pool` (zero connection leaks for embedded use), supports `ON CONFLICT` upsert, dominant Node Postgres client
- **Install:** `pnpm add pg`
- **Status:** peerDependency (optional)

### Dev-only test helpers
The following live in `devDependencies` ONLY — never shipped to consumers — and exist to enable CI + unit testing without provisioning live infrastructure:

- **@types/better-sqlite3** — type declarations for tests/scripts that touch the better-sqlite3 surface
- **@types/pg** — type declarations for the postgres adapter tests
- **pg-mem** — pure-JS Postgres simulator used by every `PostgresAuthStore` / `PostgresMessageStore` unit test (replaces a live Postgres server in CI)

Real Postgres / Redis integration is exercised via the cross-backend matrix when `DATABASE_URL` / `REDIS_URL` are set in the environment (skipped otherwise).

## Audit Checklist
- [x] Every `dependencies` key in `package.json` appears as `### {name}` heading above
- [x] Every removed dep listed under "Removed Dependencies" with reason
- [x] No dep listed twice
- [x] No dep in package.json without entry here
