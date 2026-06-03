import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'
import {
  CommunityModule,
  GroupModule,
  NewsletterModule,
  PrivacyModule,
  ZaileysDomainError,
} from '../../src/domain/index.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const makeClient = (): Client =>
  new Client({
    auth: new MemoryAuthStore(),
    qrTerminal: false,
    autoConnect: false,
    operationGuard: { enabled: false },
  })

const injectSocket = (client: Client, socket: MockSocket | undefined): void => {
  ;(client as unknown as { _socket: unknown })._socket = socket
}

describe('Client domain namespace getters', () => {
  it('client.group returns a GroupModule', () => {
    expect(makeClient().group).toBeInstanceOf(GroupModule)
  })

  it('client.privacy returns a PrivacyModule', () => {
    expect(makeClient().privacy).toBeInstanceOf(PrivacyModule)
  })

  it('client.newsletter returns a NewsletterModule', () => {
    expect(makeClient().newsletter).toBeInstanceOf(NewsletterModule)
  })

  it('client.community returns a CommunityModule', () => {
    expect(makeClient().community).toBeInstanceOf(CommunityModule)
  })

  it('caches the group module across accesses', () => {
    const c = makeClient()
    expect(c.group).toBe(c.group)
  })

  it('caches the privacy module across accesses', () => {
    const c = makeClient()
    expect(c.privacy).toBe(c.privacy)
  })

  it('caches the newsletter module across accesses', () => {
    const c = makeClient()
    expect(c.newsletter).toBe(c.newsletter)
  })

  it('caches the community module across accesses', () => {
    const c = makeClient()
    expect(c.community).toBe(c.community)
  })

  it('does not share modules between client instances', () => {
    const a = makeClient()
    const b = makeClient()
    expect(a.group).not.toBe(b.group)
    expect(a.community).not.toBe(b.community)
  })

  it('accessing a getter before connect does not throw', () => {
    const c = makeClient()
    expect(() => c.group).not.toThrow()
    expect(() => c.privacy).not.toThrow()
    expect(() => c.newsletter).not.toThrow()
    expect(() => c.community).not.toThrow()
  })
})

describe('Client domain namespaces — NOT_CONNECTED guard', () => {
  it('group method throws NOT_CONNECTED before connect', async () => {
    await expect(makeClient().group.create('x', [])).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })

  it('group method rejects with ZaileysDomainError before connect', async () => {
    await expect(makeClient().group.metadata('g@g.us')).rejects.toBeInstanceOf(ZaileysDomainError)
  })

  it('privacy method throws NOT_CONNECTED before connect', async () => {
    await expect(makeClient().privacy.get()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })

  it('newsletter method throws NOT_CONNECTED before connect', async () => {
    await expect(makeClient().newsletter.create('n')).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })

  it('community method throws NOT_CONNECTED before connect', async () => {
    await expect(makeClient().community.create('c', '')).rejects.toMatchObject({
      code: 'NOT_CONNECTED',
    })
  })
})

describe('Client domain namespaces — reach the live socket', () => {
  it('group.create calls the injected socket groupCreate', async () => {
    const c = makeClient()
    const sock = createMockSocket()
    injectSocket(c, sock)
    await c.group.create('my group', ['a@s.whatsapp.net'])
    expect(sock.groupCreate).toHaveBeenCalledWith('my group', ['a@s.whatsapp.net'])
  })

  it('privacy.get calls the injected socket fetchPrivacySettings', async () => {
    const c = makeClient()
    const sock = createMockSocket()
    injectSocket(c, sock)
    await c.privacy.get()
    expect(sock.fetchPrivacySettings).toHaveBeenCalled()
  })

  it('newsletter.create calls the injected socket newsletterCreate', async () => {
    const c = makeClient()
    const sock = createMockSocket()
    injectSocket(c, sock)
    await c.newsletter.create('chan', { description: 'desc' })
    expect(sock.newsletterCreate).toHaveBeenCalledWith('chan', 'desc')
  })

  it('community.create calls the injected socket communityCreate', async () => {
    const c = makeClient()
    const sock = createMockSocket()
    injectSocket(c, sock)
    await c.community.create('hub', 'body')
    expect(sock.communityCreate).toHaveBeenCalledWith('hub', 'body')
  })

  it('reads the current socket, surviving a reconnect swap', async () => {
    const c = makeClient()
    const first = createMockSocket()
    injectSocket(c, first)
    const groupModule = c.group
    await groupModule.create('g1', [])
    expect(first.groupCreate).toHaveBeenCalledTimes(1)

    injectSocket(c, undefined)
    await expect(groupModule.create('g2', [])).rejects.toMatchObject({ code: 'NOT_CONNECTED' })

    const second = createMockSocket()
    injectSocket(c, second)
    await groupModule.create('g3', [])
    expect(second.groupCreate).toHaveBeenCalledTimes(1)
    expect(first.groupCreate).toHaveBeenCalledTimes(1)
    expect(c.group).toBe(groupModule)
  })
})
