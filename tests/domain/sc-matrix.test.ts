import { describe, expect, it } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { decodeMemberTag } from '../../src/events/decoders/groups.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const connected = (): { client: Client; sock: MockSocket } => {
  const client = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
  const sock = createMockSocket()
  ;(client as unknown as { _socket: unknown })._socket = sock
  return { client, sock }
}

describe('SC#1 group lifecycle returns typed results', () => {
  it('group.create returns a typed GroupMetadata via baileys groupCreate', async () => {
    const { client, sock } = connected()
    const meta = await client.group.create('Team', ['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    expect(sock.groupCreate).toHaveBeenCalledWith('Team', ['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    expect(meta.id).toBe('123@g.us')
    expect(meta.subject).toBe('mock')
  })

  it('add/remove/promote/demote map to groupParticipantsUpdate with the right action and return typed results', async () => {
    const { client, sock } = connected()
    const add = await client.group.addMember('1@g.us', ['x@s.whatsapp.net'])
    const remove = await client.group.removeMember('1@g.us', ['x@s.whatsapp.net'])
    const promote = await client.group.promote('1@g.us', ['x@s.whatsapp.net'])
    const demote = await client.group.demote('1@g.us', ['x@s.whatsapp.net'])
    const actions = sock.groupParticipantsUpdate.mock.calls.map((c) => c[2])
    expect(actions).toEqual(['add', 'remove', 'promote', 'demote'])
    for (const result of [add, remove, promote, demote]) {
      expect(result).toEqual([{ jid: 'x@s.whatsapp.net', status: '200' }])
    }
  })

  it('updateSubject/leave/metadata route to the matching baileys calls', async () => {
    const { client, sock } = connected()
    await client.group.updateSubject('1@g.us', 'New')
    await client.group.leave('1@g.us')
    const meta = await client.group.metadata('1@g.us')
    expect(sock.groupUpdateSubject).toHaveBeenCalledWith('1@g.us', 'New')
    expect(sock.groupLeave).toHaveBeenCalledWith('1@g.us')
    expect(sock.groupMetadata).toHaveBeenCalledWith('1@g.us')
    expect(meta.id).toBe('123@g.us')
  })
})

describe('SC#2 tagMember round-trips with the member-tag event', () => {
  it('tagMember relays via updateMemberLabel', async () => {
    const { client, sock } = connected()
    await client.group.tagMember('1@g.us', 'member@s.whatsapp.net', 'VIP')
    expect(sock.updateMemberLabel).toHaveBeenCalledWith('1@g.us', 'VIP')
  })

  it('a tagMember-shaped event decodes back to a consistent payload', () => {
    const groupId = '1@g.us'
    const participant = 'member@s.whatsapp.net'
    const label = 'VIP'
    const decoded = decodeMemberTag({ groupId, participant, label, messageTimestamp: 1700 })
    expect(decoded).not.toBeNull()
    expect(decoded?.groupId).toBe(groupId)
    expect(decoded?.participant).toBe(participant)
    expect(decoded?.label).toBe(label)
    expect(decoded?.timestamp).toBe(1700)
  })

  it('rejects an incomplete member-tag payload', () => {
    expect(decodeMemberTag({ participant: 'x@s.whatsapp.net', label: 'L' })).toBeNull()
  })
})

describe('SC#3 privacy.set fans one typed config to many baileys methods', () => {
  it('a single set call fans out to exactly the defined keys with correct values', async () => {
    const { client, sock } = connected()
    await client.privacy.set({ lastSeen: 'contacts', online: 'all', readReceipts: false })
    expect(sock.updateLastSeenPrivacy).toHaveBeenCalledWith('contacts')
    expect(sock.updateOnlinePrivacy).toHaveBeenCalledWith('all')
    expect(sock.updateReadReceiptsPrivacy).toHaveBeenCalledWith('none')
  })

  it('skips undefined keys (partial config)', async () => {
    const { client, sock } = connected()
    await client.privacy.set({ lastSeen: 'contacts' })
    expect(sock.updateLastSeenPrivacy).toHaveBeenCalledTimes(1)
    expect(sock.updateOnlinePrivacy).not.toHaveBeenCalled()
    expect(sock.updateProfilePicturePrivacy).not.toHaveBeenCalled()
    expect(sock.updateStatusPrivacy).not.toHaveBeenCalled()
    expect(sock.updateReadReceiptsPrivacy).not.toHaveBeenCalled()
    expect(sock.updateGroupsAddPrivacy).not.toHaveBeenCalled()
  })

  it('maps the boolean readReceipts shorthand true to all', async () => {
    const { client, sock } = connected()
    await client.privacy.set({ readReceipts: true })
    expect(sock.updateReadReceiptsPrivacy).toHaveBeenCalledWith('all')
  })
})

describe('SC#4 newsletter v2 + community lifecycle (full pass)', () => {
  it('newsletter create/follow/unfollow/updateName route to the matching baileys methods', async () => {
    const { client, sock } = connected()
    await client.newsletter.create('Channel', { description: 'desc' })
    await client.newsletter.follow('n@newsletter')
    await client.newsletter.unfollow('n@newsletter')
    await client.newsletter.updateName('n@newsletter', 'Renamed')
    expect(sock.newsletterCreate).toHaveBeenCalledWith('Channel', 'desc')
    expect(sock.newsletterFollow).toHaveBeenCalledWith('n@newsletter')
    expect(sock.newsletterUnfollow).toHaveBeenCalledWith('n@newsletter')
    expect(sock.newsletterUpdateName).toHaveBeenCalledWith('n@newsletter', 'Renamed')
  })

  it('community create/createGroup/subGroups/leave route to the matching baileys methods', async () => {
    const { client, sock } = connected()
    const meta = await client.community.create('Community', 'body')
    await client.community.createGroup('Sub', ['a@s.whatsapp.net'], 'c@g.us')
    const subs = await client.community.subGroups('c@g.us')
    await client.community.leave('c@g.us')
    expect(sock.communityCreate).toHaveBeenCalledWith('Community', 'body')
    expect(sock.communityCreateGroup).toHaveBeenCalledWith('Sub', ['a@s.whatsapp.net'], 'c@g.us')
    expect(sock.communityFetchLinkedGroups).toHaveBeenCalledWith('c@g.us')
    expect(sock.communityLeave).toHaveBeenCalledWith('c@g.us')
    expect(meta.id).toBe('123@g.us')
    expect(subs).toEqual([{ id: '456@g.us', subject: 'sub', creation: undefined, owner: undefined, size: undefined }])
  })

  it('link/unlinkGroup apply the baileys argument-order swap (groupJid, communityJid)', async () => {
    const { client, sock } = connected()
    await client.community.linkGroup('c@g.us', 'g@g.us')
    await client.community.unlinkGroup('c@g.us', 'g@g.us')
    expect(sock.communityLinkGroup).toHaveBeenCalledWith('g@g.us', 'c@g.us')
    expect(sock.communityUnlinkGroup).toHaveBeenCalledWith('g@g.us', 'c@g.us')
  })
})

describe('SC#5 send resolves a username to a JID', () => {
  it('send(username) resolves through onWhatsApp before dispatch', async () => {
    const { client, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([{ jid: 'alice@s.whatsapp.net', exists: true }])
    await client.send('alice').text('hi')
    expect(sock.onWhatsApp).toHaveBeenCalledWith('alice')
    const [jid] = sock.sendMessage.mock.calls.at(-1) as [string]
    expect(jid).toBe('alice@s.whatsapp.net')
  })

  it('an unresolvable username rejects with USERNAME_NOT_FOUND and never dispatches', async () => {
    const { client, sock } = connected()
    sock.onWhatsApp.mockResolvedValueOnce([])
    await expect(client.send('ghost').text('hi')).rejects.toMatchObject({
      code: 'USERNAME_NOT_FOUND',
    })
    expect(sock.sendMessage).not.toHaveBeenCalled()
  })
})
