# Zaileys Engineering Rules

These rules apply to every change in this repository: features, bug fixes, refactors, docs, tests, and
releases. They exist so that code written by any contributor, human or AI, reads as if one careful
person wrote the whole library.

Read this file before you touch the code. When a rule here conflicts with an older document
(`CONTRIBUTING.md`, `RELEASE.md`), this file wins. When a rule conflicts with what the maintainer tells
you directly, the maintainer wins.

---

## 1. Before you write anything

1. **Read the neighbours first.** Open the module you are changing, its `types.ts`, `errors.ts`,
   `index.ts`, and the matching tests. New code must look like the code next to it: same naming, same
   error style, same option shape, same test layout.
2. **Search before you add.** Check whether a helper already exists (`src/utils`, `src/types`,
   module-local helpers). Duplicating `sameUser`, a JID parser, or an LRU wrapper is a defect.
3. **State the change in one sentence.** If you cannot, the change is too big. Split it.
4. **Fix the cause, not the symptom.** A bug fix starts with a failing test that reproduces the bug.
5. **Stay in scope.** No drive-by refactors, renames, or reformatting in files you did not need to
   change. Unrelated improvements go in a separate commit.
6. **Verify WhatsApp behaviour on a real device** before building on it. Protocol snippets found online
   are often wrong or version-specific. Record what you measured (device, OS, WhatsApp version, date).

---

## 2. Repository layout

```
src/
  index.ts          public entry: re-exports every module barrel, nothing else
  <module>/
    index.ts        the module's public surface (barrel)
    types.ts        public types and option interfaces for the module
    errors.ts       the module's error class and its code union
    <feature>.ts    one concept per file, kebab-case name
    adapters/       interchangeable backends behind one interface (auth, store)
tests/
  <module>/<file>.test.ts   mirrors src/<module>/<file>.ts
  contracts/                shared suites every adapter must pass
  security/                 attacker-input and hardening regressions
  integration/              several modules wired together over a mock socket
  stress/                   load, soak, and leak gates (pnpm test:stress)
  e2e/                      real WhatsApp account, opt-in only
  _helpers/, _fixtures/     shared mocks and fixture data
docs/               Mintlify site (.mdx), English
skills/zaileys/     the Agent Skill shipped with the package
examples/           runnable bots that use the public API only
scripts/            repo tooling (audits, release, benchmarks)
tasks/              local planning notes, gitignored, never referenced by shipped code
```

Rules:

- **One module per folder** under `src/`. Existing modules: `auth`, `automation`, `builder`, `client`,
  `cloud`, `command`, `connection`, `domain`, `events`, `media`, `plugin`, `store`, `transport`, `types`,
  `utils`. Add a new top-level module only when a feature does not belong to any of these.
- **Every module exposes itself through `index.ts`**, and `src/index.ts` only re-exports barrels. Never
  make users import from a deep path.
- **File names are kebab-case** (`rate-limiter.ts`, `media-loader.ts`). Test files mirror the source
  path and add `.test.ts`.
- **Nothing in `src/` imports from `tests/`, `examples/`, `scripts/`, or `tasks/`.**

---

## 3. TypeScript

The compiler runs in its strictest practical mode (`strict`, `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`). Write code
that passes it honestly.

- **ESM with explicit `.js` extensions** in relative imports: `import { x } from './parser.js'`.
- **Type-only imports use `import type`** (or inline `type` specifiers).
- **No `any`.** Enforced by `pnpm audit:any src`. Use `unknown` and narrow it, or write a proper generic.
- **`as unknown as` only at protocol boundaries**, where baileys or protobuf types are wrong or too loose.
  Never use it to silence a type error in zaileys' own code.
- **Optional properties are omitted, not set to `undefined`.** With `exactOptionalPropertyTypes`, build
  objects with conditional spreads:

  ```ts
  const opts = {
    ...(title === undefined ? {} : { title }),
    ...(footer === undefined ? {} : { footer }),
  }
  ```

