import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

// Copy this into your Convex project's convex/schema.ts (or merge the table in),
// then run `npx convex dev` / `npx convex deploy`. Backs zaileys' ConvexAuthStore
// and ConvexMessageStore via a single namespaced key/value table.
export default defineSchema({
  zaileys_kv: defineTable({
    namespace: v.string(),
    key: v.string(),
    value: v.string(),
    sortKey: v.optional(v.number()),
  }).index('by_ns_key', ['namespace', 'key']),
})
