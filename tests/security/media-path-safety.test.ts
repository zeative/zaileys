import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { loadMedia } from '../../src/builder/media-loader.js'

const AUTH_FILE = path.join('.zaileys', 'auth', 'default', 'creds.json')

describe('media loading cannot exfiltrate the session', () => {
  beforeEach(async () => {
    await fs.mkdir(path.dirname(AUTH_FILE), { recursive: true })
    await fs.writeFile(AUTH_FILE, '{"noiseKey":"SECRET"}', 'utf8')
  })

  afterEach(async () => {
    await fs.rm(AUTH_FILE, { force: true })
  })

  it('refuses to read creds.json as media', async () => {
    await expect(loadMedia(AUTH_FILE)).rejects.toThrow(/protected directory/)
  })

  it('refuses a traversal path that lands inside the auth directory', async () => {
    await expect(loadMedia(path.join('docs', '..', AUTH_FILE))).rejects.toThrow(/protected directory/)
  })

  it('refuses a file: URL pointing at the auth directory', async () => {
    const url = new URL(`file://${path.resolve(AUTH_FILE)}`)
    await expect(loadMedia(url)).rejects.toThrow(/protected directory/)
  })

  it('still loads an ordinary local file — sendImage(jid, "./foto.png") keeps working', async () => {
    const file = path.join('.zaileys-test-ok.bin')
    await fs.writeFile(file, Buffer.alloc(8))
    try {
      const out = await loadMedia(file)
      expect(out.size).toBe(8)
    } finally {
      await fs.rm(file, { force: true })
    }
  })
})

describe('media loading blocks SSRF targets', () => {
  it.each([
    'http://127.0.0.1/x.png',
    'http://localhost:6379/x.png',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/x.png',
    'http://192.168.1.1/x.png',
    'http://172.16.0.1/x.png',
  ])('refuses %s', async (url) => {
    await expect(loadMedia(url)).rejects.toThrow(/private address/)
  })

  it('refuses a non-http scheme', async () => {
    await expect(loadMedia(new URL('ftp://example.com/x.png'))).rejects.toThrow(/scheme/)
  })

  it('allows a private address when explicitly opted in', async () => {
    await expect(
      loadMedia('http://127.0.0.1:1/x.png', { allowPrivateNetwork: true, timeoutMs: 300 }),
    ).rejects.toThrow(/fetch .* failed|fetch failed/)
  })
})

describe('strict mode', () => {
  it('rejects plain-string paths when allowLocalPaths is false', async () => {
    await expect(loadMedia('./whatever.png', { allowLocalPaths: false })).rejects.toThrow(/disabled/)
  })
})

describe('sessionId cannot escape the auth directory', () => {
  it.each(['../../..', 'a/b', '..', 'a\\b', 'x'.repeat(65), '', 'a b', 'a;rm'])(
    'rejects %j',
    async (bad) => {
      const { Client } = await import('../../src/client/client.js')
      expect(() => new Client({ sessionId: bad, autoConnect: false })).toThrow(/invalid sessionId/)
    },
  )

  it('accepts ordinary ids', async () => {
    const { Client } = await import('../../src/client/client.js')
    for (const ok of ['default', 'tenant-01', 'a_b-9']) {
      expect(() => new Client({ sessionId: ok, autoConnect: false })).not.toThrow()
    }
  })
})
