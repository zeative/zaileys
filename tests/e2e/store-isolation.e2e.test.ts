import { describe, expect, it, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import { FileAuthStore } from '../../src/auth/adapters/file.js'
import { loadMedia } from '../../src/builder/media-loader.js'
import { sampleCreds } from '../contracts/fixtures.js'

let basePath: string

beforeEach(() => {
  basePath = path.join(os.tmpdir(), `zaileys-e2e-store-${randomBytes(6).toString('hex')}`)
})

describe('e2e: clearing the message store never touches the session', () => {
  it('memory store clear leaves the file-based session intact', async () => {
    const auth = new FileAuthStore({ basePath })
    await auth.creds.writeCreds(sampleCreds())
    const store = new MemoryMessageStore()
    await store.saveChat({ id: 'x@s.whatsapp.net' } as never)
    await store.clear()
    await expect(auth.creds.readCreds()).resolves.toBeDefined()
    await fs.rm(basePath, { recursive: true, force: true })
  })
})

describe('e2e: a bot echoing user input cannot leak its own session', () => {
  it('refuses to send creds.json as media, but still sends an ordinary file', async () => {
    /** The denial happens before any read, so nothing is ever written into the real .zaileys. */
    const attackerInput = path.join('.zaileys', 'auth', 'default', 'creds.json')
    await expect(loadMedia(attackerInput)).rejects.toThrow(/protected directory/)

    const ok = path.join(os.tmpdir(), `zaileys-ok-${randomBytes(4).toString('hex')}.bin`)
    await fs.writeFile(ok, Buffer.alloc(16))
    try {
      const loaded = await loadMedia(ok)
      expect(loaded.size).toBe(16)
    } finally {
      await fs.rm(ok, { force: true })
    }
  })
})
