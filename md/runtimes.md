# Runtime Support

> Source: https://zeative.github.io/zaileys/runtimes

# Runtime Support

Zaileys ships **dual ESM and CommonJS** entry points (`dist/index.mjs` + `dist/index.cjs`) with
matching type declarations (`dist/index.d.ts` + `dist/index.d.cts`). The same package runs on
Node.js, Bun, Deno, and Termux (Android) — both `import` and `require('zaileys')` resolve correctly
through the `exports` map.

```typescript
```

```javascript
const { Client } = require('zaileys')       // CommonJS
```

## Compatibility matrix

| Runtime | Minimum | ESM (`import`) | CJS (`require`) | Notes |
| ------- | ------- | -------------- | --------------- | ----- |
| Node.js | `>=20.0.0` | ✅ | ✅ | Primary target (`engines.node`) |
| Bun | latest | ✅ | ✅ | Runs both bundles + TypeScript directly |
| Deno | latest | ✅ | ✅ | Needs `--node-modules-dir` for npm deps |
| Termux (Android) | Node 20+ | ✅ | ✅ | Install with `--legacy-peer-deps` (skips native `sharp`) |

  The `exports` map in `package.json` resolves `types` → `import` → `require` automatically.
  TypeScript users should set `"module": "NodeNext"` (or `"Node16"` / `"Bundler"`) so the compiler
  picks the right declaration file. See [Installation](/installation) for the full setup.

## ESM vs CommonJS

The package is `"type": "module"` with a fully specified `exports` field:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    }
  }
}
```

That means both styles are first-class — pick whichever matches your project:

  
    ```typescript

    const client = new Client({
      authType: 'pairing',
      phoneNumber: 628000000000,
    })

    client.on('connect', ({ me }) => console.log('connected as', me.id))
    await client.connect()
    ```
  
  
    ```javascript
    const { Client } = require('zaileys')

    const client = new Client({
      authType: 'pairing',
      phoneNumber: 628000000000,
    })

    client.on('connect', ({ me }) => console.log('connected as', me.id))
    client.connect()
    ```
  

  Internally the published bundle rewrites all Node built-ins to the `node:` protocol
  (`node:fs/promises`, `node:path`, `node:child_process`, …). This is what lets the same bundle
  load on stricter runtimes like Deno without extra configuration.

## Node.js

Node.js is the primary target. Any release `>=20.0.0` works; LTS (20/22/24) is recommended.

### Install

  
    ```bash
    npm install zaileys
    ```
  
  
    ```bash
    pnpm add zaileys
    ```
  
  
    ```bash
    yarn add zaileys
    ```
  

### Run

```bash
# Compile then run
node dist/bot.js

# Or run TypeScript directly with tsx (no build step)
npx tsx bot.ts
```

  Node 18 and below are not supported. The library uses modern APIs (top-level `await` in examples,
  global `fetch`) and is published targeting ES2022. Upgrade to Node 20+ if you see syntax or
  resolution errors.

## Bun

Bun runs both the ESM and CJS bundles directly and executes TypeScript natively, so there is no
separate build step.

### Install

```bash
bun add zaileys
```

### Run

```bash
# Bun runs .ts files directly
bun run bot.ts
```

```typescript

const client = new Client({ authType: 'qr' })
await client.connect()
```

  Bun may print WebSocket upgrade-event warnings (for example about the `ws` `upgrade` listener)
  while the WhatsApp socket connects. These come from Bun's `ws` compatibility layer and are
  harmless — the connection still establishes normally. If they are noisy, lower the
  [logger level](/configuration) or filter Bun's diagnostics.

  Native peer dependencies (`better-sqlite3`, `pg`, `redis`) install fine under Bun. Bun runs their
  prebuilt binaries when available; if a package has no Bun-compatible prebuild it falls back to a
  source build, which needs the platform build tools described under Termux below.

## Deno

Deno can run Zaileys through the `npm:` specifier or from a local `node_modules` directory. Because
the bundle uses the `node:` protocol for every built-in, no shimming is required — but npm
dependencies must be materialized to disk.

### Install dependencies to disk

```bash
deno cache --node-modules-dir npm:zaileys
```

### Run with a node_modules directory

```bash
deno run --node-modules-dir --allow-all bot.ts
```

```typescript

