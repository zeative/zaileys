import { describe, expect, it } from 'vitest'
import {
  decodeGroupJoin,
  decodeGroupLeave,
  decodeGroupUpdate,
  decodeMemberTag,
} from '../../../src/events/decoders/groups.js'

const GROUP = '12345-678@g.us'
const ADMIN = '628999@s.whatsapp.net'

describe('decodeGroupUpdate', () => {
  it('decodes a subject change', () => {
    const out = decodeGroupUpdate({ id: GROUP, subject: 'New Name' })
    expect(out).not.toBeNull()
    expect(out?.groupId).toBe(GROUP)
    expect(out?.update.subject).toBe('New Name')
    expect(typeof out?.timestamp).toBe('number')
  })

  it('decodes a description change mapping desc -> description', () => {
    const out = decodeGroupUpdate({ id: GROUP, desc: 'A new description' })
    expect(out?.update.description).toBe('A new description')
    expect(out?.update.subject).toBeUndefined()
  })

  it('decodes an announce toggle', () => {
    expect(decodeGroupUpdate({ id: GROUP, announce: true })?.update.announce).toBe(true)
    expect(decodeGroupUpdate({ id: GROUP, announce: false })?.update.announce).toBe(false)
  })

  it('decodes a restrict toggle', () => {
    expect(decodeGroupUpdate({ id: GROUP, restrict: true })?.update.restrict).toBe(true)
  })

  it('decodes an ephemeral duration set', () => {
    expect(decodeGroupUpdate({ id: GROUP, ephemeralDuration: 86400 })?.update.ephemeralDuration).toBe(86400)
  })

  it('decodes multiple fields at once', () => {
    const out = decodeGroupUpdate({ id: GROUP, subject: 'X', announce: true, restrict: false })
    expect(out?.update).toEqual({ subject: 'X', announce: true, restrict: false })
  })

  it('drops undefined fields from the update', () => {
    const out = decodeGroupUpdate({ id: GROUP, subject: 'X' })
    expect(Object.keys(out?.update ?? {})).toEqual(['subject'])
  })

  it('returns null when id is missing', () => {
    expect(decodeGroupUpdate({ subject: 'X' })).toBeNull()
    expect(decodeGroupUpdate({ id: '' })).toBeNull()
  })
})

describe('decodeMemberTag', () => {
  it('decodes a label set', () => {
    const out = decodeMemberTag({
      groupId: GROUP,
      participant: ADMIN,
      label: 'VIP',
      messageTimestamp: 1700000000,
    })
    expect(out).not.toBeNull()
    expect(out?.groupId).toBe(GROUP)
    expect(out?.participant).toBe(ADMIN)
    expect(out?.label).toBe('VIP')
    expect(out?.timestamp).toBe(1700000000)
  })

  it('decodes a label clear (empty string)', () => {
    const out = decodeMemberTag({ groupId: GROUP, participant: ADMIN, label: '' })
    expect(out?.label).toBe('')
  })

  it('propagates participantAlt', () => {
    const out = decodeMemberTag({
      groupId: GROUP,
      participant: ADMIN,
      participantAlt: '111@lid',
      label: 'Mod',
    })
    expect(out?.participantAlt).toBe('111@lid')
  })

  it('omits participantAlt when absent', () => {
    const out = decodeMemberTag({ groupId: GROUP, participant: ADMIN, label: 'Mod' })
    expect(out?.participantAlt).toBeUndefined()
  })

  it('falls back to a generated timestamp when missing', () => {
    const out = decodeMemberTag({ groupId: GROUP, participant: ADMIN, label: 'Mod' })
    expect(typeof out?.timestamp).toBe('number')
    expect(out?.timestamp).toBeGreaterThan(0)
  })

  it('returns null when groupId is missing', () => {
    expect(decodeMemberTag({ groupId: '', participant: ADMIN, label: 'X' })).toBeNull()
  })

  it('returns null when participant is missing', () => {
    expect(decodeMemberTag({ groupId: GROUP, participant: '', label: 'X' })).toBeNull()
  })
})

