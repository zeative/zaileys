import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { makeIntegrationSocket, simulateBoomDisconnect } from '../_helpers/mock-socket-integration.js'

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
import { FileAuthStore } from '../../src/auth/adapters/file.js'

let tmpRoot: string

beforeEach(async () => {
  makeWASocketMock.mockReset()
  initAuthCredsMock.mockClear()
  tmpRoot = path.join(tmpdir(), `zaileys-it-${randomUUID()}`)
  await fs.mkdir(tmpRoot, { recursive: true })
})

afterEach(async () => {
  vi.useRealTimers()
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

async function seedAuthDir(basePath: string): Promise<void> {
  await fs.mkdir(basePath, { recursive: true })
  await fs.writeFile(path.join(basePath, 'creds.json'), JSON.stringify({ seeded: true }))
  const signalDir = path.join(basePath, 'signal', 'pre-key')
  await fs.mkdir(signalDir, { recursive: true })
  await fs.writeFile(path.join(signalDir, '1.json'), JSON.stringify({ id: 1 }))
}

async function listAuthFiles(basePath: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else out.push(full)
    }
  }
  await walk(basePath)
  return out
}

/** Poll until the auth dir is empty (or timeout) — the async wipe races a fixed sleep under load. */
async function waitForEmpty(basePath: string, timeoutMs = 4000): Promise<string[]> {
  const deadline = Date.now() + timeoutMs
  let files = await listAuthFiles(basePath)
  while (files.length > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15))
    files = await listAuthFiles(basePath)
  }
  return files
}

async function bootWith(basePath: string) {
  const sock = makeIntegrationSocket({ user: { id: 'fatal@s.whatsapp.net' } })
  makeWASocketMock.mockReturnValue(sock)
  const store = new FileAuthStore({ basePath })
  const c = new Client({ auth: store, qrTerminal: false, reconnect: { initialDelayMs: 1, jitterFactor: 0 }, autoConnect: false })
  const p = c.connect()
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { c, sock, store }
}

