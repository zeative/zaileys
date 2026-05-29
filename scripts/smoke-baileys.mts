import makeWASocket, {
  DisconnectReason,
  Browsers,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  WAMessageAddressingMode,
  proto,
} from 'baileys'
import type {
  AnyMessageContent,
  WAMessageKey,
  WAMessage,
  BinaryNode,
  SignalDataTypeMap,
  AuthenticationCreds,
  SignalKeyStoreWithTransaction,
} from 'baileys'

const assertions: Array<[string, unknown]> = [
  ['makeWASocket', makeWASocket],
  ['DisconnectReason', DisconnectReason],
  ['Browsers', Browsers],
  ['makeCacheableSignalKeyStore', makeCacheableSignalKeyStore],
  ['fetchLatestBaileysVersion', fetchLatestBaileysVersion],
  ['WAMessageAddressingMode', WAMessageAddressingMode],
  ['proto', proto],
]

for (const [name, value] of assertions) {
  if (value == null) {
    console.error(`FAIL: ${name} is null/undefined from baileys rc13`)
    process.exit(1)
  }
}

const identityKeyDecl = ('identity-key' as keyof SignalDataTypeMap)
void identityKeyDecl

type _TypeChecks = {
  amc: AnyMessageContent
  wmk: WAMessageKey
  wm: WAMessage
  bn: BinaryNode
  ac: AuthenticationCreds
  skt: SignalKeyStoreWithTransaction
}
void (null as unknown as _TypeChecks)

console.log('OK: baileys rc13 public API surface verified')
console.log(`  - makeWASocket: ${typeof makeWASocket}`)
console.log(`  - DisconnectReason keys: ${Object.keys(DisconnectReason).length}`)
console.log(`  - WAMessageAddressingMode: ${JSON.stringify(WAMessageAddressingMode)}`)
process.exit(0)
