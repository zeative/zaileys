import { describe, expect, it, vi, beforeEach } from 'vitest'

const { clearMock } = vi.hoisted(() => ({ clearMock: vi.fn(async (_prefix?: string) => undefined) }))

vi.mock('../../src/types/convex.js', () => ({
  ConvexKv: class {
    clear = clearMock
    async get() {
      return new Map()
    }
    async set() {}
    async del() {}
    async list() {
      return []
    }
    close() {}
  },
}))

import { ConvexMessageStore } from '../../src/store/adapters/convex.js'

beforeEach(() => clearMock.mockClear())

describe('ConvexMessageStore.clear() key scope', () => {
  it('clears per prefix and never namespace-wide', async () => {
    const store = new ConvexMessageStore({ url: 'https://x.convex.cloud' } as never)
    await store.clear()
    expect(clearMock).toHaveBeenCalled()
    const prefixes = clearMock.mock.calls.map((c) => c[0])
    expect(prefixes).not.toContain(undefined)
    expect(prefixes).toEqual(expect.arrayContaining(['msg:', 'chat:', 'contact:', 'presence:']))
  })

  it('never clears the auth prefixes', async () => {
    const store = new ConvexMessageStore({ url: 'https://x.convex.cloud' } as never)
    await store.clear()
    const prefixes = clearMock.mock.calls.map((c) => c[0])
    expect(prefixes).not.toContain('creds')
    expect(prefixes).not.toContain('signal:')
    expect(prefixes.some((p) => p === undefined || p === '')).toBe(false)
  })
})
