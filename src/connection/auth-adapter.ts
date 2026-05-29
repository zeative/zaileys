import type { SignalDataSet, SignalDataTypeMap, SignalKeyStore } from 'baileys'
import type { AuthStore, AuthStoreKey } from '../auth/types.js'
import type { Logger } from '../client/types.js'

/**
 * Convert a zaileys {@link AuthStore} (domain shape: `read`/`write`/`delete`/`clear`/`close`)
 * into baileys' expected {@link SignalKeyStore} shape (`get`/`set`/optional `clear`).
 *
 * Two shapes exist deliberately: zaileys uses domain verbs for CRUD symmetry across all
 * adapters (file, redis, postgres, sqlite) while baileys' Signal protocol code expects
 * the legacy `get`/`set` naming. This adapter bridges them at the Client boundary so
 * downstream auth adapters never need to know about baileys' wire shape.
 *
 * The `logger` parameter is reserved for future trace instrumentation; today it is held
 * but not invoked — keeping the signature stable lets plan-006 / plan-007 add diagnostics
 * without breaking call sites.
 */
export function signalKeyStoreFromAuthStore(store: AuthStore, _logger?: Logger): SignalKeyStore {
  void _logger
  return {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[],
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const out = await store.read(type as AuthStoreKey, ids)
      return out as { [id: string]: SignalDataTypeMap[T] }
    },
    set: async (data: SignalDataSet): Promise<void> => {
      await store.write(data)
    },
    clear: async (): Promise<void> => {
      await store.clear()
    },
  }
}
