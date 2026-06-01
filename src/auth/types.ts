import type { AuthenticationCreds, SignalDataSet, SignalDataTypeMap } from 'baileys'

export type AuthStoreKey = keyof SignalDataTypeMap

export type AuthStoreValue<K extends AuthStoreKey> = SignalDataTypeMap[K]

export interface AuthStore {
  read<K extends AuthStoreKey>(
    type: K,
    ids: readonly string[],
  ): Promise<{ [id: string]: AuthStoreValue<K> | undefined }>
  write(data: SignalDataSet): Promise<void>
  delete<K extends AuthStoreKey>(type: K, ids: readonly string[]): Promise<void>
  clear(): Promise<void>
  close(): Promise<void>
}

export interface AuthCredsStore {
  readCreds(): Promise<AuthenticationCreds | undefined>
  writeCreds(creds: AuthenticationCreds): Promise<void>
  deleteCreds(): Promise<void>
}

export interface AuthStoreBundle {
  readonly creds: AuthCredsStore
  readonly signal: AuthStore
}
