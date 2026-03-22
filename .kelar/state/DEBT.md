# Technical Debt & Anti-Patterns: Zaileys

## 🚨 Critical Items
- **Missing Dev Script Target**: `package.json` references `examples/test.ts` in the `dev` script, but the file is missing in the repository. (Found: `examples/basic.ts` exists instead).
- **Loose Type Safety in Store**: `centerStore.get('socket')` and similar calls rely on manual casting (e.g., `as any`). A typed store wrapper or bridge would be safer.

## ⚠️ Improvements
- **Registry Visibility**: `UnifiedStore` snapshot exports full records, which might become large. Consider partial snapshots or debugging-only exports.
- **FireForget Error Handling**: Default error handler only logs to console. Could benefit from a more centralized logging integration with `pino`.
- **Plugin HMR Scope**: HMR might cause side effects if plugins register global event listeners without cleanup logic.

## 🧹 Maintenance
- **Documentation**: README is very large but could use a separate `ARCHITECTURE.md` to offload some technical details.