describe('decodeGroupJoin', () => {
  it('decodes an add by admin', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'add',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out).not.toBeNull()
    expect(out?.action).toBe('add')
    expect(out?.groupId).toBe(GROUP)
    expect(out?.by).toBe(ADMIN)
    expect(out?.participants[0]?.jid).toBe('628111@s.whatsapp.net')
  })

  it('decodes an invite via link', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'invite-link',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out?.action).toBe('invite-link')
  })

  it('decodes an invite action', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'invite',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out?.action).toBe('invite')
  })

  it('decodes a multi-participant batch', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'add',
      participants: [
        { id: '628111@s.whatsapp.net' },
        { id: '628222@s.whatsapp.net' },
        { id: '628333@s.whatsapp.net' },
      ],
    })
    expect(out?.participants).toHaveLength(3)
    expect(out?.participants.map((p) => p.jid)).toEqual([
      '628111@s.whatsapp.net',
      '628222@s.whatsapp.net',
      '628333@s.whatsapp.net',
    ])
  })

  it('propagates LID via participantAlt (lid preferred)', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'add',
      participants: [{ id: '628111@s.whatsapp.net', lid: '111@lid', phoneNumber: '628111@s.whatsapp.net' }],
    })
    expect(out?.participants[0]?.participantAlt).toBe('111@lid')
  })

  it('falls back participantAlt to phoneNumber when lid absent', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'add',
      participants: [{ id: 'abc@lid', phoneNumber: '628111@s.whatsapp.net' }],
    })
    expect(out?.participants[0]?.participantAlt).toBe('628111@s.whatsapp.net')
  })

  it('detects admin role', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      action: 'add',
      participants: [
        { id: '628111@s.whatsapp.net', admin: 'admin' },
        { id: '628222@s.whatsapp.net', admin: 'superadmin' },
        { id: '628333@s.whatsapp.net', admin: null },
      ],
    })
    expect(out?.participants[0]?.isAdmin).toBe(true)
    expect(out?.participants[1]?.isAdmin).toBe(true)
    expect(out?.participants[2]?.isAdmin).toBe(false)
  })

  it('propagates author username when present', () => {
    const out = decodeGroupJoin({
      id: GROUP,
      author: ADMIN,
      authorUsername: 'adminuser',
      action: 'add',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out?.participants[0]?.authorUsername).toBe('adminuser')
  })

  it('returns null for remove/leave actions (out of scope)', () => {
    expect(
      decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'remove', participants: [{ id: 'x' }] }),
    ).toBeNull()
    expect(
      decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'leave', participants: [{ id: 'x' }] }),
    ).toBeNull()
  })

  it('returns null for promote/demote/modify actions', () => {
    expect(decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'promote', participants: [{ id: 'x' }] })).toBeNull()
    expect(decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'demote', participants: [{ id: 'x' }] })).toBeNull()
    expect(decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'modify', participants: [{ id: 'x' }] })).toBeNull()
  })

  it('returns null when group id is missing', () => {
    expect(decodeGroupJoin({ id: '', author: ADMIN, action: 'add', participants: [{ id: 'x' }] })).toBeNull()
  })

  it('returns null when participants array is empty', () => {
    expect(decodeGroupJoin({ id: GROUP, author: ADMIN, action: 'add', participants: [] })).toBeNull()
  })
})

describe('decodeGroupLeave', () => {
  it('decodes a remove by admin', () => {
    const out = decodeGroupLeave({
      id: GROUP,
      author: ADMIN,
      action: 'remove',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out).not.toBeNull()
    expect(out?.action).toBe('remove')
    expect(out?.by).toBe(ADMIN)
    expect(out?.participants[0]?.jid).toBe('628111@s.whatsapp.net')
  })

  it('decodes a self-leave', () => {
    const out = decodeGroupLeave({
      id: GROUP,
      author: '628111@s.whatsapp.net',
      action: 'leave',
      participants: [{ id: '628111@s.whatsapp.net' }],
    })
    expect(out?.action).toBe('leave')
  })

  it('propagates LID-aware participantAlt', () => {
    const out = decodeGroupLeave({
      id: GROUP,
      author: ADMIN,
      action: 'remove',
      participants: [{ id: '628111@s.whatsapp.net', lid: '111@lid' }],
    })
    expect(out?.participants[0]?.participantAlt).toBe('111@lid')
  })

  it('returns null for add/invite actions (out of scope)', () => {
    expect(decodeGroupLeave({ id: GROUP, author: ADMIN, action: 'add', participants: [{ id: 'x' }] })).toBeNull()
    expect(decodeGroupLeave({ id: GROUP, author: ADMIN, action: 'invite', participants: [{ id: 'x' }] })).toBeNull()
  })

  it('returns null for promote/demote actions', () => {
    expect(decodeGroupLeave({ id: GROUP, author: ADMIN, action: 'promote', participants: [{ id: 'x' }] })).toBeNull()
    expect(decodeGroupLeave({ id: GROUP, author: ADMIN, action: 'demote', participants: [{ id: 'x' }] })).toBeNull()
  })

  it('returns null when group id is missing', () => {
    expect(decodeGroupLeave({ id: '', author: ADMIN, action: 'remove', participants: [{ id: 'x' }] })).toBeNull()
  })
})
