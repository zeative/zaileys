import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SignalDataSet } from 'baileys'
import type { AuthStoreBundle } from '../../src/auth/index.js'
import { ZaileysStoreError } from '../../src/types/store-error.js'
import { assertSignalEquals, sampleCreds, sampleSignalEntries } from './fixtures.js'

type Factory = () => Promise<AuthStoreBundle> | AuthStoreBundle
type Cleanup = (bundle: AuthStoreBundle) => Promise<void> | void

const SIGNAL_KEYS: (keyof SignalDataSet)[] = [
  'pre-key',
  'session',
  'sender-key',
  'sender-key-memory',
  'app-state-sync-key',
  'app-state-sync-version',
  'lid-mapping',
  'device-list',
  'tctoken',
  'identity-key',
]

const expectStoreClosed = async (promise: Promise<unknown>): Promise<void> => {
  await expect(promise).rejects.toBeInstanceOf(ZaileysStoreError)
  await expect(promise).rejects.toMatchObject({ code: 'STORE_CLOSED' })
}

/**
 * Parameterised contract suite for any `AuthStoreBundle` implementation.
 * Adapters spawn this factory in their own `*.test.ts` files to inherit ≥30 scenarios.
 */
export const runAuthStoreContract = (
  name: string,
  factory: Factory,
  cleanup?: Cleanup,
): void => {
  describe(`AuthStore contract: ${name}`, () => {
    let bundle: AuthStoreBundle

    beforeEach(async () => {
      bundle = await factory()
    })

    afterEach(async () => {
      try {
        if (cleanup) await cleanup(bundle)
      } finally {
        await bundle.signal.close().catch(() => undefined)
      }
    })

    describe('Group A — Creds round-trip', () => {
      it('A1: readCreds() on fresh store returns undefined', async () => {
        await expect(bundle.creds.readCreds()).resolves.toBeUndefined()
      })

      it('A2: writeCreds + readCreds preserves Buffer fields byte-for-byte', async () => {
        const creds = sampleCreds()
        await bundle.creds.writeCreds(creds)
        const read = await bundle.creds.readCreds()
        expect(read).toBeDefined()
        assertSignalEquals(creds.noiseKey.public, read!.noiseKey.public, '$.noiseKey.public')
        assertSignalEquals(creds.noiseKey.private, read!.noiseKey.private, '$.noiseKey.private')
        assertSignalEquals(creds.signedIdentityKey.public, read!.signedIdentityKey.public, '$.signedIdentityKey.public')
        expect(read!.registrationId).toBe(creds.registrationId)
        expect(read!.advSecretKey).toBe(creds.advSecretKey)
      })

      it('A3: sequential writes overwrite (last-write-wins)', async () => {
        const a = sampleCreds()
        const b = sampleCreds()
        await bundle.creds.writeCreds(a)
        await bundle.creds.writeCreds(b)
        const read = await bundle.creds.readCreds()
        assertSignalEquals(b.advSecretKey, read!.advSecretKey, '$.advSecretKey')
        expect(read!.registrationId).toBe(b.registrationId)
      })

      it('A4: deleteCreds clears persisted creds', async () => {
        await bundle.creds.writeCreds(sampleCreds())
        await bundle.creds.deleteCreds()
        await expect(bundle.creds.readCreds()).resolves.toBeUndefined()
      })

      it('A5: deleteCreds on empty store is a no-op', async () => {
        await expect(bundle.creds.deleteCreds()).resolves.toBeUndefined()
        await expect(bundle.creds.readCreds()).resolves.toBeUndefined()
      })
    })

    describe('Group B — Signal round-trip per SignalDataTypeMap key', () => {
      const roundTrip = async (key: keyof SignalDataSet): Promise<void> => {
        const data = sampleSignalEntries('1')
        const slice = { [key]: data[key] } as SignalDataSet
        await bundle.signal.write(slice)
        const read = await bundle.signal.read(key, ['1'])
        assertSignalEquals(
          (data[key] as Record<string, unknown>)['1'],
          read['1'],
          `$.${String(key)}.1`,
        )
      }

      it('B1: pre-key KeyPair round-trips byte-equal', async () => {
        await roundTrip('pre-key')
      })

      it('B2: session Uint8Array round-trips byte-equal', async () => {
        await roundTrip('session')
      })

      it('B3: sender-key Uint8Array round-trips byte-equal', async () => {
        await roundTrip('sender-key')
      })

      it('B4: sender-key-memory boolean map round-trips', async () => {
        await roundTrip('sender-key-memory')
      })

      it('B5: app-state-sync-key proto blob round-trips', async () => {
        await roundTrip('app-state-sync-key')
      })

      it('B6: app-state-sync-version LTHashState round-trips', async () => {
        await roundTrip('app-state-sync-version')
      })

      it('B7: lid-mapping string round-trips', async () => {
        await roundTrip('lid-mapping')
      })

      it('B8: device-list string[] round-trips', async () => {
        await roundTrip('device-list')
      })

      it('B9: tctoken Buffer round-trips byte-equal', async () => {
        await roundTrip('tctoken')
      })

      it('B10: identity-key Uint8Array round-trips byte-equal', async () => {
        await roundTrip('identity-key')
      })
    })

    describe('Group C — write semantics', () => {
      it('C1: writing null for an id deletes it', async () => {
        await bundle.signal.write({ session: { '1': Uint8Array.from([9]) } })
        await bundle.signal.write({ session: { '1': null } } as SignalDataSet)
        const read = await bundle.signal.read('session', ['1'])
        expect(read['1']).toBeUndefined()
      })

      it('C2: multi-category write persists every category in one call', async () => {
        const data = sampleSignalEntries('1')
        await bundle.signal.write({
          'pre-key': data['pre-key'],
          session: data.session,
        })
        const preKey = await bundle.signal.read('pre-key', ['1'])
        const session = await bundle.signal.read('session', ['1'])
        assertSignalEquals((data['pre-key'] as Record<string, unknown>)['1'], preKey['1'], '$.pre-key.1')
        assertSignalEquals((data.session as Record<string, unknown>)['1'], session['1'], '$.session.1')
      })

      it('C3: reading only unknown ids returns empty object', async () => {
        const read = await bundle.signal.read('pre-key', ['unknown'])
        expect(read).toEqual({})
      })

      it('C4: reading mix of known + unknown returns only the known entry', async () => {
        const data = sampleSignalEntries('known')
        await bundle.signal.write({ 'pre-key': data['pre-key'] })
        const read = await bundle.signal.read('pre-key', ['known', 'unknown'])
        expect(Object.keys(read).filter((k) => read[k] !== undefined)).toEqual(['known'])
      })

      it('C5: writing same id twice updates (last-write-wins)', async () => {
        await bundle.signal.write({ session: { '1': Uint8Array.from([1]) } })
        await bundle.signal.write({ session: { '1': Uint8Array.from([2]) } })
        const read = await bundle.signal.read('session', ['1'])
        assertSignalEquals(Uint8Array.from([2]), read['1'], '$.session.1')
      })
    })

    describe('Group D — delete + clear (AUTH-07)', () => {
      it('D1: delete removes specified ids', async () => {
        const data = sampleSignalEntries('1')
        await bundle.signal.write({ 'pre-key': data['pre-key'] })
        await bundle.signal.delete('pre-key', ['1'])
        const read = await bundle.signal.read('pre-key', ['1'])
        expect(read['1']).toBeUndefined()
      })

      it('D2: delete on unknown ids is a no-op', async () => {
        await expect(bundle.signal.delete('pre-key', ['unknown'])).resolves.toBeUndefined()
      })

      it('D3: clear wipes every signal category', async () => {
        const data = sampleSignalEntries('1')
        await bundle.signal.write(data)
        await bundle.signal.clear()
        for (const key of SIGNAL_KEYS) {
          const read = await bundle.signal.read(key, ['1'])
          expect(read['1']).toBeUndefined()
        }
      })

      it('D4: clear also resets persisted creds (AUTH-07)', async () => {
        await bundle.creds.writeCreds(sampleCreds())
        await bundle.signal.clear()
        await expect(bundle.creds.readCreds()).resolves.toBeUndefined()
      })

      it('D5: store remains functional after clear', async () => {
        await bundle.signal.write({ session: { '1': Uint8Array.from([1]) } })
        await bundle.signal.clear()
        await bundle.signal.write({ session: { '2': Uint8Array.from([2]) } })
        const read = await bundle.signal.read('session', ['2'])
        assertSignalEquals(Uint8Array.from([2]), read['2'], '$.session.2')
      })
    })

    describe('Group E — concurrency stress', () => {
      it('E1: 1000 parallel session writes all persist intact', async () => {
        const ids = Array.from({ length: 1000 }, (_, i) => String(i))
        await Promise.all(
          ids.map((id, i) =>
            bundle.signal.write({ session: { [id]: Uint8Array.from([i & 0xff, (i >> 8) & 0xff]) } }),
          ),
        )
        const read = await bundle.signal.read('session', ids)
        for (let i = 0; i < ids.length; i += 1) {
          assertSignalEquals(
            Uint8Array.from([i & 0xff, (i >> 8) & 0xff]),
            read[ids[i]!],
            `$.session.${ids[i]}`,
          )
        }
      }, 30_000)

      it('E2: 100 parallel writeCreds resolve without corruption', async () => {
        const samples = Array.from({ length: 100 }, () => sampleCreds())
        await Promise.all(samples.map((s) => bundle.creds.writeCreds(s)))
        const read = await bundle.creds.readCreds()
        expect(read).toBeDefined()
        expect(typeof read!.registrationId).toBe('number')
        expect(typeof read!.advSecretKey).toBe('string')
      }, 30_000)

      it('E3: 500 interleaved reads + 500 writes complete without throw', async () => {
        const writes = Array.from({ length: 500 }, (_, i) =>
          bundle.signal.write({ session: { [`w-${i}`]: Uint8Array.from([i & 0xff]) } }),
        )
        const reads = Array.from({ length: 500 }, (_, i) =>
          bundle.signal.read('session', [`w-${i}`]),
        )
        const results = await Promise.all([...writes, ...reads])
        expect(results.length).toBe(1000)
      }, 30_000)
    })

    describe('Group F — close semantics', () => {
      it('F1: post-close read/write rejects with STORE_CLOSED', async () => {
        await bundle.signal.close()
        await expectStoreClosed(bundle.signal.read('session', ['1']))
        await expectStoreClosed(bundle.signal.write({ session: { '1': Uint8Array.from([1]) } }))
        await expectStoreClosed(bundle.creds.readCreds())
        await expectStoreClosed(bundle.creds.writeCreds(sampleCreds()))
      })

      it('F2: close is idempotent', async () => {
        await bundle.signal.close()
        await expect(bundle.signal.close()).resolves.toBeUndefined()
      })
    })
  })
}
