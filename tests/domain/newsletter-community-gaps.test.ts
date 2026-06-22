import { describe, expect, it, vi } from 'vitest'
import { NewsletterModule } from '../../src/domain/newsletter.js'
import { CommunityModule } from '../../src/domain/community.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

const sock = (over: Record<string, unknown>) => over as unknown as DomainSocketLike

describe('NewsletterModule gaps', () => {
  it('react/unreact forward to newsletterReactMessage', async () => {
    const newsletterReactMessage = vi.fn(async () => undefined)
    const n = new NewsletterModule(() => sock({ newsletterReactMessage }))
    await n.react('nl@newsletter', '5', '🔥')
    expect(newsletterReactMessage).toHaveBeenCalledWith('nl@newsletter', '5', '🔥')
    await n.unreact('nl@newsletter', '5')
    expect(newsletterReactMessage).toHaveBeenCalledWith('nl@newsletter', '5', undefined)
  })

  it('subscribers/adminCount/changeOwner/demote/removePicture forward', async () => {
    const m = {
      newsletterSubscribers: vi.fn(async () => [{ jid: 'a' }]),
      newsletterAdminCount: vi.fn(async () => 3),
      newsletterChangeOwner: vi.fn(async () => undefined),
      newsletterDemote: vi.fn(async () => undefined),
      newsletterRemovePicture: vi.fn(async () => undefined),
      newsletterFetchMessages: vi.fn(async () => [{ id: 1 }]),
    }
    const n = new NewsletterModule(() => sock(m))
    expect(await n.subscribers('nl@newsletter')).toEqual([{ jid: 'a' }])
    expect(await n.adminCount('nl@newsletter')).toBe(3)
    await n.changeOwner('nl@newsletter', 'x@s.whatsapp.net')
    expect(m.newsletterChangeOwner).toHaveBeenCalledWith('nl@newsletter', 'x@s.whatsapp.net')
    await n.demote('nl@newsletter', 'x@s.whatsapp.net')
    await n.removePicture('nl@newsletter')
    await n.messages('nl@newsletter', 10, { since: 100 })
    expect(m.newsletterFetchMessages).toHaveBeenCalledWith('nl@newsletter', 10, 100, undefined)
  })
})

describe('CommunityModule gaps', () => {
  it('metadata/list/inviteInfo and settings forward', async () => {
    const m = {
      communityMetadata: vi.fn(async () => ({ id: 'c@g.us' })),
      communityFetchAllParticipating: vi.fn(async () => ({ 'c@g.us': { id: 'c@g.us' } })),
      communityGetInviteInfo: vi.fn(async () => ({ id: 'c@g.us' })),
      communityToggleEphemeral: vi.fn(async () => undefined),
      communitySettingUpdate: vi.fn(async () => undefined),
      communityMemberAddMode: vi.fn(async () => undefined),
      communityJoinApprovalMode: vi.fn(async () => undefined),
    }
    const c = new CommunityModule(() => sock(m))
    expect(await c.metadata('c@g.us')).toMatchObject({ id: 'c@g.us' })
    expect((await c.list()).length).toBe(1)
    await c.toggleEphemeral('c@g.us', 86400)
    await c.setting('c@g.us', 'announcement')
    await c.memberAddMode('c@g.us', true)
    expect(m.communityMemberAddMode).toHaveBeenCalledWith('c@g.us', 'admin_add')
    await c.joinApproval('c@g.us', false)
    expect(m.communityJoinApprovalMode).toHaveBeenCalledWith('c@g.us', 'off')
  })
})
