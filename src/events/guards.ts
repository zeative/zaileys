import type { WAMessage, MessageUpsertType } from 'baileys'

export const SELF_ONLY_PROTOCOL_TYPES = Object.freeze([
  'HISTORY_SYNC_NOTIFICATION',
  'APP_STATE_SYNC_KEY_SHARE',
  'LID_MIGRATION_MAPPING_SYNC',
  'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE',
] as const)

export type SelfOnlyProtocolType = (typeof SELF_ONLY_PROTOCOL_TYPES)[number]

export interface UpsertPayload {
  messages: WAMessage[]
  type: MessageUpsertType
  requestId?: string
}

export const dropSpoofedSelfOnly = (upsert: UpsertPayload): UpsertPayload => {
  const carriesRequestId = upsert.requestId != null
  const filtered = upsert.messages.filter((msg) => {
    if (carriesRequestId) return false
    const stubParams = msg.messageStubParameters
    if (Array.isArray(stubParams)) {
      for (const entry of stubParams) {
        if (typeof entry === 'string' && entry.startsWith('requestId:')) return false
      }
    }
    return true
  })
  return { ...upsert, messages: filtered }
}
