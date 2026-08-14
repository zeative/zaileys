# Installation

> Source: https://zeative.github.io/zaileys/installation

# Installation

Zaileys is published to npm as a single package, `zaileys`. It ships dual **ESM** and **CommonJS**
bundles with type declarations for both module systems, so it works the same whether you write
TypeScript, ESM JavaScript, or CommonJS JavaScript.

## Install the package

  
    ```bash
    npm i zaileys
    ```
  
  
    ```bash
    pnpm add zaileys
    ```
  
  
    ```bash
    yarn add zaileys
    ```
  
  
    ```bash
    bun add zaileys
    ```
  

That single install is everything you need for a working bot. The default `file` auth store is
zero-config and needs nothing extra — every storage backend besides `file` and the native image
accelerator are **optional** (see [below](#optional-peer-dependencies)).

## Runtime requirements

Zaileys targets Node.js **v20 or newer** (`engines.node >= 20.0.0`). It is also verified to run on
Bun, Deno, and Termux.

| Runtime | Minimum | Notes |
| ------- | ------- | ----- |
| Node.js | `>=20` | Primary target. Both `import` and `require` work. |
| Bun | latest | Runs both bundles directly — `bun add zaileys`. |
| Deno | latest | Run with `deno run --node-modules-dir` so npm deps resolve. |
| Termux (Android) | — | Install with `npm install zaileys --legacy-peer-deps` (skips the native `sharp` peer). |

For per-runtime caveats (the `node:` protocol on Deno, ffmpeg fallback on Termux, etc.) see
[Runtime Support](/runtimes).

  On **Termux/Android** (and some Alpine/musl images) a plain `npm install zaileys` fails while
  building `sharp` from source — `sharp` is a peer dependency of Baileys and has no prebuilt binary
  there. Install with `npm install zaileys --legacy-peer-deps` to skip it; image processing falls
  back to the bundled `jimp` path. `pnpm add zaileys` and `yarn add zaileys` are unaffected. See
  [Runtimes → Termux](/runtimes#termux-android).

  The published package bundles `ffmpeg` and `ffprobe` binaries for media conversion, so you do
  **not** need a system ffmpeg install on most platforms. Termux falls back to a `ffmpeg` on
  `PATH` (`pkg install ffmpeg`).

## ESM-only project setup

  Zaileys' own package is `"type": "module"`, but it ships a CommonJS build too, so it loads in
  **both** ESM and CJS projects. The snippet you copy must match *your* project's module system.

In an ESM project (your `package.json` has `"type": "module"`, or the file is `.mjs` / `.ts`
compiled to ESM), import normally:

```typescript

const client = new Client()
```

In a CommonJS project (no `"type": "module"`, or a `.cjs` file), use `require`:

```javascript
const { Client } = require('zaileys')

const client = new Client()
```

## TypeScript setup

Zaileys ships its own type declarations (`dist/index.d.ts`), so there is nothing to install from
`@types`. For the best experience use a modern module-resolution mode in your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

`module: "NodeNext"` (or `"Node16"` / `"Bundler"`) lets TypeScript pick the right entry point from
the package `exports` map automatically. `strict` is recommended — Zaileys is fully typed and the
event payloads are richest under strict mode.

A common quick way to run a TypeScript bot during development without a separate build step:

  
    ```bash
    npm i -D tsx
    npx tsx bot.ts
    ```
  
  
    ```bash
    pnpm add -D tsx
    pnpm tsx bot.ts
    ```
  
  
    ```bash
    yarn add -D tsx
    yarn tsx bot.ts
    ```
  
  
    ```bash
    # Bun runs TypeScript natively — no extra tooling
    bun run bot.ts
    ```
  

## Optional peer dependencies

Zaileys declares its storage drivers as **optional peer dependencies**. They are not installed by
default, and a missing one never breaks `npm install` — Zaileys loads each driver lazily and only
throws (`STORE_NOT_AVAILABLE`) if you actually construct an adapter whose driver is absent. Install
only the ones you use.

| Package | Install when you use… | Adapter classes |
| ------- | --------------------- | --------------- |
| `better-sqlite3` | the SQLite storage adapter | `SqliteAuthStore`, `SqliteMessageStore` |
| `pg` | the PostgreSQL storage adapter | `PostgresAuthStore`, `PostgresMessageStore` |
| `redis` | the Redis storage adapter | `RedisAuthStore`, `RedisMessageStore` |
| `convex` | the Convex storage adapter | `ConvexAuthStore`, `ConvexMessageStore` |

  The Redis adapter uses the official [`redis`](https://www.npmjs.com/package/redis) client
  (v4+), **not** `ioredis`. The default `file` auth store and the in-process `memory` stores need
  no peer dependencies at all.

  
    ```bash
    npm i better-sqlite3   # SQLite adapters
    npm i pg               # PostgreSQL adapters
    npm i redis            # Redis adapters
    npm i convex           # Convex adapters
    ```
  
  
    ```bash
    pnpm add better-sqlite3   # SQLite adapters
    pnpm add pg               # PostgreSQL adapters
    pnpm add redis            # Redis adapters
    pnpm add convex           # Convex adapters
    ```
  
  
    ```bash
    yarn add better-sqlite3   # SQLite adapters
    yarn add pg               # PostgreSQL adapters
    yarn add redis            # Redis adapters
    yarn add convex           # Convex adapters
    ```
  
  
    ```bash
    bun add better-sqlite3   # SQLite adapters
    bun add pg               # PostgreSQL adapters
    bun add redis            # Redis adapters
    bun add convex           # Convex adapters
    ```
  

`better-sqlite3` is a native module that compiles on install. With pnpm you may need to allow its
build script (`pnpm approve-builds` / the `onlyBuiltDependencies` allowlist). See
[Storage Adapters](/storage) for how to wire each backend into the client.

  For TypeScript projects also add the matching type packages as dev dependencies when needed,
  e.g. `npm i -D @types/better-sqlite3 @types/pg`. The `redis` and `convex` packages ship their
  own types.

### Native image acceleration — `sharp`

`sharp` is an **optional** accelerator for image and sticker processing. It is *not* a declared
dependency: Zaileys loads it opportunistically (in both ESM and CJS) and falls back to the bundled
pure-JS `jimp` path when it is absent, so everything works without it — just slower for heavy media
workloads.

  
    ```bash
    npm i sharp
    ```
  
  
    ```bash
    pnpm add sharp
    ```
  
  
    ```bash
    yarn add sharp
    ```
  
  
    ```bash
    bun add sharp
    ```
  

## Verify the install

After installing, confirm the package imports and constructs cleanly. By default the client
connects on construction (`autoConnect` is `true`), so for a no-side-effects smoke test pass
`autoConnect: false` and call [`connect()`](/client) yourself when ready.

### Create a smoke-test file

Save this as `verify.ts` (or `verify.mjs` for plain ESM JavaScript):

```typescript

const client = new Client({ autoConnect: false })

console.log('zaileys loaded:', typeof Client === 'function')
console.log('client constructed:', client instanceof Client)

// When you are ready to go online, start the connection explicitly:
// await client.connect()
// client.on('qr', ({ qrString }) => console.log(qrString))
```

### Run it

```bash
npx tsx verify.ts
```

You should see both lines log `true` and the process should exit without errors. If you instead
construct `new Client()` with no options, it auto-connects and prints a QR — scan it with
**WhatsApp → Linked Devices**.

  Installed and importing cleanly? Continue with [Getting Started](/getting-started) to build your
  first bot, [Configuration](/configuration) for every client option, [Storage Adapters](/storage)
  to persist auth and messages, and [Runtime Support](/runtimes) for Bun, Deno, and Termux.
