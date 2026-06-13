import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { EditBuilder } from '../../src/builder/edit-builder.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { deleteMessage, forwardMessage, reactToMessage } from '../../src/builder/mutations.js'
import { isJid, resolveUsername } from '../../src/builder/username-resolve.js'

const KEY: WAMessageKey = { remoteJid: '111@s.whatsapp.net', id: 'MSG1', fromMe: false }
const SENT: WAMessage = { key: { remoteJid: '111@s.whatsapp.net', id: 'SENT1', fromMe: true } } as WAMessage

const makeSocket = () => ({
  sendMessage: vi.fn(async (_jid: string, _content: unknown) => SENT),
  chatModify: vi.fn(async (_mod: unknown, _jid: string) => undefined),
})

const makeOnWhatsApp = (results: Array<{ jid: string; exists: boolean }> | undefined) => ({
  onWhatsApp: vi.fn(async (..._p: string[]) => results),
})

describe('isJid', () => {
  it('detects whatsapp user jid', () => {
    expect(isJid('123@s.whatsapp.net')).toBe(true)
  })
  it('detects group jid', () => {
    expect(isJid('123-456@g.us')).toBe(true)
  })
  it('detects newsletter jid', () => {
    expect(isJid('123@newsletter')).toBe(true)
  })
  it('rejects bare username', () => {
    expect(isJid('alice')).toBe(false)
  })
  it('rejects phone without suffix', () => {
    expect(isJid('6281234567')).toBe(false)
  })
})

describe('resolveUsername', () => {
  it('returns jid input unchanged without socket call', async () => {
    const socket = makeOnWhatsApp(undefined)
    const cache = new Map<string, string>()
    const out = await resolveUsername(socket, '99@s.whatsapp.net', cache, new Map())
    expect(out).toBe('99@s.whatsapp.net')
    expect(socket.onWhatsApp).not.toHaveBeenCalled()
  })
  it('resolves username via onWhatsApp and populates cache', async () => {
    const socket = makeOnWhatsApp([{ jid: '42@s.whatsapp.net', exists: true }])
    const cache = new Map<string, string>()
    const out = await resolveUsername(socket, 'alice', cache, new Map())
    expect(out).toBe('42@s.whatsapp.net')
    expect(cache.get('alice')).toBe('42@s.whatsapp.net')
    expect(socket.onWhatsApp).toHaveBeenCalledWith('alice')
  })
  it('serves cache hit without socket call', async () => {
    const socket = makeOnWhatsApp([{ jid: '42@s.whatsapp.net', exists: true }])
    const cache = new Map<string, string>([['alice', '42@s.whatsapp.net']])
    const out = await resolveUsername(socket, 'alice', cache, new Map())
    expect(out).toBe('42@s.whatsapp.net')
    expect(socket.onWhatsApp).not.toHaveBeenCalled()
  })
  it('throws USERNAME_NOT_FOUND when result empty', async () => {
    const socket = makeOnWhatsApp([])
    const cache = new Map<string, string>()
    await expect(resolveUsername(socket, 'ghost', cache, new Map())).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
  })
  it('throws USERNAME_NOT_FOUND when contact does not exist', async () => {
    const socket = makeOnWhatsApp([{ jid: 'x@s.whatsapp.net', exists: false }])
    const cache = new Map<string, string>()
    await expect(resolveUsername(socket, 'ghost', cache, new Map())).rejects.toBeInstanceOf(
      ZaileysBuilderError,
    )
  })
  it('throws USERNAME_NOT_FOUND when result undefined', async () => {
    const socket = makeOnWhatsApp(undefined)
    const cache = new Map<string, string>()
    await expect(resolveUsername(socket, 'ghost', cache, new Map())).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
  })
  it('dedupes concurrent calls into a single socket query', async () => {
    let resolveQuery: (v: Array<{ jid: string; exists: boolean }>) => void = () => {}
    const socket = {
      onWhatsApp: vi.fn(
        () =>
          new Promise<Array<{ jid: string; exists: boolean }>>((res) => {
            resolveQuery = res
          }),
      ),
    }
    const cache = new Map<string, string>()
    const inflight = new Map<string, Promise<string>>()
    const p1 = resolveUsername(socket, 'bob', cache, inflight)
    const p2 = resolveUsername(socket, 'bob', cache, inflight)
    resolveQuery([{ jid: '7@s.whatsapp.net', exists: true }])
    const [a, b] = await Promise.all([p1, p2])
    expect(a).toBe('7@s.whatsapp.net')
    expect(b).toBe('7@s.whatsapp.net')
    expect(socket.onWhatsApp).toHaveBeenCalledTimes(1)
  })
})

