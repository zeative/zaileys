import { describe, it, expect, vi } from 'vitest'
import { AutoDeleteSweeper, genericPrune } from '../../src/automation/auto-delete.js'
import type { MessageStore, PruneOptions } from '../../src/store/types.js'

const baseStore = (): MessageStore =>
  ({
    saveMessage: vi.fn(), getMessage: vi.fn(), listMessages: vi.fn(),
    saveChat: vi.fn(), getChat: vi.fn(), listChats: vi.fn(),
    saveContact: vi.fn(), getContact: vi.fn(), listContacts: vi.fn(),
    savePresence: vi.fn(), getPresence: vi.fn(),
    bind: vi.fn(), clear: vi.fn(), close: vi.fn(),
  }) as unknown as MessageStore

describe('AutoDeleteSweeper', () => {
  it('prefers native pruneMessages with resolved cutoff', async () => {
    const store = baseStore()
    store.pruneMessages = vi.fn(async () => 3)
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxAgeMs: 1000, maxPerChat: 5 }, now: () => 10_000,
    })
    const n = await sweeper.runOnce()
    expect(n).toBe(3)
    expect(store.pruneMessages).toHaveBeenCalledWith(
      expect.objectContaining({ olderThan: 9, maxPerChat: 5 }),
    )
  })

  it('falls back to genericPrune via deleteMessage', async () => {
    const store = baseStore()
    store.listChats = vi.fn(async () => [{ id: 'a@s.whatsapp.net' }] as never)
    store.listMessages = vi.fn(async () => [
      { key: { remoteJid: 'a@s.whatsapp.net', id: '1', fromMe: false }, messageTimestamp: 1 },
      { key: { remoteJid: 'a@s.whatsapp.net', id: '2', fromMe: false }, messageTimestamp: 9 },
    ] as never)
    const del = vi.fn(async () => undefined)
    store.deleteMessage = del
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxPerChat: 1 }, now: () => 0,
    })
    const n = await sweeper.runOnce()
    expect(n).toBe(1)
    expect(del).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('no-ops and warns once when neither prune nor delete exist', async () => {
    const store = baseStore()
    const warn = vi.fn()
    const sweeper = new AutoDeleteSweeper({
      store, options: { maxAgeMs: 1 }, logger: { warn } as never, now: () => 0,
    })
    expect(await sweeper.runOnce()).toBe(0)
    expect(await sweeper.runOnce()).toBe(0)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('start() is a no-op when no maxAge and no maxPerChat', () => {
    const store = baseStore()
    store.pruneMessages = vi.fn(async () => 0)
    const sweeper = new AutoDeleteSweeper({ store, options: {}, now: () => 0 })
    sweeper.start()
    expect(store.pruneMessages).not.toHaveBeenCalled()
    sweeper.stop()
  })
})

describe('genericPrune', () => {
  it('keeps newest N and deletes older by age', async () => {
    const deleted: string[] = []
    const store = {
      listChats: async () => [{ id: 'c@s.whatsapp.net' }],
      listMessages: async () => [
        { key: { remoteJid: 'c@s.whatsapp.net', id: 'old', fromMe: false }, messageTimestamp: 1 },
        { key: { remoteJid: 'c@s.whatsapp.net', id: 'new', fromMe: false }, messageTimestamp: 100 },
      ],
      deleteMessage: async (k: { id?: string }) => { deleted.push(k.id ?? '') },
    } as unknown as MessageStore
    const opts: PruneOptions = { olderThan: 50 }
    expect(await genericPrune(store, opts)).toBe(1)
    expect(deleted).toEqual(['old'])
  })
})
