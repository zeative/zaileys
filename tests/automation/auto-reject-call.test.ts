import { describe, expect, it, vi } from 'vitest'
import { AutoRejectCallModule, type CallSocketLike } from '../../src/automation/auto-reject-call.js'
import { ZaileysAutomationError } from '../../src/automation/errors.js'
import type { CallPayload } from '../../src/events/types.js'

const call = (over: Partial<Extract<CallPayload, { kind: 'incoming' }>> = {}) =>
  ({
    kind: 'incoming',
    callId: 'CALL1',
    from: '628111@s.whatsapp.net',
    isGroup: false,
    isVideo: false,
    timestamp: 1_700_000_000_000,
    status: 'offer',
    ...over,
  }) as Extract<CallPayload, { kind: 'incoming' }>

const mkSocket = () => ({ rejectCall: vi.fn(async () => undefined) }) satisfies CallSocketLike

const mkLogger = () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() })

describe('AutoRejectCallModule.handle — policy', () => {
  it('rejects an incoming call when enabled', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true })
    await m.handle(call())
    expect(sock.rejectCall).toHaveBeenCalledWith('CALL1', '628111@s.whatsapp.net')
  })

  it('does nothing when disabled', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: false })
    await m.handle(call())
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('skips callers in the allow array', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: ['628111@s.whatsapp.net'] })
    await m.handle(call())
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('allow array matches on normalized digits too', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: ['628111'] })
    await m.handle(call())
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('rejects callers not in the allow array', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: ['628999@s.whatsapp.net'] })
    await m.handle(call())
    expect(sock.rejectCall).toHaveBeenCalledOnce()
  })

  it('supports a sync allow predicate', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: (jid) => jid.startsWith('628111') })
    await m.handle(call())
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('supports an async allow predicate', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: async () => true })
    await m.handle(call())
    expect(sock.rejectCall).not.toHaveBeenCalled()
  })

  it('a throwing allow predicate does not block the reject and is logged', async () => {
    const sock = mkSocket()
    const logger = mkLogger()
    const m = new AutoRejectCallModule(
      () => sock,
      { enabled: true, allow: () => { throw new Error('boom') } },
      logger,
    )
    await m.handle(call())
    expect(sock.rejectCall).toHaveBeenCalledOnce()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('runs onReject after a successful reject, with the payload', async () => {
    const sock = mkSocket()
    const onReject = vi.fn()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, onReject })
    const c = call()
    await m.handle(c)
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject).toHaveBeenCalledWith(c)
  })

  it('does not run onReject when the call was allowed', async () => {
    const sock = mkSocket()
    const onReject = vi.fn()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, allow: () => true, onReject })
    await m.handle(call())
    expect(onReject).not.toHaveBeenCalled()
  })

  it('a failing rejectCall is logged, never thrown, and skips onReject', async () => {
    const sock = { rejectCall: vi.fn(async () => { throw new Error('socket died') }) }
    const logger = mkLogger()
    const onReject = vi.fn()
    const m = new AutoRejectCallModule(() => sock, { enabled: true, onReject }, logger)
    await expect(m.handle(call())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('a throwing onReject is logged, never thrown', async () => {
    const sock = mkSocket()
    const logger = mkLogger()
    const m = new AutoRejectCallModule(
      () => sock,
      { enabled: true, onReject: () => { throw new Error('hook boom') } },
      logger,
    )
    await expect(m.handle(call())).resolves.toBeUndefined()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('handle() without a socket does not throw (not connected yet)', async () => {
    const m = new AutoRejectCallModule(() => undefined, { enabled: true })
    await expect(m.handle(call())).resolves.toBeUndefined()
  })
})

describe('AutoRejectCallModule.reject — manual', () => {
  it('rejects regardless of the enabled flag', async () => {
    const sock = mkSocket()
    const m = new AutoRejectCallModule(() => sock, { enabled: false })
    await m.reject('CALL9', '628222@s.whatsapp.net')
    expect(sock.rejectCall).toHaveBeenCalledWith('CALL9', '628222@s.whatsapp.net')
  })

  it('throws a typed error when not connected', async () => {
    const m = new AutoRejectCallModule(() => undefined, {})
    await expect(m.reject('C', 'x@s.whatsapp.net')).rejects.toBeInstanceOf(ZaileysAutomationError)
  })

  it('propagates a socket failure to the caller', async () => {
    const sock = { rejectCall: vi.fn(async () => { throw new Error('nope') }) }
    const m = new AutoRejectCallModule(() => sock, {})
    await expect(m.reject('C', 'x@s.whatsapp.net')).rejects.toThrowError()
  })
})