- **Index access is possibly `undefined`.** Handle it (`parts[0] ?? ''`); do not assert it away with `!`
  unless the invariant is established on the line above.
- **Structural "like" types for external objects.** Depend on the smallest interface you need
  (`DomainSocketLike`, `BuilderSocketLike`, `PgPoolLike`), not on the full baileys socket or a peer
  package's class. This keeps optional peers out of the published typings and keeps code testable.
- **Inject time.** Anything that waits, schedules, or measures takes an optional clock or `sleep`
  (`RateLimiterClock`, `PresenceClock`), so tests never sleep for real.
- Prefer `export const name = (...) => {}` for functions and `class` for stateful modules with a
  lifecycle. Match the style already used in the file.

---

## 4. Formatting and comments

- **Formatting follows the existing code**: no semicolons, single quotes, two-space indent, trailing
  commas, lines up to roughly 120 characters. `.prettierrc` is out of date; do not run Prettier over
  existing files.
- **Comments: TSDoc one-liners only.** `pnpm audit:comments` rejects `//`, `/* */`, and `<!-- -->` in
  `src/`. The only allowed form is `/** ... */`.
- **Comment only what the code cannot say**: a non-obvious reason, a protocol quirk, a trap. One line.
  Never narrate what the next line does.

  ```ts
  /** Baileys uses 500 as its catch-all default, so bad-session carries no signal. */
  export const DEFAULT_CLEAR_AUTH_REASONS = ['logged-out'] as const
  ```

- **Every public option documents its default** in its TSDoc (`Default 64 MB.`,
  `Defaults to \`['logged-out']\``).

---

## 5. Errors

- **Each module owns one error class** in `errors.ts`, named `Zaileys<Module>Error`, with a string
  literal union of codes. Follow the existing shape exactly:

  ```ts
  export type BuilderErrorCode = 'INVALID_OPTIONS' | 'SEND_FAILED' | 'MEDIA_LOAD_FAILED'

  export class ZaileysBuilderError extends Error {
    readonly code: BuilderErrorCode
    override readonly cause?: unknown
    constructor(code: BuilderErrorCode, message: string, options?: { cause?: unknown }) { ... }
  }
  ```

- **Codes are SCREAMING_SNAKE_CASE and stable.** Users branch on `err.code`; renaming a code is a
  breaking change.
- **Messages say what went wrong and how to fix it**: name the method, the option, and the accepted
  values. `'htmlApp() requires a non-empty HTML string'`, not `'invalid input'`.
- **Wrap lower-level failures with `cause`**; never swallow the original error.
- **Every new code is documented** in `docs/reference/error-codes.mdx`. `pnpm docs:errors:check` fails
  otherwise.
- **Do not throw plain `Error`** from public code paths.

---

## 6. Public API and options

- **Options live in the module's `types.ts`** as an interface with TSDoc on every field. Client-level
  options are added to `ClientOptions` in `src/client/types.ts`.
- **Safe by default, with an explicit escape hatch.** A behaviour that can lose data, leak data, or be
  abused ships disabled or bounded, and the old behaviour stays reachable through a clearly named
  option (`session.clearAuthOn`, `media.allowPrivateNetwork`, `webhook.allowUnsigned`).
- **Validate options at the boundary** (constructor or builder method) and throw the module's
  `INVALID_OPTIONS`-style code with the offending value named.
- **Naming follows what users already see**: builder methods are verbs or content nouns
  (`text()`, `buttons()`, `reply()`), events are kebab-case (`button-click`, `poll-vote`) and appear in
  the plugin API as camelCase methods automatically.
- **Removing or renaming anything exported is a breaking change.** It needs the maintainer's approval,
  a `MIGRATION.md` entry, and a major-version plan.
- **Experimental protocol features** (undocumented WhatsApp primitives, reverse-engineered envelopes)
  keep every magic string in one exported constant and say "experimental" in their TSDoc and docs.

---

## 7. Sessions and credentials

Losing a user's WhatsApp session is the worst bug this library can ship. These rules are not optional.

