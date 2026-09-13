import type { SignalDataSet, SignalDataTypeMap, SignalKeyStore } from 'baileys'
import type { AuthStore, AuthStoreKey } from '../auth/types.js'
import type { Logger } from '../client/types.js'

/**
 * `clear` is deliberately omitted. Every adapter's `signal.clear()` also erases credentials
 * (AUTH-07), and baileys types `SignalKeyStore.clear` as optional — handing it over would let a
 * future baileys release wipe a live session while merely resetting signal state. zaileys' own
 * logout path calls `auth.signal.clear()` directly instead.
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
  }
}
