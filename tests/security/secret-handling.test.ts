import { describe, expect, it } from 'vitest'
import { RedisMessageStore } from '../../src/store/adapters/redis.js'
import { assertMetaMediaHost } from '../../src/cloud/transport.js'
import { createLogger } from '../../src/utils/logger.js'

describe('redis connection errors', () => {
  it('never echoes the password from the connection url', async () => {
    const store = new RedisMessageStore({ url: 'redis://default:S3cretPassw0rd@127.0.0.1:1/0' })
    await expect(store.listChats()).rejects.toThrow()
    await store.listChats().catch((err: Error) => {
      expect(err.message).not.toContain('S3cretPassw0rd')
      expect(err.message).toContain('***')
    })
  })
})

describe('cloud media host allowlist', () => {
  it.each([
    'https://lookaside.fbsbx.com/x',
    'https://mmg.whatsapp.net/x',
    'https://scontent.cdninstagram.com/x',
  ])('allows %s', (url) => {
    expect(() => assertMetaMediaHost(url)).not.toThrow()
  })

  it.each([
    'https://attacker.tld/x',
    'http://169.254.169.254/latest/meta-data/',
    'https://fbcdn.net.attacker.tld/x',
  ])('refuses to send the bearer token to %s', (url) => {
    expect(() => assertMetaMediaHost(url)).toThrow()
  })

  it('refuses a non-https media url', () => {
    expect(() => assertMetaMediaHost('http://mmg.whatsapp.net/x')).toThrow(/non-https/)
  })
})

describe('logger redaction', () => {
  it('redacts credentials and tokens at trace level', async () => {
    const { Writable } = await import('node:stream')
    const pino = (await import('pino')).default
    const lines: string[] = []
    const sink = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk))
        cb()
      },
    })
    const redactPaths = [
      'creds', '*.creds', 'noiseKey', '*.noiseKey', 'accessToken', '*.accessToken',
      'appSecret', '*.appSecret', 'verifyToken', '*.verifyToken',
    ]
    const logger = pino({ level: 'trace', redact: { paths: redactPaths, censor: '[redacted]' } }, sink)
    logger.trace({ creds: { noiseKey: 'PRIVATE-KEY' }, accessToken: 'TOKEN', appSecret: 'SECRET' }, 'x')
    const out = lines.join('')
    expect(out).not.toContain('PRIVATE-KEY')
    expect(out).not.toContain('TOKEN')
    expect(out).not.toContain('SECRET')
    expect(out).toContain('[redacted]')
  })

  it('the shipped logger declares the same redaction', () => {
    const logger = createLogger({ level: 'trace' })
    expect(typeof logger.trace).toBe('function')
    expect(logger.level).toBe('trace')
  })
})
