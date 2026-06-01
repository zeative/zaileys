import type { ConvexClientLike } from '../../src/types/convex.js'

type Row = { namespace: string; key: string; value: string; sortKey?: number }

/**
 * In-memory stand-in for the deployed `zaileys_kv` Convex functions
 * (`get`/`set`/`del`/`clear`/`list`). Mirrors their exact semantics so the store
 * contracts can run without a live Convex deployment.
 */
export const fakeConvex = (): ConvexClientLike => {
  const rows: Row[] = []
  const idx = (namespace: string, key: string): number => rows.findIndex((r) => r.namespace === namespace && r.key === key)

  return {
    async query(name: string, args: Record<string, unknown>): Promise<unknown> {
      const namespace = args['namespace'] as string
      if (name === 'zaileys:get') {
        const keys = args['keys'] as string[]
        return keys
          .map((key) => rows[idx(namespace, key)])
          .filter((r): r is Row => r !== undefined)
          .map((r) => ({ key: r.key, value: r.value }))
      }
      if (name === 'zaileys:list') {
        const prefix = args['prefix'] as string
        const before = args['before'] as number | undefined
        const limit = args['limit'] as number | undefined
        let matched = rows.filter((r) => r.namespace === namespace && r.key.startsWith(prefix))
        if (typeof before === 'number') matched = matched.filter((r) => (r.sortKey ?? 0) < before)
        matched = [...matched].sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0))
        if (typeof limit === 'number') matched = matched.slice(0, limit)
        return matched.map((r) => ({ key: r.key, value: r.value, sortKey: r.sortKey }))
      }
      throw new Error(`unknown query ${name}`)
    },
    async mutation(name: string, args: Record<string, unknown>): Promise<unknown> {
      const namespace = args['namespace'] as string
      if (name === 'zaileys:set') {
        for (const item of args['items'] as Array<{ key: string; value: string; sortKey?: number }>) {
          const at = idx(namespace, item.key)
          const row: Row = { namespace, key: item.key, value: item.value, ...(item.sortKey !== undefined ? { sortKey: item.sortKey } : {}) }
          if (at >= 0) rows[at] = row
          else rows.push(row)
        }
        return null
      }
      if (name === 'zaileys:del') {
        for (const key of args['keys'] as string[]) {
          const at = idx(namespace, key)
          if (at >= 0) rows.splice(at, 1)
        }
        return null
      }
      if (name === 'zaileys:clear') {
        const prefix = args['prefix'] as string | undefined
        for (let i = rows.length - 1; i >= 0; i--) {
          const r = rows[i]!
          if (r.namespace !== namespace) continue
          if (prefix === undefined || r.key.startsWith(prefix)) rows.splice(i, 1)
        }
        return null
      }
      throw new Error(`unknown mutation ${name}`)
    },
  }
}
