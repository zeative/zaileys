import type { AuthenticationCreds, SignalDataSet, SignalDataTypeMap } from 'baileys'

/** Discriminator union for every Baileys signal category. */
export type AuthStoreKey = keyof SignalDataTypeMap

/** Resolved value type for a given signal category. */
export type AuthStoreValue<K extends AuthStoreKey> = SignalDataTypeMap[K]

/**
 * Pluggable signal-key store mirroring Baileys' `SignalKeyStore` shape.
 * After {@link AuthStore.close} resolves every other method MUST throw
 * `ZaileysStoreError` with code `STORE_CLOSED`.
 */
export interface AuthStore {
  /**
   * Look up signal values by id within a single category.
   * @param type Signal category to read.
   * @param ids Identifiers to fetch.
   * @returns Map keyed by id; missing ids resolve to `undefined`.
   */
  read<K extends AuthStoreKey>(
    type: K,
    ids: readonly string[],
  ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }>
  /**
   * Persist a partial signal map. `null` values delete the matching id.
   * @param data Baileys `SignalDataSet` payload (full or partial).
   */
  write(data: SignalDataSet): Promise<void>
  /**
   * Remove ids from a category.
   * @param type Signal category.
   * @param ids Identifiers to drop.
   */
  delete<K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void>
  /** Wipe every signal category (used on 401/410 auto-cleanup). */
  clear(): Promise<void>
  /** Release backing resources; idempotent. */
  close(): Promise<void>
}

/**
 * Credential persistence for the long-lived `AuthenticationCreds` blob.
 * After {@link AuthCredsStore} sibling close every method MUST throw
 * `ZaileysStoreError` with code `STORE_CLOSED`.
 */
export interface AuthCredsStore {
  /** Load persisted creds; resolves `undefined` when none exist. */
  readCreds(): Promise<AuthenticationCreds | undefined>
  /** Persist creds atomically. */
  writeCreds(creds: AuthenticationCreds): Promise<void>
  /** Remove persisted creds. */
  deleteCreds(): Promise<void>
}

/** Composite bundle handed to the Client to satisfy Baileys auth wiring. */
export interface AuthStoreBundle {
  readonly creds: AuthCredsStore
  readonly signal: AuthStore
}
