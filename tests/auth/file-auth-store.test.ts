import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileAuthStore } from '../../src/auth/adapters/file.js'
import { runAuthStoreContract } from '../contracts/index.js'
import { sampleCreds } from '../contracts/fixtures.js'

const freshBase = (): string =>
  path.join(os.tmpdir(), `zaileys-file-auth-${randomBytes(8).toString('hex')}`)

const factoryDirs: string[] = []
const factory = (): FileAuthStore => {
  const basePath = freshBase()
  factoryDirs.push(basePath)
  return new FileAuthStore({ basePath })
}

runAuthStoreContract('FileAuthStore', factory, async () => {
  await Promise.all(
    factoryDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => undefined)),
  )
})

describe('FileAuthStore — adapter specifics', () => {
  let basePath: string

  beforeEach(() => {
    basePath = freshBase()
  })

  afterEach(async () => {
    await fs.rm(basePath, { recursive: true, force: true }).catch(() => undefined)
  })

  it('F1: creds.json exists on disk after writeCreds', async () => {
    const store = new FileAuthStore({ basePath })
    await store.creds.writeCreds(sampleCreds())
    await expect(fs.access(path.join(basePath, 'creds.json'))).resolves.toBeUndefined()
  })

  it('F2: signal/pre-key/1.json exists on disk after write', async () => {
    const store = new FileAuthStore({ basePath })
    await store.signal.write({ 'pre-key': { '1': { public: Buffer.alloc(32, 1), private: Buffer.alloc(32, 2) } } })
    await expect(fs.access(path.join(basePath, 'signal', 'pre-key', '1.json'))).resolves.toBeUndefined()
  })

  it('F3: JID with special chars round-trips via sanitized filename', async () => {
    const store = new FileAuthStore({ basePath })
    const id = '5511999999999:1@s.whatsapp.net'
    await store.signal.write({ session: { [id]: Uint8Array.from([7, 8, 9]) } })
    const dir = path.join(basePath, 'signal', 'session')
    const files = await fs.readdir(dir)
    expect(files.length).toBe(1)
    expect(files[0]).not.toContain(':')
    expect(files[0]).not.toContain('@')
    const read = await store.signal.read('session', [id])
    expect(Buffer.from(read[id] as Uint8Array).equals(Buffer.from([7, 8, 9]))).toBe(true)
  })

  it('F4: mid-write failure leaves original file untouched and cleans up tmp', async () => {
    const store = new FileAuthStore({ basePath })
    await store.creds.writeCreds(sampleCreds())
    const originalContent = await fs.readFile(path.join(basePath, 'creds.json'), 'utf8')

    const spy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('rename boom'))
    await expect(store.creds.writeCreds(sampleCreds())).rejects.toMatchObject({
      code: 'STORE_WRITE_FAILED',
    })
    spy.mockRestore()

    const after = await fs.readFile(path.join(basePath, 'creds.json'), 'utf8')
    expect(after).toBe(originalContent)
    const remaining = await fs.readdir(basePath)
    expect(remaining.filter((f) => f.startsWith('tmp-')).length).toBe(0)
  })

  it('F5: clear() removes basePath entirely', async () => {
    const store = new FileAuthStore({ basePath })
    await store.creds.writeCreds(sampleCreds())
    await store.signal.write({ session: { '1': Uint8Array.from([1]) } })
    await store.signal.clear()
    await expect(fs.access(basePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('F6: 50 parallel writes to same id leave a readable JSON (no torn writes)', async () => {
    const store = new FileAuthStore({ basePath })
    const writes = Array.from({ length: 50 }, (_, i) =>
      store.signal.write({ session: { '1': Uint8Array.from([i & 0xff]) } }),
    )
    await Promise.all(writes)
    const read = await store.signal.read('session', ['1'])
    expect(read['1']).toBeDefined()
    expect((read['1'] as Uint8Array).length).toBe(1)
  })

  it('default basePath is ./.zaileys/auth when not provided', () => {
    const store = new FileAuthStore()
    expect(store).toBeInstanceOf(FileAuthStore)
  })
})
