import { vi } from 'vitest'
import { createMockSocket, type MockSocket, type MockSocketUser } from './mock-socket.js'

export interface IntegrationMockSocket extends MockSocket {
  eventLog: Array<{ type: string; payload: unknown; ts: number }>
}

export interface SimulateAuthFlowOptions {
  qrFirst?: boolean
  user?: MockSocketUser
  qrPayload?: string
  credsPayload?: unknown
}

export function makeIntegrationSocket(initial?: { user?: MockSocketUser }): IntegrationMockSocket {
  const base = createMockSocket(initial)
  const log: Array<{ type: string; payload: unknown; ts: number }> = []
  const origConnUpdate = base.triggerConnectionUpdate.bind(base)
  const origCredsUpdate = base.triggerCredsUpdate.bind(base)
  const wrapped: IntegrationMockSocket = Object.assign(base, {
    eventLog: log,
    triggerConnectionUpdate(update: Record<string, unknown>) {
      log.push({ type: 'connection.update', payload: update, ts: Date.now() })
      origConnUpdate(update)
    },
    triggerCredsUpdate(creds: unknown) {
      log.push({ type: 'creds.update', payload: creds, ts: Date.now() })
      origCredsUpdate(creds)
    },
  })
  return wrapped
}

export function simulateAuthFlow(socket: IntegrationMockSocket, opts: SimulateAuthFlowOptions = {}): void {
  if (opts.qrFirst !== false) {
    socket.triggerConnectionUpdate({ qr: opts.qrPayload ?? 'simulated-qr-payload' })
  }
  socket.triggerCredsUpdate(opts.credsPayload ?? { mock: true })
  socket.setUser(opts.user ?? { id: '123@s.whatsapp.net', name: 'TestUser' })
  socket.triggerConnectionUpdate({ connection: 'open' })
}

export function simulateBoomDisconnect(socket: IntegrationMockSocket, statusCode: number): void {
  const error = Object.assign(new Error(`boom ${statusCode}`), {
    output: { statusCode, payload: { statusCode, error: 'Boom', message: `boom ${statusCode}` }, headers: {} },
    isBoom: true,
  })
  socket.triggerConnectionUpdate({
    connection: 'close',
    lastDisconnect: { error, date: new Date() },
  })
}

export function createDeterministicRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function spyOnEv(socket: IntegrationMockSocket): { count: () => number } {
  return {
    count: () => socket.ev.listenerCount('connection.update') + socket.ev.listenerCount('creds.update'),
  }
}

export const mockVi = vi