describe('deleteMessage', () => {
  it('forEveryone (default) sends { delete: key }', async () => {
    const socket = makeSocket()
    await deleteMessage(socket, KEY)
    expect(socket.sendMessage).toHaveBeenCalledWith(KEY.remoteJid, { delete: KEY })
  })
  it('forEveryone=true explicit sends original key', async () => {
    const socket = makeSocket()
    await deleteMessage(socket, KEY, { forEveryone: true })
    expect(socket.sendMessage).toHaveBeenCalledWith(KEY.remoteJid, { delete: KEY })
  })
  it('forEveryone=false deletes for me via chatModify, preserving original key', async () => {
    const socket = makeSocket()
    await deleteMessage(socket, KEY, { forEveryone: false })
    expect(socket.sendMessage).not.toHaveBeenCalled()
    expect(socket.chatModify).toHaveBeenCalledWith(
      { deleteForMe: { deleteMedia: false, key: KEY, timestamp: expect.any(Number) } },
      KEY.remoteJid,
    )
  })
  it('throws when key has no remoteJid', async () => {
    const socket = makeSocket()
    await expect(deleteMessage(socket, { id: 'x', fromMe: false } as WAMessageKey)).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    })
  })
})

describe('reactToMessage', () => {
  it('sends reaction with emoji and key', async () => {
    const socket = makeSocket()
    await reactToMessage(socket, KEY, '👍')
    expect(socket.sendMessage).toHaveBeenCalledWith(KEY.remoteJid, {
      react: { text: '👍', key: KEY },
    })
  })
  it('empty emoji = unreact', async () => {
    const socket = makeSocket()
    await reactToMessage(socket, KEY, '')
    expect(socket.sendMessage).toHaveBeenCalledWith(KEY.remoteJid, {
      react: { text: '', key: KEY },
    })
  })
  it('returns the reaction message key', async () => {
    const socket = makeSocket()
    const out = await reactToMessage(socket, KEY, '🔥')
    expect(out).toEqual(SENT.key)
  })
  it('throws SEND_FAILED when socket returns no key', async () => {
    const socket = { sendMessage: vi.fn(async () => undefined) }
    await expect(reactToMessage(socket, KEY, '🔥')).rejects.toMatchObject({ code: 'SEND_FAILED' })
  })
})

describe('forwardMessage', () => {
  const source: WAMessage = { key: KEY, message: { conversation: 'hi' } } as WAMessage
  it('forwards a stored message to recipient', async () => {
    const socket = makeSocket()
    const store = { getMessage: vi.fn(async () => source) }
    await forwardMessage(socket, store, KEY, '222@s.whatsapp.net')
    expect(store.getMessage).toHaveBeenCalledWith(KEY)
    expect(socket.sendMessage).toHaveBeenCalledWith('222@s.whatsapp.net', { forward: source })
  })
  it('returns the forwarded message key', async () => {
    const socket = makeSocket()
    const store = { getMessage: vi.fn(async () => source) }
    const out = await forwardMessage(socket, store, KEY, '222@s.whatsapp.net')
    expect(out).toEqual(SENT.key)
  })
  it('throws MESSAGE_NOT_FOUND when store miss', async () => {
    const socket = makeSocket()
    const store = { getMessage: vi.fn(async () => undefined) }
    await expect(forwardMessage(socket, store, KEY, '222@s.whatsapp.net')).rejects.toMatchObject({
      code: 'MESSAGE_NOT_FOUND',
    })
    expect(socket.sendMessage).not.toHaveBeenCalled()
  })
  it('does not re-fetch source from network (SC#5: store lookup only)', async () => {
    const socket = makeSocket()
    const store = { getMessage: vi.fn(async () => source) }
    await forwardMessage(socket, store, KEY, '222@s.whatsapp.net')
    expect(store.getMessage).toHaveBeenCalledTimes(1)
    expect(socket.sendMessage).toHaveBeenCalledTimes(1)
  })
})

describe('EditBuilder', () => {
  it('text() edit sends { text, edit: key }', async () => {
    const socket = makeSocket()
    await new EditBuilder(socket, KEY).text('updated')
    expect(socket.sendMessage).toHaveBeenCalledWith(KEY.remoteJid, { text: 'updated', edit: KEY })
  })
  it('text() edit resolves with sent key', async () => {
    const socket = makeSocket()
    const out = await new EditBuilder(socket, KEY).text('updated')
    expect(out).toEqual(SENT.key)
  })
  it('image() edit sends image content with edit field', async () => {
    const socket = makeSocket()
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    await new EditBuilder(socket, KEY).image(buf, { caption: 'cap' })
    const [, content] = socket.sendMessage.mock.calls[0] as [string, Record<string, unknown>]
    expect(content.edit).toEqual(KEY)
    expect(content.caption).toBe('cap')
    expect(Buffer.isBuffer(content.image)).toBe(true)
  })
  it('throws EMPTY_CONTENT when awaited without content', async () => {
    const socket = makeSocket()
    const builder = new EditBuilder(socket, KEY)
    await expect(Promise.resolve(builder)).rejects.toMatchObject({ code: 'EMPTY_CONTENT' })
  })
  it('throws INVALID_OPTIONS when key has no remoteJid', async () => {
    const socket = makeSocket()
    const builder = new EditBuilder(socket, { id: 'x', fromMe: true } as WAMessageKey)
    await expect(builder.text('x')).rejects.toMatchObject({ code: 'INVALID_OPTIONS' })
  })
  it('wraps socket failure as SEND_FAILED', async () => {
    const socket = { sendMessage: vi.fn(async () => Promise.reject(new Error('boom'))) }
    await expect(new EditBuilder(socket, KEY).text('x')).rejects.toMatchObject({
      code: 'SEND_FAILED',
    })
  })
})
