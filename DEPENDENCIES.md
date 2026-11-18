# Zaileys v4 — Dependency Justification

**Last audit:** 2026-11-18
**Policy:** Every dependency MUST be justified here. If it cannot be justified, it is removed from `package.json`.

Zaileys v4 is a **single package** (no workspaces). Media processing that used to live in
`@zaileys/media-process` is now inlined under `src/media`.

## Runtime dependencies (`dependencies`)

### baileys — `^7.0.0-rc14`
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

### jimp — `^1.6.1`
Pure-JS image processing (thumbnail, resize, sticker shaping) when `sharp` is not installed, loaded with
dynamic `import()` on first use so startup does not pay for it. Also an optional peer of baileys, which
uses it for media thumbnails. Consumers: `src/media/ffmpeg/image.ts`.

### audio-decode — `^2.2.3`
Not imported by zaileys itself: it is an optional peer of baileys, which decodes audio with it to draw the
waveform on voice notes. Declared here so voice notes keep their waveform without users installing it.

### lru-cache — `^11.2.7`
Bounded, TTL-aware caches for everything keyed by remote input: rate-limit buckets, presence, pipeline
lookups, command cooldowns, group metadata, and the retry/device caches handed to baileys. Also a direct
dependency of baileys, so it adds nothing to the install. Consumers: `src/automation`, `src/events`,
`src/command`, `src/connection`, `src/domain`.

### pino — `10.3.1`
The default logger, and the logger shape the baileys socket config expects. Also a direct dependency of
baileys. Consumers: `src/utils/logger.ts`.

### qrcode-terminal — `^0.12.0`
Renders the login QR in the terminal (rc13 `wa.me/settings/linked_devices#` format). Consumers: `src/connection`.

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
- **node-webpmux** (4.19) — replaced by `src/media/ffmpeg/webp-exif.ts`, which writes the sticker EXIF chunk byte for byte as it did, without its 560 KB libwebp build.
- **async-mutex**, **nanospinner**, **valibot** (4.19) — never imported by `src/`; baileys ships its own `async-mutex`.

## Audit checklist
- [x] Every `dependencies` key in `package.json` has a `###` entry above
- [x] Every optional peer is listed with its backing adapter
- [x] No dependency appears twice; nothing in `package.json` is undocumented
