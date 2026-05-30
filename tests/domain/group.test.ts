import { beforeEach, describe, expect, it } from 'vitest'
import { GroupModule } from '../../src/domain/group.js'
import { ZaileysDomainError } from '../../src/domain/errors.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'
import { decodeMemberTag } from '../../src/events/decoders/groups.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

const GROUP = 'g@g.us'
const MEMBER_A = 'a@s.whatsapp.net'
const MEMBER_B = 'b@s.whatsapp.net'

const connected = (mock: MockSocket): GroupModule =>
  new GroupModule(() => mock as unknown as DomainSocketLike)

const disconnected = (): GroupModule => new GroupModule(() => undefined)

const expectNotConnected = async (fn: () => Promise<unknown>): Promise<void> => {
  await expect(fn()).rejects.toMatchObject({
    name: 'ZaileysDomainError',
    code: 'NOT_CONNECTED',
  })
}

describe('GroupModule — create / participants / metadata / subject / description / leave', () => {
  let mock: MockSocket
  let group: GroupModule

  beforeEach(() => {
    mock = createMockSocket()
    group = connected(mock)
  })

  it('create calls groupCreate with subject + participants and returns metadata', async () => {
    const meta = await group.create('My Group', [MEMBER_A, MEMBER_B])
    expect(mock.groupCreate).toHaveBeenCalledWith('My Group', [MEMBER_A, MEMBER_B])
    expect(meta).toMatchObject({ id: '123@g.us', subject: 'mock' })
  })

  it('addMember calls groupParticipantsUpdate with action "add"', async () => {
    await group.addMember(GROUP, [MEMBER_A])
    expect(mock.groupParticipantsUpdate).toHaveBeenCalledWith(GROUP, [MEMBER_A], 'add')
  })

  it('removeMember calls groupParticipantsUpdate with action "remove"', async () => {
    await group.removeMember(GROUP, [MEMBER_A])
    expect(mock.groupParticipantsUpdate).toHaveBeenCalledWith(GROUP, [MEMBER_A], 'remove')
  })

  it('promote calls groupParticipantsUpdate with action "promote"', async () => {
    await group.promote(GROUP, [MEMBER_A])
    expect(mock.groupParticipantsUpdate).toHaveBeenCalledWith(GROUP, [MEMBER_A], 'promote')
  })

  it('demote calls groupParticipantsUpdate with action "demote"', async () => {
    await group.demote(GROUP, [MEMBER_A])
    expect(mock.groupParticipantsUpdate).toHaveBeenCalledWith(GROUP, [MEMBER_A], 'demote')
  })

  it('addMember maps raw result to { jid, status } and drops content', async () => {
    mock.groupParticipantsUpdate.mockResolvedValueOnce([
      { status: '200', jid: MEMBER_A, content: { tag: 'add' } },
      { status: '403', jid: MEMBER_B, content: { tag: 'error' } },
    ])
    const result = await group.addMember(GROUP, [MEMBER_A, MEMBER_B])
    expect(result).toEqual([
      { jid: MEMBER_A, status: '200' },
      { jid: MEMBER_B, status: '403' },
    ])
    for (const entry of result) {
      expect(entry).not.toHaveProperty('content')
    }
  })

  it('promote maps multiple participant results', async () => {
    mock.groupParticipantsUpdate.mockResolvedValueOnce([
      { status: '200', jid: MEMBER_A },
      { status: '200', jid: MEMBER_B },
    ])
    const result = await group.promote(GROUP, [MEMBER_A, MEMBER_B])
    expect(result).toHaveLength(2)
    expect(result[1]).toEqual({ jid: MEMBER_B, status: '200' })
  })

  it('updateSubject calls groupUpdateSubject and returns void', async () => {
    const r = await group.updateSubject(GROUP, 'New Subject')
    expect(mock.groupUpdateSubject).toHaveBeenCalledWith(GROUP, 'New Subject')
    expect(r).toBeUndefined()
  })

  it('updateDescription calls groupUpdateDescription with description', async () => {
    await group.updateDescription(GROUP, 'desc')
    expect(mock.groupUpdateDescription).toHaveBeenCalledWith(GROUP, 'desc')
  })

  it('updateDescription forwards undefined to clear the description', async () => {
    await group.updateDescription(GROUP)
    expect(mock.groupUpdateDescription).toHaveBeenCalledWith(GROUP, undefined)
  })

  it('leave calls groupLeave and returns void', async () => {
    const r = await group.leave(GROUP)
    expect(mock.groupLeave).toHaveBeenCalledWith(GROUP)
    expect(r).toBeUndefined()
  })

  it('metadata calls groupMetadata and returns fresh metadata', async () => {
    const meta = await group.metadata(GROUP)
    expect(mock.groupMetadata).toHaveBeenCalledWith(GROUP)
    expect(meta).toMatchObject({ id: '123@g.us' })
  })

  it('metadata fetches fresh on every call', async () => {
    await group.metadata(GROUP)
    await group.metadata(GROUP)
    expect(mock.groupMetadata).toHaveBeenCalledTimes(2)
  })
})

