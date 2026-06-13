import { makeCacheableSignalKeyStore } from 'baileys'
import type { SignalDataSet } from 'baileys'
import type {
  AuthStore,
  AuthStoreBundle,
  AuthStoreKey,
  AuthStoreValue,
} from './types.js'

export interface CacheableAuthStoreOptions {
  logger?: {
    trace?: (msg: unknown) => void
    debug?: (msg: unknown) => void
    info?: (msg: unknown) => void
    warn?: (msg: unknown) => void
    error?: (msg: unknown) => void
  }
}

export function makeCacheableAuthStore(
  bundle: AuthStoreBundle,
  options?: CacheableAuthStoreOptions,
): AuthStoreBundle {
  const underlying = bundle.signal
  const adapter = {
    get: <K extends AuthStoreKey>(
      type: K,
      ids: string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> =>
      underlying.read(type, ids),
    set: (data: SignalDataSet): Promise<void> => underlying.write(data),
    clear: (): Promise<void> => underlying.clear(),
  }
  const cached = makeCacheableSignalKeyStore(
    adapter as never,
    (options?.logger ?? undefined) as never,
  )
  const signal: AuthStore = {
    read: async <K extends AuthStoreKey>(
      type: K,
      ids: readonly string[],
    ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }> => {
      const out = await cached.get(type as never, [...ids] as never)
      return out as { [id: string]: AuthStoreValue<K> | undefined }
    },
    write: async (data: SignalDataSet): Promise<void> => {
      await cached.set(data as never)
    },
    delete: async <K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void> => {
      await underlying.delete(type, ids)
      const invalidation: Record<string, Record<string, null>> = {}
      const inner: Record<string, null> = {}
      for (const id of ids) inner[id] = null
      invalidation[type as string] = inner
      await cached.set(invalidation as never)
    },
    clear: async (): Promise<void> => {
      const maybeClear = (cached as { clear?: () => Promise<void> }).clear
      if (typeof maybeClear === 'function') await maybeClear.call(cached)
      else await underlying.clear()
    },
    close: (): Promise<void> => underlying.close(),
  }
  return { creds: bundle.creds, signal }
}
