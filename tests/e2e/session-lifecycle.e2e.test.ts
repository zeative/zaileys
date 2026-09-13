import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { makeIntegrationSocket, simulateBoomDisconnect } from '../_helpers/mock-socket-integration.js'

const { makeWASocketMock, initAuthCredsMock } = vi.hoisted(() => ({
  makeWASocketMock: vi.fn(),
  initAuthCredsMock: vi.fn(() => ({ registered: false })),
}))

vi.mock('baileys', () => ({
  default: makeWASocketMock,
  makeWASocket: makeWASocketMock,
  initAuthCreds: initAuthCredsMock,
  DisconnectReason: {
    loggedOut: 401, forbidden: 403, connectionLost: 408, multideviceMismatch: 411,
    connectionClosed: 428, connectionReplaced: 440, badSession: 500,
    unavailableService: 503, restartRequired: 515, timedOut: 408,
  },
  makeCacheableSignalKeyStore: vi.fn((k: unknown) => k),
  BufferJSON: { replacer: (_k: string, v: unknown) => v, reviver: (_k: string, v: unknown) => v },
}))

import { Client } from '../../src/client/client.js'
import { FileAuthStore } from '../../src/auth/adapters/file.js'

const REAL_CREDS = {
  me: { id: '628111@s.whatsapp.net', name: 'Bot' },
  noiseKey: 'REAL-NOISE',
  routingInfo: 'ROUTE-A',
  registered: true,
}

let basePath: string

const seed = async (): Promise<void> => {
  await fs.mkdir(path.join(basePath, 'signal', 'pre-key'), { recursive: true })
  await fs.writeFile(path.join(basePath, 'creds.json'), JSON.stringify(REAL_CREDS), 'utf8')
  await fs.writeFile(path.join(basePath, 'signal', 'pre-key', '1.json'), '{"k":1}', 'utf8')
}

const liveAuthFiles = async (): Promise<string[]> => {
  const out: string[] = []
  const walk = async (dir: string): Promise<void> => {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (!e.name.startsWith('creds.revoked-')) out.push(full)
    }
  }
  await walk(basePath)
  return out
}

const boot = async () => {
  const sock = makeIntegrationSocket({ user: { id: REAL_CREDS.me.id, name: 'Bot' } })
  makeWASocketMock.mockReturnValue(sock)
  const client = new Client({
    sessionId: 'e2e',
    auth: new FileAuthStore({ basePath }),
    qrTerminal: false,
    autoConnect: false,
    statusLog: false,
    reconnect: { enabled: false },
  })
  const qr = vi.fn()
  client.on('qr', qr)
  const p = client.connect()
  await vi.waitFor(() => expect(makeWASocketMock).toHaveBeenCalled())
  sock.triggerConnectionUpdate({ connection: 'open' })
  await p
  return { client, sock, qr }
}

beforeEach(async () => {
  makeWASocketMock.mockReset()
  basePath = path.join(os.tmpdir(), `zaileys-e2e-${randomBytes(6).toString('hex')}`)
  await seed()
})

afterEach(async () => {
  await fs.rm(basePath, { recursive: true, force: true })
})

describe('e2e: a stored session survives real-world disconnects', () => {
  it('logs in with stored creds, forwards routingInfo, and shows no QR', async () => {
    const { client, qr } = await boot()
    const creds = makeWASocketMock.mock.calls[0]![0].auth.creds
    expect(creds.me).toEqual(REAL_CREDS.me)
    expect(creds.routingInfo).toBe('ROUTE-A')
    expect(qr).not.toHaveBeenCalled()
    expect(client.state).toBe('connected')
    await client.disconnect().catch(() => undefined)
  })

  it.each([
    [500, 'bad-session'],
    [440, 'connection-replaced'],
    [403, 'forbidden'],
    [428, 'connection-closed'],
    [408, 'connection-lost'],
    [515, 'restart-required'],
  ])('survives a %i (%s) close with credentials intact', async (code) => {
    const { client, sock } = await boot()
    simulateBoomDisconnect(sock, code)
    await new Promise((r) => setTimeout(r, 40))
    const files = await liveAuthFiles()
    expect(files.some((f) => f.endsWith('creds.json'))).toBe(true)
    const stored = JSON.parse(await fs.readFile(path.join(basePath, 'creds.json'), 'utf8'))
    expect(stored.me).toEqual(REAL_CREDS.me)
    await client.disconnect().catch(() => undefined)
  })

  it('an explicit logout wipes the live session but leaves a recoverable snapshot', async () => {
    const { client } = await boot()
    await client.logout()
    await new Promise((r) => setTimeout(r, 40))
    expect(await liveAuthFiles()).toHaveLength(0)
    const remaining = await fs.readdir(basePath)
    const snapshots = remaining.filter((n) => n.startsWith('creds.revoked-'))
    expect(snapshots).toHaveLength(1)
    const recovered = JSON.parse(await fs.readFile(path.join(basePath, snapshots[0]!), 'utf8'))
    expect(recovered.me).toEqual(REAL_CREDS.me)
  })

  it('a QR for the registered session aborts instead of re-pairing', async () => {
    const { client, sock, qr } = await boot()
    sock.triggerConnectionUpdate({ qr: 'SHOULD-NOT-PAIR' })
    await new Promise((r) => setTimeout(r, 40))
    expect(qr).not.toHaveBeenCalled()
    const stored = JSON.parse(await fs.readFile(path.join(basePath, 'creds.json'), 'utf8'))
    expect(stored.me).toEqual(REAL_CREDS.me)
    await client.disconnect().catch(() => undefined)
  })

  it('credentials on disk stay owner-only after a reconnect cycle', async () => {
    if (process.platform === 'win32') return
    const { client, sock } = await boot()
    sock.triggerCredsUpdate({ lastAccountSyncTimestamp: 99 })
    await new Promise((r) => setTimeout(r, 40))
    const mode = (await fs.stat(path.join(basePath, 'creds.json'))).mode & 0o777
    expect(mode).toBe(0o600)
    await client.disconnect().catch(() => undefined)
  })
})
