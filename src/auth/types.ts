import type { SignalDataTypeMap, AuthenticationCreds } from 'baileys'

export type AuthStoreKey = keyof SignalDataTypeMap

export type AuthStoreValue<K extends AuthStoreKey> = SignalDataTypeMap[K]

export type AuthStoreReadResult<K extends AuthStoreKey> = {
  [id: string]: AuthStoreValue<K> | null
}

/**
 * Generic key-material store for Baileys signal data.
 * Backing categories follow `SignalDataTypeMap` and include `identity-key`
 * (rc12+, Uint8Array) and `tctoken` whose lifecycle is managed silently upstream.
 */
export interface AuthStore {
  read<K extends AuthStoreKey>(category: K, ids: readonly string[]): Promise<AuthStoreReadResult<K>>
  write(category: AuthStoreKey, data: Record<string, unknown>): Promise<void>
  delete(category: AuthStoreKey, ids: readonly string[]): Promise<void>
  clear(): Promise<void>
  close(): Promise<void>
}

/**
 * Credential persistence for `AuthenticationCreds` (noise key, signed identity, pairing state).
 */
export interface AuthCredsStore {
  readCreds(): Promise<AuthenticationCreds | null>
  writeCreds(creds: AuthenticationCreds): Promise<void>
  clearCreds(): Promise<void>
}

/**
 * Composite bundle handed to the Client to satisfy Baileys auth wiring.
 */
export interface AuthStoreBundle {
  readonly keys: AuthStore
  readonly creds: AuthCredsStore
}
