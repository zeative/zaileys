import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { mapDisconnectReason } from '../../src/connection/disconnect-reason.js'
import { ZaileysConnectionError } from '../../src/connection/errors.js'
import {
  attachConnectionWatchdog,
  ConnectionWatchdog,
  createWatchdogCloseError,
  resolveWatchdogOptions,
  WATCHDOG_DEFAULTS,
  type WatchdogDeps,
  type WatchdogTimer,
} from '../../src/connection/watchdog.js'
import { MAX_TIMER_DELAY_MS } from '../../src/utils/timer.js'

const MIN = 60_000

class FakeTime implements WatchdogTimer {
  now = 0
  private seq = 0
  readonly timers = new Map<number, { at: number; fn: () => void; ms: number }>()

  setTimeout = (fn: () => void, ms: number): unknown => {
    this.seq += 1
    this.timers.set(this.seq, { at: this.now + ms, fn, ms })
    return this.seq
  }

  clearTimeout = (handle: unknown): void => {
    this.timers.delete(handle as number)
  }

  async advance(ms: number): Promise<void> {
    const target = this.now + ms
    for (;;) {
      const due = [...this.timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      this.timers.delete(due[0])
      this.now = due[1].at
      due[1].fn()
      await flush()
    }
    this.now = target
    await flush()
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve()
}

const make = (probe: WatchdogDeps['probe'], options = { idleMs: 15 * MIN, probeTimeoutMs: 10_000 }) => {
  const time = new FakeTime()
  const onDeaf = vi.fn()
  const watchdog = new ConnectionWatchdog(options, { probe, onDeaf, clock: { now: () => time.now }, timer: time })
  return { time, onDeaf, watchdog }
}

const catchErr = (fn: () => unknown): unknown => {
  try {
    fn()
  } catch (err) {
    return err
  }
  return undefined
}

describe('resolveWatchdogOptions', () => {
  it('is off when undefined or false', () => {
    expect(resolveWatchdogOptions(undefined)).toBeUndefined()
    expect(resolveWatchdogOptions(false)).toBeUndefined()
  })

  it('uses 15 min idle and a 10 s probe for true and for an empty object', () => {
    expect(resolveWatchdogOptions(true)).toEqual({ idleMs: 900_000, probeTimeoutMs: 10_000 })
    expect(resolveWatchdogOptions({})).toEqual(WATCHDOG_DEFAULTS)
  })

  it('keeps valid overrides', () => {
    expect(resolveWatchdogOptions({ idleMs: MIN, probeTimeoutMs: 1 })).toEqual({ idleMs: MIN, probeTimeoutMs: 1 })
  })

  it.each([59_999, Number.NaN, Number.POSITIVE_INFINITY, -1])('throws INVALID_OPTIONS for idleMs %s', (idleMs) => {
    const err = catchErr(() => resolveWatchdogOptions({ idleMs }))
    expect(err).toBeInstanceOf(ZaileysConnectionError)
    expect((err as ZaileysConnectionError).code).toBe('INVALID_OPTIONS')
    expect((err as Error).message).toContain('watchdog.idleMs')
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('throws INVALID_OPTIONS for probeTimeoutMs %s', (probeTimeoutMs) => {
    const err = catchErr(() => resolveWatchdogOptions({ probeTimeoutMs }))
    expect((err as ZaileysConnectionError).code).toBe('INVALID_OPTIONS')
    expect((err as Error).message).toContain('watchdog.probeTimeoutMs')
  })

  it('throws INVALID_OPTIONS for a non-object value', () => {
    const err = catchErr(() => resolveWatchdogOptions('on' as never))
    expect((err as ZaileysConnectionError).code).toBe('INVALID_OPTIONS')
  })
})

describe('ConnectionWatchdog — idle tracking', () => {
  it('does not probe while inbound activity keeps arriving', async () => {
    const probe = vi.fn(async () => undefined)
    const { time, watchdog } = make(probe)
    watchdog.start()
    for (let i = 0; i < 6; i += 1) {
      await time.advance(10 * MIN)
      watchdog.activity()
    }
    expect(probe).not.toHaveBeenCalled()
    watchdog.stop()
  })

  it('probes once the session has been idle for idleMs', async () => {
    const probe = vi.fn(async () => undefined)
    const { time, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN - 1)
    expect(probe).not.toHaveBeenCalled()
    await time.advance(1)
    expect(probe).toHaveBeenCalledTimes(1)
    watchdog.stop()
  })

  it('counts idle from the last activity, not from start', async () => {
    const probe = vi.fn(async () => undefined)
    const { time, watchdog } = make(probe)
    watchdog.start()
    await time.advance(10 * MIN)
    watchdog.activity()
    await time.advance(5 * MIN)
    expect(probe).not.toHaveBeenCalled()
    await time.advance(10 * MIN)
    expect(probe).toHaveBeenCalledTimes(1)
    watchdog.stop()
  })

  it('ignores activity reported before start or after stop', async () => {
    const probe = vi.fn(async () => undefined)
    const { time, watchdog } = make(probe)
    watchdog.activity()
    expect(time.timers.size).toBe(0)
    watchdog.start()
    watchdog.stop()
    watchdog.activity()
    expect(time.timers.size).toBe(0)
  })
})

describe('ConnectionWatchdog — probe outcome', () => {
  it('resets idle after a probe that answers, then probes again after another idle spell', async () => {
    const probe = vi.fn(async () => undefined)
    const { time, onDeaf, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN)
    expect(probe).toHaveBeenCalledTimes(1)
    await time.advance(15 * MIN - 1)
    expect(probe).toHaveBeenCalledTimes(1)
    await time.advance(1)
    expect(probe).toHaveBeenCalledTimes(2)
    expect(onDeaf).not.toHaveBeenCalled()
    watchdog.stop()
  })

  it('calls onDeaf once when the probe throws, and stops', async () => {
    const failure = new Error('stanza error')
    const probe = vi.fn(async () => {
      throw failure
    })
    const { time, onDeaf, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN)
    expect(onDeaf).toHaveBeenCalledTimes(1)
    expect(onDeaf).toHaveBeenCalledWith({ idleMs: 15 * MIN, error: failure })
    expect(watchdog.active).toBe(false)
    expect(time.timers.size).toBe(0)
    await time.advance(60 * MIN)
    expect(onDeaf).toHaveBeenCalledTimes(1)
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('calls onDeaf once when the probe never answers within probeTimeoutMs', async () => {
    const probe = vi.fn(() => new Promise<never>(() => undefined))
    const { time, onDeaf, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN)
    expect(probe).toHaveBeenCalledTimes(1)
    await time.advance(9_999)
    expect(onDeaf).not.toHaveBeenCalled()
    await time.advance(1)
    expect(onDeaf).toHaveBeenCalledTimes(1)
    expect(String((onDeaf.mock.calls[0]?.[0] as { error: unknown }).error)).toContain('timed out')
    expect(time.timers.size).toBe(0)
  })

  it('treats inbound activity during a failed probe as proof of life', async () => {
    let fail: (err: Error) => void = () => undefined
    const probe = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
    const { time, onDeaf, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN)
    await time.advance(1_000)
    watchdog.activity()
    fail(new Error('late'))
    await flush()
    expect(onDeaf).not.toHaveBeenCalled()
    expect(watchdog.active).toBe(true)
    watchdog.stop()
  })

  it('ignores a probe that settles after stop()', async () => {
    let fail: (err: Error) => void = () => undefined
    const probe = vi.fn(() => new Promise<void>((_, reject) => (fail = reject)))
    const { time, onDeaf, watchdog } = make(probe)
    watchdog.start()
    await time.advance(15 * MIN)
    watchdog.stop()
    fail(new Error('late'))
    await flush()
    expect(onDeaf).not.toHaveBeenCalled()
    expect(time.timers.size).toBe(0)
  })
})

describe('ConnectionWatchdog — timers', () => {
  it('stop() clears the idle timer and the probe timer', async () => {
    const probe = vi.fn(() => new Promise<never>(() => undefined))
    const { time, watchdog } = make(probe)
    watchdog.start()
    expect(time.timers.size).toBe(1)
    await time.advance(15 * MIN)
    expect(time.timers.size).toBe(1)
    watchdog.stop()
    expect(time.timers.size).toBe(0)
  })

  it('start() twice keeps a single idle timer', () => {
    const { time, watchdog } = make(async () => undefined)
    watchdog.start()
    watchdog.start()
    expect(time.timers.size).toBe(1)
    watchdog.stop()
  })

  it('clamps an idle delay beyond the Node timer limit and re-arms until it is due', async () => {
    const probe = vi.fn(async () => undefined)
    const idleMs = MAX_TIMER_DELAY_MS * 2
    const { time, watchdog } = make(probe, { idleMs, probeTimeoutMs: 10_000 })
    watchdog.start()
    expect([...time.timers.values()][0]?.ms).toBe(MAX_TIMER_DELAY_MS)
    await time.advance(MAX_TIMER_DELAY_MS)
    expect(probe).not.toHaveBeenCalled()
    expect(time.timers.size).toBe(1)
    await time.advance(MAX_TIMER_DELAY_MS)
    expect(probe).toHaveBeenCalledTimes(1)
    watchdog.stop()
  })
})

describe('createWatchdogCloseError', () => {
  it('maps to connection-lost, a reconnectable reason that never erases credentials', () => {
    const err = createWatchdogCloseError('deaf')
    expect(err.code).toBe('CONNECTION_CLOSED')
    expect(mapDisconnectReason(err.output.statusCode)).toBe('connection-lost')
  })
})

describe('attachConnectionWatchdog', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }

  const socketWith = (onWhatsApp: (...jids: string[]) => Promise<unknown>) => {
    const ws = new EventEmitter()
    return { ws, user: { id: '628123:4@s.whatsapp.net' }, onWhatsApp: vi.fn(onWhatsApp), end: vi.fn() }
  }

  it('counts server-pushed stanzas as activity and ignores iq and ack frames', async () => {
    const time = new FakeTime()
    const socket = socketWith(async () => [])
    const handle = attachConnectionWatchdog(socket, { idleMs: 15 * MIN, probeTimeoutMs: 10_000 }, {
      logger,
      sessionId: 's',
      clock: { now: () => time.now },
      timer: time,
    })
    await time.advance(10 * MIN)
    socket.ws.emit('frame', { tag: 'message', attrs: {} })
    await time.advance(10 * MIN)
    expect(socket.onWhatsApp).not.toHaveBeenCalled()
    socket.ws.emit('frame', { tag: 'iq', attrs: { type: 'result' } })
    socket.ws.emit('frame', { tag: 'ack', attrs: {} })
    socket.ws.emit('frame', new Uint8Array(1))
    await time.advance(5 * MIN)
    expect(socket.onWhatsApp).toHaveBeenCalledWith('628123:4@s.whatsapp.net')
    handle?.stop()
    expect(socket.ws.listenerCount('frame')).toBe(0)
  })

  it('ends the socket with a connection-lost error when the probe gets no answer', async () => {
    const time = new FakeTime()
    const socket = socketWith(async () => undefined)
    attachConnectionWatchdog(socket, { idleMs: MIN, probeTimeoutMs: 10_000 }, {
      logger,
      sessionId: 's',
      clock: { now: () => time.now },
      timer: time,
    })
    await time.advance(MIN)
    expect(socket.end).toHaveBeenCalledTimes(1)
    const err = socket.end.mock.calls[0]?.[0] as { output: { statusCode: number }; message: string }
    expect(mapDisconnectReason(err.output.statusCode)).toBe('connection-lost')
    expect(err.message).toBe('watchdog: no inbound traffic for 1 min and the probe failed; reconnecting')
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's' }), err.message)
  })

  it('stays off with a warning when the socket has no raw frame emitter or own phone-number jid', () => {
    const noWs = { user: { id: '628123@s.whatsapp.net' }, onWhatsApp: vi.fn(), end: vi.fn() }
    expect(attachConnectionWatchdog(noWs, WATCHDOG_DEFAULTS, { logger, sessionId: 's' })).toBeUndefined()
    const lidOnly = { ...socketWith(async () => []), user: { id: '123@lid' } }
    expect(attachConnectionWatchdog(lidOnly, WATCHDOG_DEFAULTS, { logger, sessionId: 's' })).toBeUndefined()
    expect(lidOnly.ws.listenerCount('frame')).toBe(0)
  })
})
