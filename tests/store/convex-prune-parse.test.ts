import { describe, expect, it, vi, beforeEach } from 'vitest'

const { listMock, delMock } = vi.hoisted(() => ({
  listMock: vi.fn(async (_prefix: string) => [] as Array<{ key: string; value: string; sortKey?: number }>),
  delMock: vi.fn(async (_keys: readonly string[]) => undefined),
}))

vi.mock('../../src/types/convex.js', () => ({
  ConvexKv: class {
    list = listMock
    del = delMock
    async get() {
      return new Map()
    }
    async set() {}
    async clear() {}
    close() {}
    reopen() {}
  },
}))

import { ConvexMessageStore } from '../../src/store/adapters/convex.js'

const row = (jid: string, id: string, ts: number) => ({ key: `msg:${jid}:${id}|0`, value: '{}', sortKey: ts })

beforeEach(() => {
  listMock.mockReset()
  delMock.mockReset()
})

describe('ConvexMessageStore.pruneMessages key parsing', () => {
  it('passes the full chat jid to chatFilter even when the jid contains a colon', async () => {
    listMock.mockResolvedValue([row('628111:12@s.whatsapp.net', 'A', 1)])
    const seen: string[] = []
    const store = new ConvexMessageStore({ url: 'https://x.convex.cloud' } as never)
    await store.pruneMessages({ olderThan: 10, chatFilter: (jid) => (seen.push(jid), true) })
    expect(seen).toEqual(['628111:12@s.whatsapp.net'])
  })

  it('a chatFilter protecting one device-suffixed chat really protects it', async () => {
    listMock.mockResolvedValue([row('628111:12@s.whatsapp.net', 'A', 1), row('628111:3@s.whatsapp.net', 'B', 1)])
    const store = new ConvexMessageStore({ url: 'https://x.convex.cloud' } as never)
    await store.pruneMessages({ olderThan: 10, chatFilter: (jid) => jid !== '628111:12@s.whatsapp.net' })
    expect(delMock).toHaveBeenCalledWith(['msg:628111:3@s.whatsapp.net:B|0'])
  })

  it('maxPerChat is counted per real chat, not per truncated prefix', async () => {
    listMock.mockResolvedValue([
      row('628111:12@s.whatsapp.net', 'A', 2),
      row('628111:3@s.whatsapp.net', 'B', 1),
    ])
    const store = new ConvexMessageStore({ url: 'https://x.convex.cloud' } as never)
    const removed = await store.pruneMessages({ maxPerChat: 1 })
    expect(removed).toBe(0)
  })
})
