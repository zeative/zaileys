import { initAuthCreds } from 'baileys'
import type {
  AuthenticationCreds,
  Chat,
  Contact,
  PresenceData,
  SignalDataSet,
  WAMessage,
} from 'baileys'

/** Build a fresh, deterministic `AuthenticationCreds` blob. */
export const sampleCreds = (): AuthenticationCreds => initAuthCreds()

/** Construct a SignalDataSet with one non-null entry per `SignalDataTypeMap` key. */
export const sampleSignalEntries = (id = '1'): SignalDataSet => {
  const preKeyPublic = Buffer.alloc(32, 0xab)
  const preKeyPrivate = Buffer.alloc(32, 0xcd)
  return {
    'pre-key': { [id]: { public: preKeyPublic, private: preKeyPrivate } },
    session: { [id]: Uint8Array.from([1, 2, 3, 4]) },
    'sender-key': { [id]: Uint8Array.from([5, 6, 7]) },
    'sender-key-memory': { [id]: { 'jid@s.whatsapp.net': true } },
    'app-state-sync-key': {
      [id]: {
        keyData: Buffer.from([0]),
        fingerprint: { rawId: 1, currentIndex: 0, deviceIndexes: [0] },
        timestamp: 12345,
      },
    } as SignalDataSet['app-state-sync-key'],
    'app-state-sync-version': {
      [id]: {
        hash: Buffer.from([0]),
        indexValueMap: {},
        mutations: [],
        version: 0,
      },
    } as SignalDataSet['app-state-sync-version'],
    'lid-mapping': { [id]: '1234567890@lid' },
    'device-list': { [id]: ['device-a', 'device-b'] },
    tctoken: {
      [id]: {
        token: Buffer.from([10, 20, 30]),
        timestamp: '1700000000',
        senderTimestamp: 12345,
      },
    },
    'identity-key': { [id]: Uint8Array.from([0xff, 0xee]) },
  }
}

/** Generate `count` minimal WAMessages with monotonically increasing timestamps. */
export const sampleMessages = (jid: string, count: number): WAMessage[] => {
  const out: WAMessage[] = []
  for (let i = 0; i < count; i += 1) {
    out.push({
      key: { remoteJid: jid, fromMe: false, id: `msg-${jid}-${i}-${Math.random().toString(36).slice(2, 8)}` },
      messageTimestamp: 1_700_000_000 + i,
      message: {
        conversation: `text-${i}`,
        imageMessage: {
          mediaKey: Buffer.from([i & 0xff, 0xde, 0xad, 0xbe, 0xef]),
          fileSha256: Uint8Array.from([1, 2, 3, 4, 5]),
        },
      },
    } as WAMessage)
  }
  return out
}

/** Minimal Chat fixture. */
export const sampleChat = (jid: string, overrides: Partial<Chat> = {}): Chat => ({
  id: jid,
  conversationTimestamp: 1_700_000_000,
  unreadCount: 0,
  ...overrides,
}) as Chat

/** Minimal Contact fixture. */
export const sampleContact = (jid: string): Contact => ({
  id: jid,
  name: 'Test User',
  notify: 'tester',
}) as Contact

/** Minimal PresenceData fixture. */
export const samplePresence = (): PresenceData => ({
  lastKnownPresence: 'available',
  lastSeen: 12345,
}) as PresenceData

const isBufferLike = (value: unknown): value is Buffer | Uint8Array =>
  value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value))

const toBuffer = (value: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength)

/** Throw with a path-tagged message when `expected` and `actual` differ; Buffers compared byte-wise. */
export const assertSignalEquals = (expected: unknown, actual: unknown, path = '$'): void => {
  if (isBufferLike(expected) || isBufferLike(actual)) {
    if (!isBufferLike(expected) || !isBufferLike(actual)) {
      throw new Error(`assertSignalEquals: buffer type mismatch at ${path}`)
    }
    if (Buffer.compare(toBuffer(expected), toBuffer(actual)) !== 0) {
      throw new Error(
        `assertSignalEquals: buffer bytes differ at ${path} (expected=${toBuffer(expected).toString('hex')}, actual=${toBuffer(actual).toString('hex')})`,
      )
    }
    return
  }
  if (expected === actual) return
  if (expected === null || actual === null || typeof expected !== typeof actual) {
    throw new Error(`assertSignalEquals: scalar mismatch at ${path} (expected=${String(expected)}, actual=${String(actual)})`)
  }
  if (typeof expected !== 'object') {
    if (expected !== actual) {
      throw new Error(`assertSignalEquals: scalar mismatch at ${path} (expected=${String(expected)}, actual=${String(actual)})`)
    }
    return
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      throw new Error(`assertSignalEquals: array shape mismatch at ${path}`)
    }
    if (expected.length !== actual.length) {
      throw new Error(`assertSignalEquals: array length mismatch at ${path} (expected=${expected.length}, actual=${actual.length})`)
    }
    for (let i = 0; i < expected.length; i += 1) {
      assertSignalEquals(expected[i], actual[i], `${path}[${i}]`)
    }
    return
  }
  const expectedKeys = Object.keys(expected as Record<string, unknown>).sort()
  const actualKeys = Object.keys(actual as Record<string, unknown>).sort()
  if (expectedKeys.length !== actualKeys.length || expectedKeys.some((k, i) => k !== actualKeys[i])) {
    throw new Error(
      `assertSignalEquals: key set mismatch at ${path} (expected=[${expectedKeys.join(',')}], actual=[${actualKeys.join(',')}])`,
    )
  }
  for (const key of expectedKeys) {
    assertSignalEquals(
      (expected as Record<string, unknown>)[key],
      (actual as Record<string, unknown>)[key],
      `${path}.${key}`,
    )
  }
}
