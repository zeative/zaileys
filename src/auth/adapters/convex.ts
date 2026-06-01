import { BufferJSON } from 'baileys'
import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import { ConvexKv, type ConvexKvOptions, type ConvexKvRow } from '../../types/convex.js'
import type { AuthCredsStore, AuthStore, AuthStoreBundle, AuthStoreKey, AuthStoreValue } from '../types.js'

/** Constructor input for {@link ConvexAuthStore}. */
export type ConvexAuthStoreOptions = ConvexKvOptions

const CREDS_KEY = 'creds'
const SIGNAL_PREFIX = 'signal:'
const signalKey = (type: string, id: string): string => `${SIGNAL_PREFIX}${type}:${id}`

/**
 * Convex-backed `AuthStoreBundle`. Persists the credentials blob and signal keys
 * as `BufferJSON`-serialized rows in the user-deployed `zaileys_kv` table, reached
 * through a {@link ConvexKv} client (`url` XOR `client`).
 *
 * Requires the `zaileys_kv` schema + functions to be deployed in the Convex project
 * (see the template under `docs/convex/`). `convex` is an optional peer dependency.
 */
export class ConvexAuthStore implements AuthStoreBundle {
  readonly creds: AuthCredsStore
  readonly signal: AuthStore
  private readonly kv: ConvexKv

  constructor(options: ConvexAuthStoreOptions) {
    this.kv = new ConvexKv(options)
    const kv = this.kv

    this.creds = {
      async readCreds(): Promise<AuthenticationCreds | undefined> {
        const found = await kv.get([CREDS_KEY])
        const raw = found.get(CREDS_KEY)
        return raw === undefined ? undefined : (JSON.parse(raw, BufferJSON.reviver) as AuthenticationCreds)
      },
      async writeCreds(creds: AuthenticationCreds): Promise<void> {
        await kv.set([{ key: CREDS_KEY, value: JSON.stringify(creds, BufferJSON.replacer) }])
      },
      async deleteCreds(): Promise<void> {
        await kv.del([CREDS_KEY])
      },
    }

    this.signal = {
      async read<K extends AuthStoreKey>(
        type: K,
        ids: readonly string[],
      ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> {
        const keys = ids.map((id) => signalKey(type, id))
        const found = await kv.get(keys)
        const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
        for (const id of ids) {
          const raw = found.get(signalKey(type, id))
          out[id] = raw === undefined ? undefined : (JSON.parse(raw, BufferJSON.reviver) as AuthStoreValue<K>)
        }
        return out
      },
      async write(data: SignalDataSet): Promise<void> {
        const sets: ConvexKvRow[] = []
        const dels: string[] = []
        for (const type of Object.keys(data) as AuthStoreKey[]) {
          const category = data[type]
          if (!category) continue
          for (const id of Object.keys(category)) {
            const value = category[id]
            if (value == null) dels.push(signalKey(type, id))
            else sets.push({ key: signalKey(type, id), value: JSON.stringify(value, BufferJSON.replacer) })
          }
        }
        if (sets.length > 0) await kv.set(sets)
        if (dels.length > 0) await kv.del(dels)
      },
      async delete<K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> {
        await kv.del(ids.map((id) => signalKey(type, id)))
      },
      async clear(): Promise<void> {
        await kv.clear()
      },
      async close(): Promise<void> {
        kv.close()
      },
    }
  }
}
