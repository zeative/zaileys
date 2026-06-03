import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresenceModule, ZaileysAutomationError } from '../../src/automation/index.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const JID = 'a@s.whatsapp.net'

describe('PresenceModule', () => {
  let socket: MockSocket
  let presence: PresenceModule

  beforeEach(() => {
    vi.useFakeTimers()
    socket = createMockSocket()
    presence = new PresenceModule(() => socket as never)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('online() sends available with no jid', async () => {
    await presence.online()
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('available')
  })

  it('online() passes undefined recipient (global)', async () => {
    await presence.online()
    const call = socket.sendPresenceUpdate.mock.calls[0]
    expect(call?.[1]).toBeUndefined()
  })

  it('offline() sends unavailable with no jid', async () => {
    await presence.offline()
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('unavailable')
  })

  it('typing(jid) sends composing for that jid', async () => {
    await presence.typing(JID)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('composing', JID)
  })

  it('typing(jid) without ms does not auto-clear', async () => {
    await presence.typing(JID)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledTimes(1)
  })

  it('typing(jid, ms) auto-clears to paused after ms', async () => {
    await presence.typing(JID, 1000)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('composing', JID)
    await vi.advanceTimersByTimeAsync(1000)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('paused', JID)
  })

  it('typing(jid, ms) does not clear before ms elapses', async () => {
    await presence.typing(JID, 1000)
    await vi.advanceTimersByTimeAsync(999)
    expect(socket.sendPresenceUpdate).not.toHaveBeenCalledWith('paused', JID)
  })

  it('recording(jid) sends recording for that jid', async () => {
    await presence.recording(JID)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('recording', JID)
  })

  it('recording(jid, ms) auto-clears to paused after ms', async () => {
    await presence.recording(JID, 2000)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('recording', JID)
    await vi.advanceTimersByTimeAsync(2000)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledWith('paused', JID)
  })

  it('online() without socket throws NOT_CONNECTED', async () => {
    const detached = new PresenceModule(() => undefined)
    await expect(detached.online()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('typing() without socket throws NOT_CONNECTED', async () => {
    const detached = new PresenceModule(() => undefined)
    await expect(detached.typing(JID)).rejects.toBeInstanceOf(ZaileysAutomationError)
  })

  it('online() wraps a rejecting socket in PRESENCE_FAILED', async () => {
    socket.sendPresenceUpdate.mockRejectedValueOnce(new Error('boom'))
    await expect(presence.online()).rejects.toMatchObject({ code: 'PRESENCE_FAILED' })
  })

  it('typing() wraps a rejecting socket in PRESENCE_FAILED', async () => {
    socket.sendPresenceUpdate.mockRejectedValueOnce(new Error('down'))
    await expect(presence.typing(JID)).rejects.toMatchObject({ code: 'PRESENCE_FAILED' })
  })

  it('PRESENCE_FAILED carries the original cause', async () => {
    const cause = new Error('root')
    socket.sendPresenceUpdate.mockRejectedValueOnce(cause)
    await presence.offline().catch((err: ZaileysAutomationError) => {
      expect(err.cause).toBe(cause)
    })
  })

  it('auto-clear failure does not reject the original typing() call', async () => {
    socket.sendPresenceUpdate.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('late'))
    await expect(presence.typing(JID, 500)).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(500)
  })
})

describe('PresenceModule — throttle', () => {
  let t: number
  const clock = { now: () => t }

  it('drops a repeated composing for the same chat inside the window', async () => {
    t = 0
    const socket = createMockSocket()
    const presence = new PresenceModule(() => socket as never, { minIntervalMs: 1000 }, clock)
    await presence.typing(JID)
    await presence.typing(JID)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledTimes(1)
  })

  it('allows the update again once the window elapses', async () => {
    t = 0
    const socket = createMockSocket()
    const presence = new PresenceModule(() => socket as never, { minIntervalMs: 1000 }, clock)
    await presence.typing(JID)
    t = 1000
    await presence.typing(JID)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledTimes(2)
  })

  it('does not cross-throttle different chats', async () => {
    t = 0
    const socket = createMockSocket()
    const presence = new PresenceModule(() => socket as never, { minIntervalMs: 1000 }, clock)
    await presence.typing(JID)
    await presence.typing('b@s.whatsapp.net')
    expect(socket.sendPresenceUpdate).toHaveBeenCalledTimes(2)
  })

  it('disabled throttle never drops', async () => {
    t = 0
    const socket = createMockSocket()
    const presence = new PresenceModule(() => socket as never, { enabled: false }, clock)
    await presence.typing(JID)
    await presence.typing(JID)
    await presence.typing(JID)
    expect(socket.sendPresenceUpdate).toHaveBeenCalledTimes(3)
  })
})
