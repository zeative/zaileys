# Zaileys v4 — Dependency Justification

**Last audit:** 2026-06-01
**Policy:** Every dependency MUST be justified here. If it cannot be justified, it is removed from `package.json`.

Zaileys v4 is a **single package** (no workspaces). Media processing that used to live in
`@zaileys/media-process` is now inlined under `src/media`.

## Runtime dependencies (`dependencies`)

### baileys — `^7.0.0-rc13`
Core WhatsApp Web (multi-device) protocol; every WA operation delegates here. `rc13` patches the
message-spoofing vulnerability **CVE-2026-48063** and adds TC tokens / album / LID support.
Consumers: `src/connection`, `src/auth`, `src/store`, `src/events`, `src/builder`.

### @ffmpeg-installer/ffmpeg — `^1.1.0`
Ships a prebuilt `ffmpeg` binary for audio/video/sticker transforms. Imported **lazily** and
wrapped in try/catch — when no prebuilt exists for the platform (e.g. Termux/Android) the code
falls back to a `ffmpeg` on `PATH`. Consumers: `src/media/ffmpeg`.

### @ffprobe-installer/ffprobe — `^2.1.2`
Prebuilt `ffprobe` for media duration probing (video thumbnail timing, animated-sticker length).
Same lazy + PATH-fallback contract as the ffmpeg installer. Consumers: `src/media/ffmpeg`.

### file-type — `^21.1.1`
Magic-byte media-type detection. **ESM-only** — loaded via dynamic `import()` (helper
`detectFileType`) so the CJS bundle never top-level-`require()`s it (keeps Bun/Deno/Node<22
working). Consumers: `src/media`, `src/builder/media-loader.ts`.

### jimp — `^1.6.0`
Pure-JS image processing (thumbnail, resize, sticker shaping). The default media path; if the
optional `sharp` accelerator is installed it is used instead. Consumers: `src/media/ffmpeg/image.ts`.

### node-webpmux — `^3.2.1`
Reads/writes WebP EXIF to embed sticker-pack metadata. Consumers: `src/media/ffmpeg/sticker.ts`.

### audio-decode — `^2.2.3`
Decodes audio metadata for PTT/voice notes (waveform + duration). Consumers: `src/media/ffmpeg/audio.ts`.

### async-mutex — `^0.5.0`
Locking for concurrent writes in the storage adapters; matches Baileys' own upstream usage.
Consumers: `src/auth`, `src/store`, `src/automation`.

### lru-cache — `^11.2.7`
LRU layer over the signal-key store (`makeCacheableSignalKeyStore` pattern). Consumers: `src/auth`.

### pino — `^10.x`
Logger interface accepted by the Baileys socket config. Consumers: `src/utils/logger.ts`, `src/connection`.

### qrcode-terminal — `^0.12.0`
Renders the login QR in the terminal (rc13 `wa.me/settings/linked_devices#` format). Consumers: `src/connection`.

### nanospinner — `^1.2.2`
Lightweight connection-lifecycle spinner, gated by `process.stdout.isTTY` (silent on servers). Consumers: `src/connection`.

### valibot — `^1.2.0`
Tiny (~1kb) tree-shakable runtime schema validation for `Client` options and builder arguments.
Consumers: `src/client`, `src/builder`.

## Optional peer dependencies (storage)

Storage adapters ship as **optional** peers (`peerDependenciesMeta.*.optional = true`). Users install
only the backend they use; a missing peer throws `STORE_NOT_AVAILABLE` instead of crashing install.

| Peer | Version | Backs | Install |
| ---- | ------- | ----- | ------- |
| `better-sqlite3` | `^11.0.0` | `SqliteAuthStore` / `SqliteMessageStore` | `pnpm add better-sqlite3` |
| `redis` | `^4.7.0` | `RedisAuthStore` / `RedisMessageStore` | `pnpm add redis` |
| `pg` | `^8.11.0` | `PostgresAuthStore` / `PostgresMessageStore` | `pnpm add pg` |
| `convex` | `^1.0.0` | `ConvexAuthStore` / `ConvexMessageStore` (requires deploying `examples/convex/`) | `pnpm add convex` |

## Optional accelerator (not declared)

### sharp
A faster native image processor. **Not** declared in `package.json` — loaded opportunistically
(`require` → dynamic `import` fallback) when the user has it installed; otherwise Zaileys uses the
bundled `jimp` path. Marked `external` in the bundler so it is never bundled.

## Dev dependencies (highlights)

- **@typescript/native-preview (tsgo)** — primary TS 7 compiler for typecheck; **typescript** kept as the `.d.ts`-emit / `typecheck:legacy` fallback.
- **tsup** — dual ESM/CJS + `.d.ts`/`.d.cts` bundling. A post-build `onSuccess` rewrites all node builtins to the `node:` protocol (Deno/strict-runtime compatibility).
- **vitest** + **pg-mem** — test runner and a pure-JS Postgres simulator (no live DB in CI).
- **@types/better-sqlite3**, **@types/pg** — adapter test typings.
- **@changesets/cli**, **@commitlint/cli**, **husky** — release + commit tooling.

Real Postgres/Redis integration runs only when `DATABASE_URL` / `REDIS_URL` are set (skipped otherwise).

## Removed since v3

- **@seald-io/nedb**, **lmdb** — replaced by the pluggable `AuthStore`/`MessageStore` interfaces (`file` default, `sqlite` for embedded).
- **figlet**, **gradient-string** — ASCII banner removed; v4 is silent-by-default.
- **radashi** — single helper inlined.
- **@zaileys/media-process** workspace — media inlined into `src/media`.

## Audit checklist
- [x] Every `dependencies` key in `package.json` has a `###` entry above
- [x] Every optional peer is listed with its backing adapter
- [x] No dependency appears twice; nothing in `package.json` is undocumented