describe('integration: fatal disconnect clears FileAuthStore', () => {
  it.each([
    [403, 'forbidden'],
    [440, 'connection-replaced'],
  ] as const)('status %i wipes creds.json + signal files', async (code, _reason) => {
    const basePath = path.join(tmpRoot, `session-${code}`)
    await seedAuthDir(basePath)
    const { sock } = await bootWith(basePath)
    simulateBoomDisconnect(sock, code)
    expect(await waitForEmpty(basePath)).toHaveLength(0)
  })

  // 401 right after connect is confirmed via reconnect before wiping (issue #54):
  // the first close preserves files, a second 401 (retry never opens) clears them.
  it('status 401 wipes only after a reconnect confirms the logout', async () => {
    const basePath = path.join(tmpRoot, 'session-401')
    await seedAuthDir(basePath)
    const { sock } = await bootWith(basePath)
    simulateBoomDisconnect(sock, 401)
    await new Promise((r) => setTimeout(r, 20))
    expect((await listAuthFiles(basePath)).length).toBeGreaterThan(0)
    await new Promise((r) => setTimeout(r, 3100)) // wait out POST_OPEN_LOGOUT_RETRY_DELAY_MS
    simulateBoomDisconnect(sock, 401)
    expect(await waitForEmpty(basePath)).toHaveLength(0)
  })

  it('non-fatal 428 preserves auth files', async () => {
    const basePath = path.join(tmpRoot, 'session-428')
    await seedAuthDir(basePath)
    const { sock, c } = await bootWith(basePath)
    simulateBoomDisconnect(sock, 428)
    await new Promise((r) => setTimeout(r, 20))
    await c.disconnect().catch(() => undefined)
    const files = await listAuthFiles(basePath)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.endsWith('creds.json'))).toBe(true)
  })

  it('bad-session (500) clears auth AND reconnect scheduled', async () => {
    const basePath = path.join(tmpRoot, 'session-500')
    await seedAuthDir(basePath)
    const sock = makeIntegrationSocket({ user: { id: 'bs@s.whatsapp.net' } })
    const sock2 = makeIntegrationSocket({ user: { id: 'bs@s.whatsapp.net' } })
    let idx = 0
    makeWASocketMock.mockImplementation(() => (idx++ === 0 ? sock : sock2))
    const store = new FileAuthStore({ basePath })
    const c = new Client({ auth: store, qrTerminal: false, reconnect: { initialDelayMs: 50, jitterFactor: 0 }, autoConnect: false })
    const reconnecting = vi.fn()
    c.on('reconnecting', reconnecting)
    const p = c.connect()
    sock.triggerConnectionUpdate({ connection: 'open' })
    await p
    simulateBoomDisconnect(sock, 500)
    expect(await waitForEmpty(basePath)).toHaveLength(0)
    expect(reconnecting).toHaveBeenCalled()
    await c.disconnect().catch(() => undefined)
  })

  it('logout() wipes file-based auth completely', async () => {
    const basePath = path.join(tmpRoot, 'session-logout')
    await seedAuthDir(basePath)
    const { c } = await bootWith(basePath)
    await c.logout()
    expect(await waitForEmpty(basePath)).toHaveLength(0)
  })

  it('graceful disconnect preserves auth files', async () => {
    const basePath = path.join(tmpRoot, 'session-graceful')
    await seedAuthDir(basePath)
    const { c } = await bootWith(basePath)
    await c.disconnect()
    const files = await listAuthFiles(basePath)
    expect(files.length).toBeGreaterThan(0)
    expect(files.some((f) => f.endsWith('creds.json'))).toBe(true)
  })

  it('connection-lost (408) preserves auth files', async () => {
    const basePath = path.join(tmpRoot, 'session-408')
    await seedAuthDir(basePath)
    const { sock, c } = await bootWith(basePath)
    simulateBoomDisconnect(sock, 408)
    await new Promise((r) => setTimeout(r, 20))
    await c.disconnect().catch(() => undefined)
    const files = await listAuthFiles(basePath)
    expect(files.some((f) => f.endsWith('creds.json'))).toBe(true)
  })

  it('restart-required (515) preserves auth files', async () => {
    const basePath = path.join(tmpRoot, 'session-515')
    await seedAuthDir(basePath)
    const { sock, c } = await bootWith(basePath)
    simulateBoomDisconnect(sock, 515)
    await new Promise((r) => setTimeout(r, 20))
    await c.disconnect().catch(() => undefined)
    const files = await listAuthFiles(basePath)
    expect(files.some((f) => f.endsWith('creds.json'))).toBe(true)
  })

  it('multi-instance with isolated basePaths: clearing one does not affect the other', async () => {
    const pathA = path.join(tmpRoot, 'multi-a')
    const pathB = path.join(tmpRoot, 'multi-b')
    await seedAuthDir(pathA)
    await seedAuthDir(pathB)
    const sockA = makeIntegrationSocket({ user: { id: 'a@x' } })
    const sockB = makeIntegrationSocket({ user: { id: 'b@x' } })
    let idx = 0
    makeWASocketMock.mockImplementation(() => (idx++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'a', auth: new FileAuthStore({ basePath: pathA }), qrTerminal: false, autoConnect: false })
    const cB = new Client({ sessionId: 'b', auth: new FileAuthStore({ basePath: pathB }), qrTerminal: false, autoConnect: false })
    const pA = cA.connect()
    const pB = cB.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await Promise.all([pA, pB])
    simulateBoomDisconnect(sockA, 440)
    expect(await waitForEmpty(pathA)).toHaveLength(0)
    expect((await listAuthFiles(pathB)).length).toBeGreaterThan(0)
    await cB.disconnect()
  })

  it('two Clients with same sessionId but different basePaths stay isolated', async () => {
    const pathA = path.join(tmpRoot, 'samesid-a')
    const pathB = path.join(tmpRoot, 'samesid-b')
    await seedAuthDir(pathA)
    await seedAuthDir(pathB)
    const sockA = makeIntegrationSocket({ user: { id: 'sa@x' } })
    const sockB = makeIntegrationSocket({ user: { id: 'sb@x' } })
    let idx = 0
    makeWASocketMock.mockImplementation(() => (idx++ === 0 ? sockA : sockB))
    const cA = new Client({ sessionId: 'shared', auth: new FileAuthStore({ basePath: pathA }), qrTerminal: false, autoConnect: false })
    const cB = new Client({ sessionId: 'shared', auth: new FileAuthStore({ basePath: pathB }), qrTerminal: false, autoConnect: false })
    const pA = cA.connect()
    const pB = cB.connect()
    sockA.triggerConnectionUpdate({ connection: 'open' })
    sockB.triggerConnectionUpdate({ connection: 'open' })
    await Promise.all([pA, pB])
    expect(cA.state).toBe('connected')
    expect(cB.state).toBe('connected')
    await cA.disconnect()
    await cB.disconnect()
  })
})
