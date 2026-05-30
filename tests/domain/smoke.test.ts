import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as domain from '../../src/domain/index.js'
import { createMockSocket } from '../_helpers/mock-socket.js'

const SELF = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(SELF, '../../src/domain')

const DOMAIN_FILES = [
  'types.ts',
  'errors.ts',
  'socket-like.ts',
  'group.ts',
  'privacy.ts',
  'newsletter.ts',
  'community.ts',
  'index.ts',
] as const

const ANY_PATTERN = /:\s*any\b|\bas\s+any\b|<any>/

describe('barrel exports', () => {
  it('exposes the four domain module classes', () => {
    expect(typeof domain.GroupModule).toBe('function')
    expect(typeof domain.PrivacyModule).toBe('function')
    expect(typeof domain.NewsletterModule).toBe('function')
    expect(typeof domain.CommunityModule).toBe('function')
  })

  it('exposes ZaileysDomainError', () => {
    expect(typeof domain.ZaileysDomainError).toBe('function')
    const err = new domain.ZaileysDomainError('NOT_CONNECTED', 'x')
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('NOT_CONNECTED')
  })
})

describe('NOT_CONNECTED across modules', () => {
  const noSocket = () => undefined

  it('group method throws NOT_CONNECTED without a socket', async () => {
    await expect(new domain.GroupModule(noSocket).metadata('1@g.us')).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })

  it('privacy method throws NOT_CONNECTED without a socket', async () => {
    await expect(new domain.PrivacyModule(noSocket).get()).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })

  it('newsletter method throws NOT_CONNECTED without a socket', async () => {
    await expect(new domain.NewsletterModule(noSocket).follow('1@newsletter')).rejects.toMatchObject(
      { code: 'NOT_CONNECTED' },
    )
  })

  it('community method throws NOT_CONNECTED without a socket', async () => {
    await expect(new domain.CommunityModule(noSocket).create('c', 'b')).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })
})

describe('one method per module against a mock socket', () => {
  const sock = createMockSocket()
  const getSocket = () => sock as unknown as domain.DomainSocketLike

  it('group.create returns metadata', async () => {
    const meta = await new domain.GroupModule(getSocket).create('g', ['a@s.whatsapp.net'])
    expect(meta.id).toBe('123@g.us')
  })

  it('privacy.get returns settings', async () => {
    const settings = await new domain.PrivacyModule(getSocket).get()
    expect(settings.last).toBe('contacts')
  })

  it('newsletter.follow resolves', async () => {
    await expect(new domain.NewsletterModule(getSocket).follow('1@newsletter')).resolves.toBeUndefined()
    expect(sock.newsletterFollow).toHaveBeenCalledWith('1@newsletter')
  })

  it('community.create returns metadata', async () => {
    const meta = await new domain.CommunityModule(getSocket).create('c', 'body')
    expect(meta.id).toBe('123@g.us')
  })
})

describe('zero-any audit (src/domain)', () => {
  for (const file of DOMAIN_FILES) {
    it(`${file} contains no bare any`, () => {
      const src = readFileSync(resolve(SRC, file), 'utf8')
      const offenders = src
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !line.includes('as unknown as'))
        .filter(({ line }) => ANY_PATTERN.test(line))
      expect(offenders.map((o) => `${file}:${o.n}`)).toEqual([])
    })
  }
})
