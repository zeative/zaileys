import { beforeEach, describe, expect, it } from 'vitest'
import { PrivacyModule } from '../../src/domain/privacy.js'
import { ZaileysDomainError } from '../../src/domain/errors.js'
import type { DomainSocketLike } from '../../src/domain/socket-like.js'
import { createMockSocket, type MockSocket } from '../_helpers/mock-socket.js'

describe('PrivacyModule', () => {
  let socket: MockSocket
  let privacy: PrivacyModule

  beforeEach(() => {
    socket = createMockSocket()
    privacy = new PrivacyModule(() => socket as unknown as DomainSocketLike)
  })

  describe('set — partial fan-out', () => {
    it('applies only the provided keys to their respective methods', async () => {
      await privacy.set({ lastSeen: 'contacts', online: 'all', readReceipts: false })

      expect(socket.updateLastSeenPrivacy).toHaveBeenCalledWith('contacts')
      expect(socket.updateOnlinePrivacy).toHaveBeenCalledWith('all')
      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('none')
    })

    it('does not call methods for undefined keys', async () => {
      await privacy.set({ lastSeen: 'contacts', online: 'all', readReceipts: false })

      expect(socket.updateProfilePicturePrivacy).not.toHaveBeenCalled()
      expect(socket.updateStatusPrivacy).not.toHaveBeenCalled()
      expect(socket.updateGroupsAddPrivacy).not.toHaveBeenCalled()
    })

    it('coerces readReceipts boolean true to "all"', async () => {
      await privacy.set({ readReceipts: true })

      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('all')
    })

    it('coerces readReceipts boolean false to "none"', async () => {
      await privacy.set({ readReceipts: false })

      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('none')
    })

    it('passes readReceipts enum form "none" through unchanged', async () => {
      await privacy.set({ readReceipts: 'none' })

      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('none')
    })

    it('passes readReceipts enum form "all" through unchanged', async () => {
      await privacy.set({ readReceipts: 'all' })

      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('all')
    })

    it('calls no method for an empty config', async () => {
      await privacy.set({})

      expect(socket.updateLastSeenPrivacy).not.toHaveBeenCalled()
      expect(socket.updateOnlinePrivacy).not.toHaveBeenCalled()
      expect(socket.updateProfilePicturePrivacy).not.toHaveBeenCalled()
      expect(socket.updateStatusPrivacy).not.toHaveBeenCalled()
      expect(socket.updateReadReceiptsPrivacy).not.toHaveBeenCalled()
      expect(socket.updateGroupsAddPrivacy).not.toHaveBeenCalled()
    })

    it('applies exactly three methods for a three-key config', async () => {
      await privacy.set({ profile: 'none', status: 'contacts', groupAdd: 'contacts' })

      expect(socket.updateProfilePicturePrivacy).toHaveBeenCalledWith('none')
      expect(socket.updateStatusPrivacy).toHaveBeenCalledWith('contacts')
      expect(socket.updateGroupsAddPrivacy).toHaveBeenCalledWith('contacts')
      expect(socket.updateLastSeenPrivacy).not.toHaveBeenCalled()
      expect(socket.updateOnlinePrivacy).not.toHaveBeenCalled()
      expect(socket.updateReadReceiptsPrivacy).not.toHaveBeenCalled()
    })

    it('maps lastSeen to updateLastSeenPrivacy', async () => {
      await privacy.set({ lastSeen: 'none' })
      expect(socket.updateLastSeenPrivacy).toHaveBeenCalledWith('none')
    })

    it('maps online to updateOnlinePrivacy', async () => {
      await privacy.set({ online: 'match_last_seen' })
      expect(socket.updateOnlinePrivacy).toHaveBeenCalledWith('match_last_seen')
    })

    it('maps profile to updateProfilePicturePrivacy', async () => {
      await privacy.set({ profile: 'contacts' })
      expect(socket.updateProfilePicturePrivacy).toHaveBeenCalledWith('contacts')
    })

    it('maps status to updateStatusPrivacy', async () => {
      await privacy.set({ status: 'contact_blacklist' })
      expect(socket.updateStatusPrivacy).toHaveBeenCalledWith('contact_blacklist')
    })

    it('maps groupAdd to updateGroupsAddPrivacy', async () => {
      await privacy.set({ groupAdd: 'contact_blacklist' })
      expect(socket.updateGroupsAddPrivacy).toHaveBeenCalledWith('contact_blacklist')
    })

    it('applies all six keys when fully populated', async () => {
      await privacy.set({
        lastSeen: 'all',
        online: 'all',
        profile: 'all',
        status: 'all',
        readReceipts: true,
        groupAdd: 'all',
      })

      expect(socket.updateLastSeenPrivacy).toHaveBeenCalledTimes(1)
      expect(socket.updateOnlinePrivacy).toHaveBeenCalledTimes(1)
      expect(socket.updateProfilePicturePrivacy).toHaveBeenCalledTimes(1)
      expect(socket.updateStatusPrivacy).toHaveBeenCalledTimes(1)
      expect(socket.updateReadReceiptsPrivacy).toHaveBeenCalledWith('all')
      expect(socket.updateGroupsAddPrivacy).toHaveBeenCalledTimes(1)
    })

    it('throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.set({ lastSeen: 'all' })).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      })
      await expect(detached.set({ lastSeen: 'all' })).rejects.toBeInstanceOf(ZaileysDomainError)
    })
  })

  describe('disappearingMode', () => {
    it('forwards the duration to updateDefaultDisappearingMode', async () => {
      await privacy.disappearingMode(86400)
      expect(socket.updateDefaultDisappearingMode).toHaveBeenCalledWith(86400)
    })

    it('supports a zero duration (disable)', async () => {
      await privacy.disappearingMode(0)
      expect(socket.updateDefaultDisappearingMode).toHaveBeenCalledWith(0)
    })

    it('throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.disappearingMode(86400)).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      })
    })
  })

  describe('get', () => {
    it('returns the privacy settings from fetchPrivacySettings', async () => {
      const result = await privacy.get()
      expect(socket.fetchPrivacySettings).toHaveBeenCalledTimes(1)
      expect(result).toMatchObject({ last: 'contacts', online: 'all', groupadd: 'contacts' })
    })

    it('throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.get()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    })
  })

  describe('block / unblock', () => {
    it('calls updateBlockStatus with the block action', async () => {
      await privacy.block('x@s.whatsapp.net')
      expect(socket.updateBlockStatus).toHaveBeenCalledWith('x@s.whatsapp.net', 'block')
    })

    it('calls updateBlockStatus with the unblock action', async () => {
      await privacy.unblock('x@s.whatsapp.net')
      expect(socket.updateBlockStatus).toHaveBeenCalledWith('x@s.whatsapp.net', 'unblock')
    })

    it('block throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.block('x@s.whatsapp.net')).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      })
    })

    it('unblock throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.unblock('x@s.whatsapp.net')).rejects.toMatchObject({
        code: 'NOT_CONNECTED',
      })
    })
  })

  describe('blocklist', () => {
    it('returns the blocklist array from fetchBlocklist', async () => {
      const result = await privacy.blocklist()
      expect(socket.fetchBlocklist).toHaveBeenCalledTimes(1)
      expect(result).toEqual(['blocked@s.whatsapp.net'])
    })

    it('throws NOT_CONNECTED when socket is absent', async () => {
      const detached = new PrivacyModule(() => undefined)
      await expect(detached.blocklist()).rejects.toMatchObject({ code: 'NOT_CONNECTED' })
    })
  })
})
