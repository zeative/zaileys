# Todo — optional peer typings fix

- [ ] T1: `src/types/optional-clients.ts` — PgPoolLike/PgPoolClientLike/PgQueryResultLike
- [ ] T2: migrate auth+store postgres adapters; build; grep dist for 'pg' = 0
- [ ] T3: add RedisClientLike/RedisMultiLike to shared file
- [ ] T4: migrate auth+store redis adapters; build; grep dist for 'redis' = 0
- [ ] CHECKPOINT A: pnpm pack → scratch consumer without pg/redis → tsc clean re zaileys dist
- [ ] T5: type-assignability regression test + post-build leak guard (pg|redis|better-sqlite3|convex)
- [ ] T6: docs troubleshooting (bun target, skipLibCheck) + patch changeset
- [ ] CHECKPOINT B: typecheck + test + build + size green; re-run consumer sim
