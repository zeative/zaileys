import { proto, type WAMessage, type MessageUpsertType } from 'baileys'

/**
 * Protocol messages that only ever originate from our own devices. WhatsApp does not authenticate
 * the sender of these for us, so an ordinary contact can put one on the wire.
 */
export const SELF_ONLY_PROTOCOL_TYPES = Object.freeze([
  'HISTORY_SYNC_NOTIFICATION',
  'APP_STATE_SYNC_KEY_SHARE',
  'LID_MIGRATION_MAPPING_SYNC',
  'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE',
] as const)

export type SelfOnlyProtocolType = (typeof SELF_ONLY_PROTOCOL_TYPES)[number]

let selfOnlyTypeValues: ReadonlySet<number> | undefined

/**
 * Resolved from the proto enum on first use, so a renumbering upstream cannot silently disarm the
 * guard. Lazy and defensive: reading it at module scope would throw wherever `baileys` is mocked.
 */
const selfOnlyValues = (): ReadonlySet<number> => {
  if (selfOnlyTypeValues !== undefined) return selfOnlyTypeValues
  const table = (proto as { Message?: { ProtocolMessage?: { Type?: Record<string, unknown> } } })
    ?.Message?.ProtocolMessage?.Type
  selfOnlyTypeValues = new Set(
    SELF_ONLY_PROTOCOL_TYPES.map((name) => table?.[name]).filter(
      (value): value is number => typeof value === 'number',
    ),
  )
  return selfOnlyTypeValues
}

export interface UpsertPayload {
  messages: WAMessage[]
  type: MessageUpsertType
  requestId?: string
}

const protocolTypeOf = (msg: WAMessage): number | string | undefined => {
  const content = msg.message as Record<string, unknown> | null | undefined
  const protocol = content?.['protocolMessage'] as { type?: unknown } | undefined
  const type = protocol?.type
  return typeof type === 'number' || typeof type === 'string' ? type : undefined
}

const isSelfOnlyProtocol = (msg: WAMessage): boolean => {
  const type = protocolTypeOf(msg)
  if (type === undefined) return false
  if (typeof type === 'string') return (SELF_ONLY_PROTOCOL_TYPES as readonly string[]).includes(type)
  return selfOnlyValues().has(type)
}

const carriesRequestIdStub = (msg: WAMessage): boolean => {
  const stubParams = msg.messageStubParameters
  if (!Array.isArray(stubParams)) return false
  return stubParams.some((entry) => typeof entry === 'string' && entry.startsWith('requestId:'))
}

export const dropSpoofedSelfOnly = (upsert: UpsertPayload): UpsertPayload => {
  /** A requestId-tagged batch is our own peer-data response, never inbound conversation. */
  if (upsert.requestId != null) return { ...upsert, messages: [] }
  const filtered = upsert.messages.filter((msg) => {
    const fromMe = msg.key?.fromMe === true
    /** Honoured only for our own messages — the stub parameters are otherwise remote-settable. */
    if (fromMe && carriesRequestIdStub(msg)) return false
    if (!fromMe && isSelfOnlyProtocol(msg)) return false
    return true
  })
  return { ...upsert, messages: filtered }
}
