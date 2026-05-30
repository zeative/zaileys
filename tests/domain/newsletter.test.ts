import { beforeEach, describe, expect, it } from 'vitest'
import { ZaileysDomainError } from '../../src/domain/errors.js'
import { NewsletterModule } from '../../src/domain/newsletter.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const NL = '123@newsletter'

let sock: MockSocket
let connected: NewsletterModule
let disconnected: NewsletterModule

beforeEach(() => {
  sock = createMockSocket()
  connected = new NewsletterModule(() => sock as unknown as DomainSocketLike)
  disconnected = new NewsletterModule(() => undefined)
})

describe('NewsletterModule.create', () => {
  it('calls newsletterCreate with name and undefined description', async () => {
    await connected.create('Tech')
    expect(sock.newsletterCreate).toHaveBeenCalledWith('Tech', undefined)
  })

  it('calls newsletterCreate with name and description', async () => {
    await connected.create('Tech', { description: 'daily news' })
    expect(sock.newsletterCreate).toHaveBeenCalledWith('Tech', 'daily news')
  })

  it('returns the created NewsletterMetadata', async () => {
    const result = await connected.create('Tech')
    expect(result.id).toBe('123@newsletter')
  })

  it('orchestrates updatePicture with the created id when picture is provided', async () => {
    const picture = Buffer.from('img')
    await connected.create('Tech', { picture })
    expect(sock.newsletterCreate).toHaveBeenCalledWith('Tech', undefined)
    expect(sock.newsletterUpdatePicture).toHaveBeenCalledWith('123@newsletter', picture)
  })

  it('does not call updatePicture when no picture is provided', async () => {
    await connected.create('Tech', { description: 'd' })
    expect(sock.newsletterUpdatePicture).not.toHaveBeenCalled()
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.create('Tech')).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.metadata', () => {
  it('calls newsletterMetadata with type jid and the given key', async () => {
    await connected.metadata(NL)
    expect(sock.newsletterMetadata).toHaveBeenCalledWith('jid', NL)
  })

  it('returns the resolved metadata', async () => {
    const result = await connected.metadata(NL)
    expect(result.id).toBe('123@newsletter')
  })

  it('throws NEWSLETTER_NOT_FOUND when baileys returns null', async () => {
    sock.newsletterMetadata.mockResolvedValueOnce(null)
    await expect(connected.metadata(NL)).rejects.toMatchObject({ code: 'NEWSLETTER_NOT_FOUND' })
  })

  it('throws a ZaileysDomainError instance on null', async () => {
    sock.newsletterMetadata.mockResolvedValueOnce(null)
    await expect(connected.metadata(NL)).rejects.toBeInstanceOf(ZaileysDomainError)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.metadata(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.follow', () => {
  it('calls newsletterFollow with the jid', async () => {
    await connected.follow(NL)
    expect(sock.newsletterFollow).toHaveBeenCalledWith(NL)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.follow(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.unfollow', () => {
  it('calls newsletterUnfollow with the jid', async () => {
    await connected.unfollow(NL)
    expect(sock.newsletterUnfollow).toHaveBeenCalledWith(NL)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.unfollow(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.delete', () => {
  it('calls newsletterDelete with the jid', async () => {
    await connected.delete(NL)
    expect(sock.newsletterDelete).toHaveBeenCalledWith(NL)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.delete(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.updateName', () => {
  it('calls newsletterUpdateName with jid and name', async () => {
    await connected.updateName(NL, 'New Name')
    expect(sock.newsletterUpdateName).toHaveBeenCalledWith(NL, 'New Name')
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.updateName(NL, 'x')).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.updateDescription', () => {
  it('calls newsletterUpdateDescription with jid and description', async () => {
    await connected.updateDescription(NL, 'New desc')
    expect(sock.newsletterUpdateDescription).toHaveBeenCalledWith(NL, 'New desc')
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.updateDescription(NL, 'x')).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })
})

describe('NewsletterModule.updatePicture', () => {
  it('calls newsletterUpdatePicture with jid and the buffer', async () => {
    const picture = Buffer.from('img')
    await connected.updatePicture(NL, picture)
    expect(sock.newsletterUpdatePicture).toHaveBeenCalledWith(NL, picture)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.updatePicture(NL, Buffer.from('x'))).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })
})

describe('NewsletterModule.mute', () => {
  it('calls newsletterMute with the jid', async () => {
    await connected.mute(NL)
    expect(sock.newsletterMute).toHaveBeenCalledWith(NL)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.mute(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})

describe('NewsletterModule.unmute', () => {
  it('calls newsletterUnmute with the jid', async () => {
    await connected.unmute(NL)
    expect(sock.newsletterUnmute).toHaveBeenCalledWith(NL)
  })

  it('throws NOT_CONNECTED when socket is undefined', async () => {
    await expect(disconnected.unmute(NL)).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})
