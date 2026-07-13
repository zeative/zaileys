import type { WAMessage } from 'baileys'
import { toJid } from './outbound.js'

export interface CloudWebhookMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  [key: string]: unknown
}

export interface CloudWebhookValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
  messages?: CloudWebhookMessage[]
  statuses?: Array<Record<string, unknown>>
}

export interface CloudWebhookPayload {
  object?: string
  entry?: Array<{ id?: string; changes?: Array<{ value?: CloudWebhookValue; field?: string }> }>
}

const contactName = (value: CloudWebhookValue, waId: string | undefined): string | undefined =>
  value.contacts?.find((c) => c.wa_id === waId)?.profile?.name ?? value.contacts?.[0]?.profile?.name

const translateMessage = (msg: CloudWebhookMessage, value: CloudWebhookValue): WAMessage | null => {
  if (!msg.id || !msg.from) return null
  const message: Record<string, unknown> | null =
    msg.type === 'text' && typeof msg.text?.body === 'string' ? { conversation: msg.text.body } : null
  if (message === null) return null
  const pushName = contactName(value, msg.from)
  return {
    key: { id: msg.id, remoteJid: toJid(msg.from), fromMe: false },
    message,
    messageTimestamp: Number(msg.timestamp ?? 0) || 0,
    ...(pushName ? { pushName } : {}),
  } as WAMessage
}

/** Flatten a Meta webhook delivery into baileys-shaped messages the existing pipeline can decode. */
export function translateInbound(payload: CloudWebhookPayload): { messages: WAMessage[] } {
  const messages: WAMessage[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      for (const msg of value.messages ?? []) {
        const translated = translateMessage(msg, value)
        if (translated) messages.push(translated)
      }
    }
  }
  return { messages }
}
