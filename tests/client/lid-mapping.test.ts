import { describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const PN = '628111@s.whatsapp.net'
const LID = '111222333@lid'

const withStore = (lidMapping: unknown): Client => {
  const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
  ;(c as unknown as { _socket: unknown })._socket = { signalRepository: { lidMapping } }
  return c
}

describe('Client LID mapping', () => {
  describe('single lookup', () => {
    it('resolves a lid to its phone number', async () => {
      const c = withStore({ getPNForLID: vi.fn(async () => PN) })
      await expect(c.lidToPn(LID)).resolves.toBe(PN)
    })

    it('resolves a phone number to its lid', async () => {
      const c = withStore({ getLIDForPN: vi.fn(async () => LID) })
      await expect(c.pnToLid(PN)).resolves.toBe(LID)
    })

    it('returns null instead of throwing when the lookup fails', async () => {
      const c = withStore({
        getPNForLID: vi.fn(async () => {
          throw new Error('offline')
        }),
      })
      await expect(c.lidToPn(LID)).resolves.toBeNull()
    })

    it('returns null when the socket has no mapping store', async () => {
      const c = withStore(undefined)
      await expect(c.lidToPn(LID)).resolves.toBeNull()
      await expect(c.pnToLid(PN)).resolves.toBeNull()
    })
  })

  describe('bulk lookup', () => {
    const PAIRS = [
      { pn: PN, lid: LID },
      { pn: '628222@s.whatsapp.net', lid: '444555@lid' },
    ]

    it('maps many lids to phone numbers in one round trip', async () => {
      const getPNsForLIDs = vi.fn(async () => PAIRS)
      const c = withStore({ getPNsForLIDs })
      const map = await c.lidToPns([LID, '444555@lid'])
      expect(getPNsForLIDs).toHaveBeenCalledTimes(1)
      expect(map.get(LID)).toBe(PN)
      expect(map.get('444555@lid')).toBe('628222@s.whatsapp.net')
    })

    it('maps many phone numbers to lids in one round trip', async () => {
      const c = withStore({ getLIDsForPNs: vi.fn(async () => PAIRS) })
      const map = await c.pnToLids([PN])
      expect(map.get(PN)).toBe(LID)
    })

    it('omits jids WhatsApp could not resolve rather than inventing entries', async () => {
      const c = withStore({ getPNsForLIDs: vi.fn(async () => [PAIRS[0]]) })
      const map = await c.lidToPns([LID, 'unknown@lid'])
      expect(map.has('unknown@lid')).toBe(false)
      expect(map.size).toBe(1)
    })

    it('skips the round trip entirely for an empty input', async () => {
      const getPNsForLIDs = vi.fn(async () => PAIRS)
      const c = withStore({ getPNsForLIDs })
      expect((await c.lidToPns([])).size).toBe(0)
      expect(getPNsForLIDs).not.toHaveBeenCalled()
    })

    it('returns an empty map when the lookup throws', async () => {
      const c = withStore({
        getPNsForLIDs: vi.fn(async () => {
          throw new Error('offline')
        }),
      })
      expect((await c.lidToPns([LID])).size).toBe(0)
    })

    it('returns an empty map when WhatsApp answers null', async () => {
      const c = withStore({ getPNsForLIDs: vi.fn(async () => null) })
      expect((await c.lidToPns([LID])).size).toBe(0)
    })

    it('returns an empty map when the socket has no mapping store', async () => {
      const c = withStore(undefined)
      expect((await c.lidToPns([LID])).size).toBe(0)
      expect((await c.pnToLids([PN])).size).toBe(0)
    })
  })
})