describe('GroupModule — NOT_CONNECTED guards (core methods)', () => {
  let group: GroupModule

  beforeEach(() => {
    group = disconnected()
  })

  it('create throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.create('s', []))
  })

  it('addMember throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.addMember(GROUP, [MEMBER_A]))
  })

  it('removeMember throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.removeMember(GROUP, [MEMBER_A]))
  })

  it('promote throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.promote(GROUP, [MEMBER_A]))
  })

  it('demote throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.demote(GROUP, [MEMBER_A]))
  })

  it('updateSubject throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.updateSubject(GROUP, 's'))
  })

  it('updateDescription throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.updateDescription(GROUP, 'd'))
  })

  it('leave throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.leave(GROUP))
  })

  it('metadata throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.metadata(GROUP))
  })
})

describe('GroupModule — tagMember / invite / ephemeral / setting', () => {
  let mock: MockSocket
  let group: GroupModule

  beforeEach(() => {
    mock = createMockSocket()
    group = connected(mock)
  })

  it('tagMember calls updateMemberLabel with the group jid as relay target and the label', async () => {
    await group.tagMember(GROUP, MEMBER_A, 'VIP')
    expect(mock.updateMemberLabel).toHaveBeenCalledWith(GROUP, 'VIP')
  })

  it('tagMember returns void', async () => {
    const r = await group.tagMember(GROUP, MEMBER_A, 'VIP')
    expect(r).toBeUndefined()
  })

  it('tagMember round-trips with the Phase 4 member-tag decoder', async () => {
    const label = 'VIP'
    const timestamp = Date.now()
    await group.tagMember(GROUP, MEMBER_A, label)
    expect(mock.updateMemberLabel).toHaveBeenCalledWith(GROUP, label)

    const decoded = decodeMemberTag({
      groupId: GROUP,
      participant: MEMBER_A,
      label,
      messageTimestamp: timestamp,
    })
    expect(decoded).not.toBeNull()
    expect(decoded).toMatchObject({
      groupId: GROUP,
      participant: MEMBER_A,
      label,
      timestamp,
    })
  })

  it('inviteCode calls groupInviteCode and returns the code', async () => {
    const code = await group.inviteCode(GROUP)
    expect(mock.groupInviteCode).toHaveBeenCalledWith(GROUP)
    expect(code).toBe('MOCKINVITECODE')
  })

  it('inviteCode throws OPERATION_FAILED when socket returns undefined', async () => {
    mock.groupInviteCode.mockResolvedValueOnce(undefined)
    await expect(group.inviteCode(GROUP)).rejects.toMatchObject({
      name: 'ZaileysDomainError',
      code: 'OPERATION_FAILED',
    })
  })

  it('revokeInvite calls groupRevokeInvite and returns the new code', async () => {
    const code = await group.revokeInvite(GROUP)
    expect(mock.groupRevokeInvite).toHaveBeenCalledWith(GROUP)
    expect(code).toBe('MOCKINVITECODE')
  })

  it('revokeInvite throws OPERATION_FAILED when socket returns undefined', async () => {
    mock.groupRevokeInvite.mockResolvedValueOnce(undefined)
    await expect(group.revokeInvite(GROUP)).rejects.toMatchObject({
      code: 'OPERATION_FAILED',
    })
  })

  it('acceptInvite calls groupAcceptInvite and returns the joined group jid', async () => {
    const joined = await group.acceptInvite('CODE123')
    expect(mock.groupAcceptInvite).toHaveBeenCalledWith('CODE123')
    expect(joined).toBe('123@g.us')
  })

  it('acceptInvite throws OPERATION_FAILED when socket returns undefined', async () => {
    mock.groupAcceptInvite.mockResolvedValueOnce(undefined)
    await expect(group.acceptInvite('CODE123')).rejects.toMatchObject({
      code: 'OPERATION_FAILED',
    })
  })

  it('toggleEphemeral calls groupToggleEphemeral with seconds', async () => {
    await group.toggleEphemeral(GROUP, 86400)
    expect(mock.groupToggleEphemeral).toHaveBeenCalledWith(GROUP, 86400)
  })

  it('toggleEphemeral with 0 disables disappearing messages', async () => {
    await group.toggleEphemeral(GROUP, 0)
    expect(mock.groupToggleEphemeral).toHaveBeenCalledWith(GROUP, 0)
  })

  it('setting calls groupSettingUpdate with "announcement"', async () => {
    await group.setting(GROUP, 'announcement')
    expect(mock.groupSettingUpdate).toHaveBeenCalledWith(GROUP, 'announcement')
  })

  it('setting calls groupSettingUpdate with "locked"', async () => {
    await group.setting(GROUP, 'locked')
    expect(mock.groupSettingUpdate).toHaveBeenCalledWith(GROUP, 'locked')
  })
})

describe('GroupModule — NOT_CONNECTED guards (tag / invite / ephemeral / setting)', () => {
  let group: GroupModule

  beforeEach(() => {
    group = disconnected()
  })

  it('tagMember throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.tagMember(GROUP, MEMBER_A, 'VIP'))
  })

  it('inviteCode throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.inviteCode(GROUP))
  })

  it('revokeInvite throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.revokeInvite(GROUP))
  })

  it('acceptInvite throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.acceptInvite('CODE'))
  })

  it('toggleEphemeral throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.toggleEphemeral(GROUP, 0))
  })

  it('setting throws NOT_CONNECTED', async () => {
    await expectNotConnected(() => group.setting(GROUP, 'announcement'))
  })

  it('the thrown guard error is a ZaileysDomainError instance', async () => {
    await expect(group.create('s', [])).rejects.toBeInstanceOf(ZaileysDomainError)
  })
})
