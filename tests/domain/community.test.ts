import { beforeEach, describe, expect, it } from 'vitest'
import { CommunityModule } from '../../src/domain/community.js'
import { ZaileysDomainError } from '../../src/domain/errors.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

describe('CommunityModule', () => {
  let socket: MockSocket
  let community: CommunityModule

  beforeEach(() => {
    socket = createMockSocket()
    community = new CommunityModule(() => socket as unknown as DomainSocketLike)
  })

  describe('create', () => {
    it('calls communityCreate with subject and body', async () => {
      const result = await community.create('My Community', 'Description')
      expect(socket.communityCreate).toHaveBeenCalledWith('My Community', 'Description')
      expect(result).toEqual(
        expect.objectContaining({ id: '123@g.us', subject: 'mock' }),
      )
    })
  })

  describe('createGroup', () => {
    it('calls communityCreateGroup with subject, participants, communityId', async () => {
      const result = await community.createGroup('Sub', ['a@s.whatsapp.net'], '123@g.us')
      expect(socket.communityCreateGroup).toHaveBeenCalledWith('Sub', ['a@s.whatsapp.net'], '123@g.us')
      expect(result).toEqual(expect.objectContaining({ id: '456@g.us' }))
    })
  })

  describe('linkGroup', () => {
    it('swaps args: linkGroup(communityId, groupId) -> communityLinkGroup(groupId, communityId)', async () => {
      await community.linkGroup('123@g.us', '456@g.us')
      expect(socket.communityLinkGroup).toHaveBeenCalledWith('456@g.us', '123@g.us')
    })
  })

  describe('unlinkGroup', () => {
    it('swaps args: unlinkGroup(communityId, groupId) -> communityUnlinkGroup(groupId, communityId)', async () => {
      await community.unlinkGroup('123@g.us', '456@g.us')
      expect(socket.communityUnlinkGroup).toHaveBeenCalledWith('456@g.us', '123@g.us')
    })
  })

  describe('subGroups', () => {
    it('calls communityFetchLinkedGroups and extracts linkedGroups', async () => {
      const result = await community.subGroups('123@g.us')
      expect(socket.communityFetchLinkedGroups).toHaveBeenCalledWith('123@g.us')
      expect(result).toEqual([
        { id: '456@g.us', subject: 'sub', creation: undefined, owner: undefined, size: undefined },
      ])
    })

    it('returns the linkedGroups array, not the wrapper object', async () => {
      const result = await community.subGroups('123@g.us')
      expect(Array.isArray(result)).toBe(true)
      expect(result[0]).not.toHaveProperty('communityJid')
      expect(result[0]).not.toHaveProperty('linkedGroups')
    })
  })

  describe('leave', () => {
    it('calls communityLeave with communityId', async () => {
      await community.leave('123@g.us')
      expect(socket.communityLeave).toHaveBeenCalledWith('123@g.us')
    })
  })

  describe('updateSubject', () => {
    it('calls communityUpdateSubject with communityId and subject', async () => {
      await community.updateSubject('123@g.us', 'New Subject')
      expect(socket.communityUpdateSubject).toHaveBeenCalledWith('123@g.us', 'New Subject')
    })
  })

  describe('updateDescription', () => {
    it('calls communityUpdateDescription with communityId and description', async () => {
      await community.updateDescription('123@g.us', 'New Desc')
      expect(socket.communityUpdateDescription).toHaveBeenCalledWith('123@g.us', 'New Desc')
    })

    it('passes undefined description through', async () => {
      await community.updateDescription('123@g.us')
      expect(socket.communityUpdateDescription).toHaveBeenCalledWith('123@g.us', undefined)
    })
  })

  describe('inviteCode', () => {
    it('calls communityInviteCode and returns the code', async () => {
      const code = await community.inviteCode('123@g.us')
      expect(socket.communityInviteCode).toHaveBeenCalledWith('123@g.us')
      expect(code).toBe('MOCKINVITECODE')
    })
  })

  describe('revokeInvite', () => {
    it('calls communityRevokeInvite and returns the new code', async () => {
      const code = await community.revokeInvite('123@g.us')
      expect(socket.communityRevokeInvite).toHaveBeenCalledWith('123@g.us')
      expect(code).toBe('MOCKINVITECODE')
    })
  })

  describe('acceptInvite', () => {
    it('calls communityAcceptInvite with code', async () => {
      const result = await community.acceptInvite('INVITECODE')
      expect(socket.communityAcceptInvite).toHaveBeenCalledWith('INVITECODE')
      expect(result).toBe('123@g.us')
    })
  })

  describe('NOT_CONNECTED guards', () => {
    let disconnected: CommunityModule

    beforeEach(() => {
      disconnected = new CommunityModule(() => undefined)
    })

    const expectNotConnected = async (fn: () => Promise<unknown>) => {
      await expect(fn()).rejects.toMatchObject({
        name: 'ZaileysDomainError',
        code: 'NOT_CONNECTED',
      })
      await expect(fn()).rejects.toBeInstanceOf(ZaileysDomainError)
    }

    it('create throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.create('s', 'b'))
    })

    it('createGroup throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.createGroup('s', [], 'c'))
    })

    it('linkGroup throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.linkGroup('c', 'g'))
    })

    it('unlinkGroup throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.unlinkGroup('c', 'g'))
    })

    it('subGroups throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.subGroups('c'))
    })

    it('leave throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.leave('c'))
    })

    it('updateSubject throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.updateSubject('c', 's'))
    })

    it('updateDescription throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.updateDescription('c', 'd'))
    })

    it('inviteCode throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.inviteCode('c'))
    })

    it('revokeInvite throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.revokeInvite('c'))
    })

    it('acceptInvite throws NOT_CONNECTED', async () => {
      await expectNotConnected(() => disconnected.acceptInvite('code'))
    })
  })
})
