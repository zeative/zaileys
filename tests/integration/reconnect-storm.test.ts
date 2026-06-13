import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { makeIntegrationSocket, simulateBoomDisconnect, type IntegrationMockSocket } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ fake: 'creds' })),
}))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: initAuthCredsMock,
  DisconnectReason: {
    loggedOut: 401,
    forbidden: 403,
    connectionLost: 408,
    multideviceMismatch: 411,
    connectionClosed: 428,
    connectionReplaced: 440,
    badSession: 500,
    unavailableService: 503,
    restartRequired: 515,
    timedOut: 408,
  },
  makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  BufferJSON: { replacer: (_k: string, v: unknown) => v, reviver: (_k: string, v: unknown) => v },
}))

vi.mock('../../src/connection/qr-terminal.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/connection/qr-terminal.js')>(
    '../../src/connection/qr-terminal.js',
  )
  return { ...actual, printQrToTerminal: vi.fn(async () => undefined) }
})

import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

beforeEach(() => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

function queueSockets(n: number): IntegrationMockSocket[] {
  const arr: IntegrationMockSocket[] = []
  for (let i = 0; i < n; i++) arr.push(makeIntegrationSocket({ user: { id: `s${i}@x` } }))
  let idx = 0
  makeWASocketMock.mockImplementation(() => arr[idx++] ?? makeIntegrationSocket({ user: { id: 'fallback@x' } }))
  return arr
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('integration: reconnect storm — exponential backoff sequence', () => {
  it('5 consecutive 428 disconnects produce ~1s,2s,4s,8s,16s delays (jitter=0)', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(10)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1000, maxDelayMs: 60000, jitterFactor: 0 },
      autoConnect: false,
    })
    const delays: number[] = []
    c.on('reconnecting', (e) => delays.push(e.delayMs))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    let idx = 0
    for (let i = 0; i < 5; i++) {
      simulateBoomDisconnect(socks[idx]!, 428)
      await tick()
      vi.advanceTimersByTime(60000)
      await tick()
      idx += 1
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000])
  })

  it('jittered delays fall within +/- jitterFactor band', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(10)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1000, jitterFactor: 0.2 },
      autoConnect: false,
    })
    const delays: number[] = []
    c.on('reconnecting', (e) => delays.push(e.delayMs))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    let idx = 0
    for (let i = 0; i < 5; i++) {
      simulateBoomDisconnect(socks[idx]!, 428)
      await tick()
      vi.advanceTimersByTime(60000)
      await tick()
      idx += 1
    }
    const expectedBases = [1000, 2000, 4000, 8000, 16000]
    delays.forEach((d, i) => {
      const base = expectedBases[i]!
      expect(d).toBeGreaterThanOrEqual(Math.floor(base * 0.8))
      expect(d).toBeLessThanOrEqual(Math.ceil(base * 1.2))
    })
  })

  it('reconnecting events count = 5 before 6th gives up under maxAttempts=5 (no opens between)', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(10)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1, jitterFactor: 0, maxAttempts: 5 },
      autoConnect: false,
    })
    const reconnecting = vi.fn()
    const disconnects: Array<{ willReconnect: boolean }> = []
    c.on('reconnecting', reconnecting)
    c.on('disconnect', (e) => disconnects.push(e))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    let socketIdx = 0
    for (let i = 0; i < 6; i++) {
      simulateBoomDisconnect(socks[socketIdx]!, 428)
      await tick()
      vi.advanceTimersByTime(1000)
      await tick()
      socketIdx += 1
    }
    expect(reconnecting).toHaveBeenCalledTimes(5)
    expect(disconnects[disconnects.length - 1]?.willReconnect).toBe(false)
  })

  it('maxAttempts:3 cap respected (no opens between)', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(6)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1, jitterFactor: 0, maxAttempts: 3 },
      autoConnect: false,
    })
    const reconnecting = vi.fn()
    c.on('reconnecting', reconnecting)
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    let socketIdx = 0
    for (let i = 0; i < 4; i++) {
      simulateBoomDisconnect(socks[socketIdx]!, 428)
      await tick()
      vi.advanceTimersByTime(1000)
      await tick()
      socketIdx += 1
    }
    expect(reconnecting).toHaveBeenCalledTimes(3)
  })

  it('successful connect mid-storm resets attempt counter', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(6)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1000, jitterFactor: 0 },
      autoConnect: false,
    })
    const delays: number[] = []
    c.on('reconnecting', (e) => delays.push(e.delayMs))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 428)
    await tick()
    vi.advanceTimersByTime(2000)
    await tick()
    socks[1]!.triggerConnectionUpdate({ connection: 'open' })
    await tick()
    simulateBoomDisconnect(socks[1]!, 428)
    await tick()
    vi.advanceTimersByTime(2000)
    await tick()
    socks[2]!.triggerConnectionUpdate({ connection: 'open' })
    await tick()
    expect(delays[0]).toBe(1000)
    expect(delays[1]).toBe(1000)
  })

  it('disconnect() during reconnect timer cancels pending retry', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 10000, jitterFactor: 0 },
      autoConnect: false,
    })
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 428)
    await tick()
    expect(c.state).toBe('reconnecting')
    await c.disconnect()
    vi.advanceTimersByTime(20000)
    await tick()
    expect(c.state).toBe('disconnected')
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })

  it('reconnect.enabled=false suppresses entire storm', async () => {
    const socks = queueSockets(2)
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, reconnect: { enabled: false }, autoConnect: false })
    const reconnecting = vi.fn()
    c.on('reconnecting', reconnecting)
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 428)
    await new Promise((r) => setTimeout(r, 5))
    expect(reconnecting).not.toHaveBeenCalled()
  })

  it('maxDelayMs caps long backoffs', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(10)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1000, maxDelayMs: 5000, jitterFactor: 0 },
      autoConnect: false,
    })
    const delays: number[] = []
    c.on('reconnecting', (e) => delays.push(e.delayMs))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    let idx = 0
    for (let i = 0; i < 7; i++) {
      simulateBoomDisconnect(socks[idx]!, 428)
      await tick()
      vi.advanceTimersByTime(60000)
      await tick()
      idx += 1
    }
    expect(delays.every((d) => d <= 5000)).toBe(true)
    expect(delays[delays.length - 1]).toBe(5000)
  })

  it('reconnect.maxAttempts=0 produces no retries', async () => {
    const socks = queueSockets(2)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { maxAttempts: 0 },
      autoConnect: false,
    })
    const reconnecting = vi.fn()
    const disconnects: Array<{ willReconnect: boolean }> = []
    c.on('reconnecting', reconnecting)
    c.on('disconnect', (e) => disconnects.push(e))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 428)
    await new Promise((r) => setTimeout(r, 5))
    expect(reconnecting).not.toHaveBeenCalled()
    expect(disconnects[0]?.willReconnect).toBe(false)
  })

  it('connection-lost (408) also triggers reconnect path', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 100, jitterFactor: 0 },
      autoConnect: false,
    })
    const reasons: string[] = []
    c.on('reconnecting', (e) => reasons.push(e.reason))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 408)
    await tick()
    expect(reasons).toContain('connection-lost')
  })

  it('restart-required (515) reconnects', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 100, jitterFactor: 0 },
      autoConnect: false,
    })
    const reasons: string[] = []
    c.on('reconnecting', (e) => reasons.push(e.reason))
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 515)
    await tick()
    expect(reasons).toContain('restart-required')
  })

  it('connect() promise resolves when the first attempt reconnects before opening', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 100, jitterFactor: 0 },
      autoConnect: false,
    })
    let resolved = false
    const p = c.connect().then(() => {
      resolved = true
    })
    simulateBoomDisconnect(socks[0]!, 515)
    await tick()
    expect(resolved).toBe(false)
    vi.advanceTimersByTime(100)
    await tick()
    socks[1]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    expect(resolved).toBe(true)
  })

  it('logout during reconnect cancels pending retry and reaches disconnected', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 10000, jitterFactor: 0 },
      autoConnect: false,
    })
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 428)
    await tick()
    expect(c.state).toBe('reconnecting')
    await c.logout()
    vi.advanceTimersByTime(20000)
    await tick()
    expect(c.state).toBe('disconnected')
    expect(makeWASocketMock).toHaveBeenCalledTimes(1)
  })
})
