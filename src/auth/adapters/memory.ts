import type { AuthenticationCreds, SignalDataSet } from 'baileys'
import { ZaileysStoreError } from '../../types/store-error.js'
import type {
  AuthCredsStore,
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from '../types.js'

/**
 * In-process `AuthStoreBundle` backed by JS `Map` instances.
 * Ideal for tests and ephemeral scripts; data is lost on process exit.
 */
export class MemoryAuthStore implements AuthStoreBundle {
  private credsBlob: AuthenticationCreds | undefined
  private readonly signalMap: Map<AuthStoreKey, Map<string, unknown>> = new Map()
  private closed = false

  /** Signal-key store view backed by the shared in-process map. */
  readonly signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      this.assertOpen()
      const inner = this.signalMap.get(type)
      const out: { [id: string]: AuthStoreValue<K> | undefined } = {}
      if (!inner) return out
      for (const id of ids) {
        const value = inner.get(id)
        if (value !== undefined) {
          out[id] = value as AuthStoreValue<K>
        }
      }
      return out
    },
    write: async (data: SignalDataSet): Promise<void> => {
      this.assertOpen()
      for (const rawType of Object.keys(data) as AuthStoreKey[]) {
        const entries = (data as Record<string, Record<string, unknown> | undefined>)[rawType]
        if (!entries) continue
        let inner = this.signalMap.get(rawType)
        if (!inner) {
          inner = new Map<string, unknown>()
          this.signalMap.set(rawType, inner)
        }
        for (const id of Object.keys(entries)) {
          const value = entries[id]
          if (value === null) {
            inner.delete(id)
          } else if (value !== undefined) {
            inner.set(id, value)
          }
        }
      }
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      this.assertOpen()
      const inner = this.signalMap.get(type)
      if (!inner) return
      for (const id of ids) inner.delete(id)
    },
    clear: async (): Promise<void> => {
      this.assertOpen()
      this.signalMap.clear()
      this.credsBlob = undefined
    },
    close: async (): Promise<void> => {
      this.closed = true
    },
  }

  /** Credential store view sharing closure state with {@link MemoryAuthStore.signal}. */
  readonly creds: AuthCredsStore = {
    readCreds: async (): Promise<AuthenticationCreds | undefined> => {
      this.assertOpen()
      return this.credsBlob
    },
    writeCreds: async (next: AuthenticationCreds): Promise<void> => {
      this.assertOpen()
      this.credsBlob = structuredClone(next)
    },
    deleteCreds: async (): Promise<void> => {
      this.assertOpen()
      this.credsBlob = undefined
    },
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ZaileysStoreError('STORE_CLOSED', 'MemoryAuthStore is closed')
    }
  }
}
