# Debug Session: Libsignal Logging Override

## Symptom
The `src/Auth/creds.ts` file employs a hacky overwrite of the global `console.info` and `console.warn` methods to suppress spammy logs originating from Baileys' internal `libsignal` dependencies (like invalid pre-key warnings).

**When:** During client initialization.
**Expected:** The application should suppress these specific libsignal/Baileys warnings through a proper logging configuration or Pino logger transport filter, preserving global console behavior.
**Actual:** Global `console.info` and `console.warn` are entirely muted.

## Evidence
- `src/Auth/creds.ts:10-11` contains `console.info = () => {}; console.warn = () => {};`
- Baileys uses `pino` for logging, but `libsignal` might use native `console` objects or pass them through Baileys' Pino logger instances.
- HealthManager (`src/Library/health-manager.ts`) already has some `console.error` and `console.log` interceptors specifically checking for 'Bad MAC' and 'Session error'.

## Hypotheses

| # | Hypothesis | Likelihood | Status |
|---|------------|------------|--------|
| 1 | Libsignal logs bypass Pino and use `console.warn / info` directly, meaning we need to refine the interceptor in HealthManager to catch them without muting globally. | 80% | UNTESTED |
| 2 | These logs are actually emitted by Baileys' Pino logger, and setting the logger level higher (e.g., `error` or `silent`) would suppress them properly. | 50% | UNTESTED |