- **Credentials are erased only on explicit logout** (`logged-out`), after reconnect confirmation.
  Never add another disconnect reason to the default erase list.
- **Back up before any erase** (`backupCreds`), and a failed backup must never block or hide the erase
  path's logging.
- **The socket never starts without loaded credentials.** `connect()` awaits `readCreds()` first.
- **The message store never touches auth keys.** Store and auth use separate key roots; any bulk delete
  is scoped to its own subtree.
- **Credential files are `0600`, directories `0700`, writes are atomic and fsynced.**
- **`sessionId` is validated** (`/^[A-Za-z0-9_-]{1,64}$/`) before it reaches a path, key, or table name.
- **Tests never write to `.zaileys/`** or any real session directory. Use a temp directory per test and
  clean it up.

---

## 8. Untrusted input

Everything that arrives from WhatsApp, a webhook, a URL, or a file is attacker-controlled.

- **Budget before you parse.** Cap length, count, bytes, and pixels before the expensive step, not after.
- **No backtracking regex on remote text.** Anything like `[.,;:!?]+$` on unbounded input is a denial of
  service. Use a linear scan.
- **Every map, set, or cache keyed by remote input is bounded** (`lru-cache`, with size and TTL). An
  unbounded `Map<jid, ...>` is a memory leak in a long-lived bot.
- **Compare identities with `sameUser()` / `matchesUser()`** from `src/utils/jid.ts`. Never compare JIDs
  by splitting strings, and never compare a resolved PN against an unresolved LID.
- **Quoted and forwarded content is a claim, not proof.** Anything rebuilt from `contextInfo` is
  `verified: false`; never use it for authorization.
- **Media loading goes through `media-loader.ts`** so the size cap, the auth-directory denylist, and the
  private-network block apply. Do not call `fetch` or `fs.readFile` on user-supplied sources directly.
- **Child processes use argv arrays**, never a shell string, and always have a timeout and a kill path.
- **Values interpolated into HTML, SQL, Redis keys, or file paths are escaped or parameterised.**
- **Secrets never reach logs or errors.** Redact connection URLs; add new secret field names to the
  logger's redaction list.

---

## 9. Long-lived process hygiene

Bots run for months on small servers. Code must not degrade over time.

- **Every timer, interval, listener, and child process has an owner that stops it** on
  `client.disconnect()` (see how `_scheduler` and `_presence` are disposed).
- **Clamp `setTimeout` delays** to the Node maximum and re-arm; longer delays fire immediately.
- **Bounded queues** with a max length, a per-task timeout, and a clear error code when full.
- **No module-level mutable state** that outlives a `Client`. State belongs to the `Client` instance,
  so two clients in one process never share it.
- **Shed load rather than corrupt state.** Under pressure, drop or delay work with a logged warning;
  never skip identity resolution or silently misattribute a message.
- Use the injected `logger` (`this.logger?.warn(...)`) for operational warnings. Never `console.log`
  from `src/`.

---

## 10. Dependencies

- **Every runtime dependency is justified in `DEPENDENCIES.md`**: why it exists, who imports it, and the
  fallback. No justification, no dependency.
- **Prefer the platform** (`node:crypto`, `node:http`, global `fetch`) over a new package.
- **Optional integrations are optional peers** (`pg`, `redis`, `better-sqlite3`, `convex`), loaded lazily,
  typed through structural `*Like` interfaces.
- **ESM-only packages are loaded with dynamic `import()`** so the CJS bundle keeps working.
- **Bundle budget is 260 KB** for each of `dist/index.mjs` and `dist/index.cjs` (`pnpm size`).
- Use pnpm only. Do not commit a `package-lock.json` or `yarn.lock`.

---

## 11. Tests

- **Vitest, `tests/` mirrors `src/`.** Import sources with relative paths
  (`../../src/automation/rate-limiter.js`).
- **`describe` names the unit and the scenario; `it` states the behaviour** in plain words:
  `it('throws RATE_LIMIT_INVALID when perSec is zero')`.
