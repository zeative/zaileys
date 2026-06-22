import { describe, expect, it, vi } from 'vitest'
import { ProfileModule } from '../../src/domain/profile.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'

const makeSocket = () => ({
  updateProfileName: vi.fn(async () => undefined),
  updateProfileStatus: vi.fn(async () => undefined),
  updateProfilePicture: vi.fn(async () => undefined),
  removeProfilePicture: vi.fn(async () => undefined),
  profilePictureUrl: vi.fn(async () => 'https://pfp'),
  fetchStatus: vi.fn(async () => ({ status: 'hey' })),
})

const connected = (m: ReturnType<typeof makeSocket>) =>
  new ProfileModule(() => m as unknown as DomainSocketLike)

describe('ProfileModule', () => {
  it('setName / setStatus forward to baileys', async () => {
    const m = makeSocket()
    await connected(m).setName('Zai')
    await connected(m).setStatus('busy')
    expect(m.updateProfileName).toHaveBeenCalledWith('Zai')
    expect(m.updateProfileStatus).toHaveBeenCalledWith('busy')
  })

  it('setPicture / removePicture target a jid', async () => {
    const m = makeSocket()
    const buf = Buffer.from('x')
    await connected(m).setPicture('me@s.whatsapp.net', buf)
    await connected(m).removePicture('me@s.whatsapp.net')
    expect(m.updateProfilePicture).toHaveBeenCalledWith('me@s.whatsapp.net', buf)
    expect(m.removeProfilePicture).toHaveBeenCalledWith('me@s.whatsapp.net')
  })

  it('getPicture passes preview/image and maps undefined to null', async () => {
    const m = makeSocket()
    expect(await connected(m).getPicture('j', true)).toBe('https://pfp')
    expect(m.profilePictureUrl).toHaveBeenCalledWith('j', 'image')
    m.profilePictureUrl.mockResolvedValueOnce(undefined as never)
    expect(await connected(m).getPicture('j')).toBeNull()
  })

  it('throws NOT_CONNECTED without a socket', async () => {
    const mod = new ProfileModule(() => undefined)
    await expect(mod.setName('x')).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
  })
})
