import { mutationGeneric as mutation, queryGeneric as query } from 'convex/server'
import { v } from 'convex/values'

// Copy this into your Convex project as convex/zaileys.ts, then deploy.
// zaileys' Convex adapters call these by name: "zaileys:get" / "zaileys:set" /
// "zaileys:del" / "zaileys:clear" / "zaileys:list".

const byKey = (ctx, namespace, key) =>
  ctx.db
    .query('zaileys_kv')
    .withIndex('by_ns_key', (q) => q.eq('namespace', namespace).eq('key', key))
    .unique()

export const get = query({
  args: { namespace: v.string(), keys: v.array(v.string()) },
  handler: async (ctx, { namespace, keys }) => {
    const out = []
    for (const key of keys) {
      const row = await byKey(ctx, namespace, key)
      if (row) out.push({ key: row.key, value: row.value })
    }
    return out
  },
})

export const set = mutation({
  args: {
    namespace: v.string(),
    items: v.array(v.object({ key: v.string(), value: v.string(), sortKey: v.optional(v.number()) })),
  },
  handler: async (ctx, { namespace, items }) => {
    for (const item of items) {
      const row = await byKey(ctx, namespace, item.key)
      const doc = { namespace, key: item.key, value: item.value, sortKey: item.sortKey }
      if (row) await ctx.db.patch(row._id, doc)
      else await ctx.db.insert('zaileys_kv', doc)
    }
  },
})

export const del = mutation({
  args: { namespace: v.string(), keys: v.array(v.string()) },
  handler: async (ctx, { namespace, keys }) => {
    for (const key of keys) {
      const row = await byKey(ctx, namespace, key)
      if (row) await ctx.db.delete(row._id)
    }
  },
})

export const clear = mutation({
  args: { namespace: v.string(), prefix: v.optional(v.string()) },
  handler: async (ctx, { namespace, prefix }) => {
    const rows = await ctx.db
      .query('zaileys_kv')
      .withIndex('by_ns_key', (q) => q.eq('namespace', namespace))
      .collect()
    for (const row of rows) {
      if (prefix === undefined || row.key.startsWith(prefix)) await ctx.db.delete(row._id)
    }
  },
})

export const list = query({
  args: { namespace: v.string(), prefix: v.string(), before: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, { namespace, prefix, before, limit }) => {
    const rows = await ctx.db
      .query('zaileys_kv')
      .withIndex('by_ns_key', (q) => q.eq('namespace', namespace).gte('key', prefix).lt('key', prefix + '￿'))
      .collect()
    let out = rows.map((r) => ({ key: r.key, value: r.value, sortKey: r.sortKey }))
    if (typeof before === 'number') out = out.filter((r) => (r.sortKey ?? 0) < before)
    out.sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0))
    if (typeof limit === 'number') out = out.slice(0, limit)
    return out
  },
})