const client = new Client({ authType: 'qr' })
await client.connect()
```

  The `--node-modules-dir` flag is **required**. Several dependencies (Baileys, the storage adapters,
  the bundled ffmpeg/ffprobe binaries) expect a real `node_modules` layout and the ability to spawn
  child processes, which Deno's virtual npm cache does not provide. Without it, media conversion and
  the native storage adapters will fail to resolve.

  Grant the permissions Zaileys needs: file access for the auth/session store (`--allow-read`,
  `--allow-write`), network for the WhatsApp socket (`--allow-net`), running ffmpeg/ffprobe
  (`--allow-run`), and environment access (`--allow-env`). `--allow-all` covers all of them while
  prototyping.

## Termux (Android)

Termux installs Zaileys as a normal Node project. The recommended install skips the native
`sharp` accelerator — Baileys declares `sharp` as a peer dependency, so a plain `npm install`
tries to compile it from source and **fails on Android** (no prebuilt ARM binary, missing
`libvips`/`node-addon-api`). Zaileys never needs `sharp`: image processing falls back to the
bundled pure-JS `jimp` path automatically.

### Install Node and ffmpeg

```bash
pkg update && pkg upgrade
pkg install nodejs-lts ffmpeg
```

### Install Zaileys (skips the native sharp peer)

```bash
npm install zaileys --legacy-peer-deps
```

`--legacy-peer-deps` stops npm from auto-installing Baileys' optional `sharp` peer, so the
install never touches `node-gyp`. Everything Zaileys needs (`baileys`, `jimp`, `audio-decode`,
the bundled ffmpeg binaries) installs normally.

### Run

```bash
npx tsx bot.ts
# or: node dist/bot.js
```

  Plain `npm install zaileys` on Termux fails with `sharp ... command failed ... node install/build.js`.
  That is **not** a Zaileys bug — it is Baileys' `sharp` peer trying to build from source. Use
  `--legacy-peer-deps` (above) to skip it, or install the build toolchain
  (`pkg install python make clang`) first if you genuinely want the native `sharp` accelerator.

  Zaileys bundles `ffmpeg` and `ffprobe` binaries via `@ffmpeg-installer/ffmpeg` /
  `@ffprobe-installer/ffprobe`. When no Android/ARM prebuilt binary exists, it falls back to an
  `ffmpeg` found on `PATH` — that is why `pkg install ffmpeg` is in the setup above. Media features
  (stickers, voice notes, video thumbnails) depend on ffmpeg being reachable one way or the other.

  Native add-ons such as `better-sqlite3` and `sharp` compile from source on Termux because prebuilt
  binaries rarely ship for Android. If you skip `sharp` with `--legacy-peer-deps` (above) you get a
  fully working bot on the pure-JS `jimp` path. Only install `python make clang` if you specifically
  need a native add-on — e.g. the SQLite storage adapter; otherwise prefer the in-memory or file
  storage adapter (see [Storage Adapters](/storage)) and the bundled `jimp` fallback.

## Native dependencies per runtime

Zaileys keeps heavy native modules **optional**. They are declared as optional peer dependencies and
loaded lazily, so the core library installs and runs without any compiler.

| Dependency | Used for | Required? | Fallback |
| ---------- | -------- | --------- | -------- |
| `better-sqlite3` | SQLite auth/message storage adapter | Optional peer | Use file / memory / Postgres / Redis adapters |
| `pg` | Postgres storage adapter | Optional peer | Use another adapter |
| `redis` | Redis storage adapter | Optional peer | Use another adapter |
| `convex` | Convex storage adapter | Optional peer | Use another adapter |
| `sharp` | Fast image/sticker processing | Not declared — opportunistic | Bundled `jimp` (pure JS) |
| ffmpeg / ffprobe | Audio/video/sticker conversion | Bundled binaries | `ffmpeg` on `PATH` |

### sharp (image acceleration)

`sharp` is **not** a declared dependency of Zaileys. Zaileys probes for it at runtime using a hybrid
loader (`require('sharp')` first, then dynamic `import('sharp')`), so it works in both ESM and CJS
bundles. If `sharp` is absent or fails to load, image and sticker processing automatically fall back
to the bundled pure-JS `jimp` path. Install it only when you want the faster native path:

```bash
npm i sharp
```

  `sharp` *is* pulled in transitively as a peer dependency of **Baileys**, and npm auto-installs it
  on a normal `npm install`. On platforms with no prebuilt `sharp` binary (notably **Termux/Android**,
  and some Alpine/musl setups) that triggers a source build that can fail. Install with
  `npm install zaileys --legacy-peer-deps` to skip it and run on the `jimp` fallback.

  On Bun and Node with a matching prebuilt, `sharp` installs without a compiler. On Termux it
  compiles from source — if that is impractical, simply omit it and rely on the `jimp` fallback.

### better-sqlite3 and other storage adapters

Storage adapters are wired through optional peer dependencies. Install only the driver for the
backend you actually use:

  
    ```bash
    npm i better-sqlite3   # SQLite
    npm i pg               # Postgres
    npm i redis            # Redis
    ```
  
  
    ```bash
    pnpm add better-sqlite3
    pnpm add pg
    pnpm add redis
    ```
  
  
    ```bash
    yarn add better-sqlite3
    yarn add pg
    yarn add redis
    ```
  
  
    ```bash
    bun add better-sqlite3
    bun add pg
    bun add redis
    ```
  

  With pnpm, `better-sqlite3` is listed under `onlyBuiltDependencies` so its native build runs during
  install. If you skip these drivers, the file and in-memory adapters keep Zaileys fully functional —
  see [Storage Adapters](/storage) for the full list and configuration.

## Quick reference

- **Node.js** — `>=20.0.0`; the primary, fully supported runtime.
- **Bun** — `bun add zaileys`, runs `.ts` directly; ignore harmless `ws` upgrade warnings.
- **Deno** — `import 'npm:zaileys'`, always run with `--node-modules-dir` plus the right permissions.
- **Termux** — install with `npm install zaileys --legacy-peer-deps` (skips Baileys' native `sharp`
  peer that fails to compile on Android); `pkg install nodejs-lts ffmpeg`; prefer file/memory storage
  and the `jimp` fallback.

For platform-agnostic install steps see [Installation](/installation), for picking a session backend
see [Storage Adapters](/storage), and for runtime-specific failures see
[Troubleshooting](/troubleshooting).
