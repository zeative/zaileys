---
'zaileys': patch
---

Remove `pg`/`redis` type imports from published typings — consumers without the optional peer deps no longer fail typecheck (TS2307). Declarations are now emitted by TypeScript 7 directly instead of bundled, and the packaging guard fails the build if any optional peer ever leaks into `dist` typings again.
