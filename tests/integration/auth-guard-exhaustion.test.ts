import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  makeIntegrationSocket,
  simulateBoomDisconnect,
  type IntegrationMockSocket,
} from '../_helpers/mock-socket-integration.js'

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

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('integration: auth-guard QR budget exhaustion', () => {
  it('stops after maxQrAttempts, emits auth-exhausted once, no further QR', async () => {
    const socks = queueSockets(2)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      authType: 'qr',
      authGuard: { maxQrAttempts: 3 },
      autoConnect: false,
    })
    const qr = vi.fn()
    const exhausted = vi.fn()
    c.on('qr', qr)
    c.on('auth-exhausted', exhausted)

    c.connect().catch(() => undefined)
    await tick()

    for (let i = 0; i < 6; i++) {
      socks[0]!.triggerConnectionUpdate({ qr: `qr-${i}` })
      await tick()
    }
    await settle()

    expect(qr).toHaveBeenCalledTimes(3)
    expect(exhausted).toHaveBeenCalledTimes(1)
    expect(exhausted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'qr', attempts: 3, max: 3 }),
    )
    expect(c.state).toBe('disconnected')
  })

  it('successful open resets the budget for the next auth cycle', async () => {
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      authType: 'qr',
      authGuard: { maxQrAttempts: 2 },
      autoConnect: false,
    })
    const exhausted = vi.fn()
    c.on('auth-exhausted', exhausted)

    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ qr: 'qr-a' })
    await tick()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p

    socks[0]!.triggerConnectionUpdate({ qr: 'qr-b' })
    socks[0]!.triggerConnectionUpdate({ qr: 'qr-c' })
    await tick()

    expect(exhausted).not.toHaveBeenCalled()
    await c.disconnect()
  })
})

describe('integration: pairing budget exhaustion across reconnects', () => {
  it('stops requesting pairing codes after maxPairingAttempts', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(6)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      authType: 'pairing',
      phoneNumber: '6281234567890',
      authGuard: { maxPairingAttempts: 2, pairingCooldownMs: 0 },
      reconnect: { initialDelayMs: 100, jitterFactor: 0 },
      autoConnect: false,
    })
    const exhausted = vi.fn()
    c.on('auth-exhausted', exhausted)

    c.connect().catch(() => undefined)
    await tick()

    let idx = 0
    for (let cycle = 0; cycle < 4; cycle++) {
      socks[idx]!.triggerConnectionUpdate({ qr: `pair-cycle-${cycle}` })
      await tick()
      simulateBoomDisconnect(socks[idx]!, 428)
      await tick()
      vi.advanceTimersByTime(200)
      await tick()
      idx += 1
    }

    const totalPairingCalls = socks.reduce(
      (sum, s) => sum + (s.requestPairingCode?.mock.calls.length ?? 0),
      0,
    )
    expect(totalPairingCalls).toBe(2)
    expect(exhausted).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'pairing', max: 2 }),
    )
  })
})

describe('integration: 429 rate-limited disconnect', () => {
  it('backs off with rateLimitedDelayMs instead of exponential', async () => {
    vi.useFakeTimers()
    const socks = queueSockets(3)
    const c = new Client({
      auth: new MemoryAuthStore(),
      qrTerminal: false,
      reconnect: { initialDelayMs: 1000, jitterFactor: 0, rateLimitedDelayMs: 300000 },
      autoConnect: false,
    })
    const delays: number[] = []
    const reasons: string[] = []
    c.on('reconnecting', (e) => {
      delays.push(e.delayMs)
      reasons.push(e.reason)
    })
    const p = c.connect()
    socks[0]!.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(socks[0]!, 429)
    await tick()
    expect(reasons).toContain('rate-limited')
    expect(delays[0]).toBe(300000)
  })
})
