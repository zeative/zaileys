import { describe, expect, it, vi } from 'vitest'
import { GroupModule } from '../../src/domain/group.js'
import { ContactModule } from '../../src/domain/contact.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

const sock = (over: Record<string, unknown>) => over as unknown as DomainSocketLike

describe('GroupModule gaps', () => {
  it('list flattens groupFetchAllParticipating', async () => {
    const g = new GroupModule(() => sock({ groupFetchAllParticipating: vi.fn(async () => ({ 'a@g.us': { id: 'a@g.us' }, 'b@g.us': { id: 'b@g.us' } })) }))
    const list = await g.list()
    expect(list.map((x) => (x as { id: string }).id)).toEqual(['a@g.us', 'b@g.us'])
  })

  it('inviteInfo + joinRequests forward', async () => {
    const groupGetInviteInfo = vi.fn(async () => ({ id: 'a@g.us' }))
    const groupRequestParticipantsList = vi.fn(async () => [{ jid: 'x@s.whatsapp.net' }])
    const g = new GroupModule(() => sock({ groupGetInviteInfo, groupRequestParticipantsList }))
    expect(await g.inviteInfo('CODE')).toMatchObject({ id: 'a@g.us' })
    expect(await g.joinRequests('a@g.us')).toEqual([{ jid: 'x@s.whatsapp.net' }])
  })

  it('approveJoin/rejectJoin map participant results', async () => {
    const groupRequestParticipantsUpdate = vi.fn(async (_j: string, _p: string[], action: string) => [{ status: action === 'approve' ? '200' : '400', jid: 'x@s.whatsapp.net' }])
    const g = new GroupModule(() => sock({ groupRequestParticipantsUpdate }))
    expect(await g.approveJoin('a@g.us', ['x@s.whatsapp.net'])).toEqual([{ jid: 'x@s.whatsapp.net', status: '200' }])
    expect(groupRequestParticipantsUpdate).toHaveBeenCalledWith('a@g.us', ['x@s.whatsapp.net'], 'approve')
    await g.rejectJoin('a@g.us', ['x@s.whatsapp.net'])
    expect(groupRequestParticipantsUpdate).toHaveBeenCalledWith('a@g.us', ['x@s.whatsapp.net'], 'reject')
  })

  it('joinApproval/memberAddMode map booleans to baileys enums', async () => {
    const groupJoinApprovalMode = vi.fn(async () => undefined)
    const groupMemberAddMode = vi.fn(async () => undefined)
    const g = new GroupModule(() => sock({ groupJoinApprovalMode, groupMemberAddMode }))
    await g.joinApproval('a@g.us', true)
    expect(groupJoinApprovalMode).toHaveBeenCalledWith('a@g.us', 'on')
    await g.memberAddMode('a@g.us', true)
    expect(groupMemberAddMode).toHaveBeenCalledWith('a@g.us', 'admin_add')
  })
})

describe('ContactModule', () => {
  const norm = (i: string) => (i.includes('@') ? i : `${i.replace(/\D/g, '')}@s.whatsapp.net`)

  it('check maps onWhatsApp results', async () => {
    const onWhatsApp = vi.fn(async () => [{ jid: '628@s.whatsapp.net', exists: true, lid: '1@lid' }])
    const c = new ContactModule(() => sock({ onWhatsApp }), norm)
    expect(await c.check('628')).toEqual([{ jid: '628@s.whatsapp.net', exists: true, lid: '1@lid' }])
    expect(await c.exists('628')).toBe(true)
  })

  it('save/remove normalize the jid', async () => {
    const addOrEditContact = vi.fn(async () => undefined)
    const removeContact = vi.fn(async () => undefined)
    const c = new ContactModule(() => sock({ addOrEditContact, removeContact }), norm)
    await c.save('628111', { firstName: 'Zai' })
    expect(addOrEditContact).toHaveBeenCalledWith('628111@s.whatsapp.net', { firstName: 'Zai' })
    await c.remove('628111')
    expect(removeContact).toHaveBeenCalledWith('628111@s.whatsapp.net')
  })

  it('throws NOT_CONNECTED without socket', async () => {
    const c = new ContactModule(() => undefined, norm)
    await expect(c.exists('1')).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})