- **Assert error codes, not just classes.** Check `err.code`.
- **Use the shared mocks** in `tests/_helpers` (`mock-socket.ts`) instead of hand-rolled sockets.
- **Adapters pass the contract suites** in `tests/contracts`. A new auth or store adapter adds itself to
  them.
- **Security fixes add a regression test** in `tests/security`. Performance or leak fixes add a gate in
  `tests/stress` with a deterministic threshold.
- **No real sleeps, no real network, no real WhatsApp** outside `tests/e2e`. Use fake timers and injected
  clocks.
- **A test file must collect tests.** Anything evaluated at module scope that can throw (for example
  reading a protobuf enum) is resolved lazily, or the whole file silently reports zero tests.
- **Coverage stays at 80% or higher** for lines, branches, functions, and statements.

---

## 12. Docs, skill, and examples

A user-facing change is not done until users can find it.

- **Docs** (`docs/*.mdx`, English): update the page for the feature, the option in
  `docs/reference/client-options.mdx` or `send-builder.mdx`, and new error codes. Write for the user:
  real output, a short table, the default value, and what to do when it fails.
- **Skill** (`skills/zaileys/`): update the relevant reference when the public API or a best practice
  changes, then run `pnpm skill:check`.
- **Examples** (`examples/`): add or update one when a feature needs a runnable demonstration. Examples
  import from `../src/index.js` and use only public API.
- **Security-relevant behaviour** is described in `SECURITY.md`.
- Docs checks to run when docs change: `pnpm docs:check`, `pnpm docs:errors:check`,
  `pnpm docs:anchors:check`, `pnpm docs:search:check`.

---

## 13. Quality gates

Run these before every commit. The pre-commit hook runs the first four; CI runs all of them.

```bash
pnpm typecheck
pnpm audit:comments
pnpm audit:any src
pnpm exec vitest run            # the hook runs only --changed; run the full suite before pushing
pnpm build
pnpm size
pnpm skill:check                # when skills/ or the public API changed
```

A red gate is fixed, never bypassed. Do not use `--no-verify`, `@ts-ignore`, `@ts-expect-error` without
a documented reason, `.skip` on a failing test, or a lowered threshold.

---

## 14. Git, commits, and releases

- **Work on `main`.** The `v4` branch mirrors `main`; when you push `main`, push the same commit to `v4`
  (`git push origin main main:v4`) after confirming `v4` has no commits of its own.
- **Commit only when asked, push only when asked.**
- **Commit messages are English, Conventional Commits, one line**:
  `fix(store): parse the full chat jid when pruning convex messages`. Header 100 characters or less.
- **The subject becomes the changelog entry.** `scripts/release.mjs` builds the changelog from commit
  subjects, so write the subject as a user-readable change: lowercase imperative, no trailing period,
  no ticket numbers.
- **The type decides the version bump**: `feat` → minor, `fix`/`perf` → patch, `!` or
  `BREAKING CHANGE` → major. Use `!` only for a real breaking change the maintainer approved.
  Docs, tests, CI, and skill work use `docs`, `test`, `ci`, `chore`.
- **Behaviour changes also get a changeset** in `.changeset/` describing the change and any migration.
- **No AI attribution anywhere**: no `Co-Authored-By` for an AI, no "Generated with", no model or tool
  names in commits, PR titles, or PR bodies.
- **One logical change per commit.** Tests and docs for a change go in the same commit as the change.

---

## 15. Definition of done

A change is done when every applicable box is true:

- [ ] The code matches the surrounding module in structure, naming, errors, and options.
- [ ] A test proves the new behaviour, or reproduces the fixed bug and now passes.
- [ ] New inputs from outside are bounded, validated, and covered by a security test when relevant.
- [ ] Nothing new can leak memory, timers, or processes across `disconnect()` and reconnect.
- [ ] Public types, TSDoc (with defaults), and error codes are complete.
- [ ] Docs, skill references, and examples are updated for user-facing changes.
- [ ] All quality gates in section 13 pass locally.
- [ ] The commit message is a clean, English, one-line changelog entry, and a changeset exists for
      behaviour changes.
