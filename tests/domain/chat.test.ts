import { describe, expect, it, vi } from 'vitest'
import type { WAMessageKey } from 'baileys'
import { ChatModule } from '../../src/domain/chat.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

const JID = '628111@s.whatsapp.net'
const LAST = [{ key: { remoteJid: JID, id: 'M1', fromMe: false } as WAMessageKey, messageTimestamp: 1700 }]

const make = (withLast = true) => {
  const chatModify = vi.fn(async () => undefined)
  const socket = { chatModify } as unknown as DomainSocketLike
  const mod = new ChatModule(() => socket, withLast ? async () => LAST : undefined)
  return { chatModify, mod }
}

describe('ChatModule', () => {
  it('archive/unarchive pass lastMessages', async () => {
    const { chatModify, mod } = make()
    await mod.archive(JID)
    expect(chatModify).toHaveBeenCalledWith({ archive: true, lastMessages: LAST }, JID)
    await mod.unarchive(JID)
    expect(chatModify).toHaveBeenCalledWith({ archive: false, lastMessages: LAST }, JID)
  })

  it('pin/unpin and mute/unmute', async () => {
    const { chatModify, mod } = make()
    await mod.pin(JID)
    expect(chatModify).toHaveBeenCalledWith({ pin: true }, JID)
    await mod.unmute(JID)
    expect(chatModify).toHaveBeenCalledWith({ mute: null }, JID)
    await mod.mute(JID, 8 * 3600 * 1000)
    expect(chatModify).toHaveBeenCalledWith({ mute: 8 * 3600 * 1000 }, JID)
  })

  it('markRead/markUnread/delete/clear include lastMessages', async () => {
    const { chatModify, mod } = make()
    await mod.markRead(JID)
    expect(chatModify).toHaveBeenCalledWith({ markRead: true, lastMessages: LAST }, JID)
    await mod.delete(JID)
    expect(chatModify).toHaveBeenCalledWith({ delete: true, lastMessages: LAST }, JID)
    await mod.clear(JID)
    expect(chatModify).toHaveBeenCalledWith({ clear: true, lastMessages: LAST }, JID)
  })

  it('star/unstar build the star modification from a key', async () => {
    const { chatModify, mod } = make()
    const key: WAMessageKey = { remoteJid: JID, id: 'S1', fromMe: true }
    await mod.star(key)
    expect(chatModify).toHaveBeenCalledWith({ star: { messages: [{ id: 'S1', fromMe: true }], star: true } }, JID)
    await mod.unstar(key)
    expect(chatModify).toHaveBeenCalledWith({ star: { messages: [{ id: 'S1', fromMe: true }], star: false } }, JID)
  })

  it('falls back to empty lastMessages without a resolver', async () => {
    const { chatModify, mod } = make(false)
    await mod.archive(JID)
    expect(chatModify).toHaveBeenCalledWith({ archive: true, lastMessages: [] }, JID)
  })

  it('throws NOT_CONNECTED without a socket', async () => {
    const mod = new ChatModule(() => undefined)
    await expect(mod.pin(JID)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  describe('fetchHistory', () => {
    const withHistory = () => {
      const fetchMessageHistory = vi.fn(async () => 'REQ1')
      const socket = { fetchMessageHistory } as unknown as DomainSocketLike
      return { fetchMessageHistory, mod: new ChatModule(() => socket) }
    }

    it('forwards the count, key and timestamp and returns the request id', async () => {
      const { fetchMessageHistory, mod } = withHistory()
      const key = LAST[0]!.key
      await expect(mod.fetchHistory(50, key, 1700)).resolves.toBe('REQ1')
      expect(fetchMessageHistory).toHaveBeenCalledWith(50, key, 1700)
    })

    it('rejects a key with no remoteJid instead of asking WhatsApp for nothing', async () => {
      const { fetchMessageHistory, mod } = withHistory()
      await expect(mod.fetchHistory(50, { id: 'M1', fromMe: false }, 1700)).rejects.toMatchObject({
        code: 'OPERATION_FAILED',
      })
      expect(fetchMessageHistory).not.toHaveBeenCalled()
    })

    it('throws NOT_CONNECTED without a socket', async () => {
      const mod = new ChatModule(() => undefined)
      await expect(mod.fetchHistory(10, LAST[0]!.key, 1700)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    })
  })
})
