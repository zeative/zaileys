import type { WAMessage } from 'baileys'
import { toJid } from './outbound.js'

export interface CloudInboundMedia {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
  filename?: string
  voice?: boolean
  animated?: boolean
}

export interface CloudWebhookMessage {
  from?: string
  id?: string
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: CloudInboundMedia
  video?: CloudInboundMedia
  audio?: CloudInboundMedia
  document?: CloudInboundMedia
  sticker?: CloudInboundMedia
  [key: string]: unknown
}

const MEDIA_KINDS = ['image', 'video', 'audio', 'document', 'sticker'] as const

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

const mediaNode = (msg: CloudWebhookMessage): Record<string, unknown> | null => {
  for (const kind of MEDIA_KINDS) {
    const media = msg[kind]
    if (msg.type === kind && media && typeof media === 'object') {
      const m = media as CloudInboundMedia
      return {
        [`${kind}Message`]: {
          ...(m.mime_type ? { mimetype: m.mime_type } : {}),
          ...(m.caption ? { caption: m.caption } : {}),
          ...(m.filename ? { fileName: m.filename } : {}),
          ...(m.voice === true ? { ptt: true } : {}),
          ...(m.id ? { cloudMediaId: m.id } : {}),
        },
      }
    }
  }
  return null
}

const interactiveNode = (msg: CloudWebhookMessage): Record<string, unknown> | null => {
  const interactive = msg['interactive'] as
    | {
        type?: string
        button_reply?: { id?: string; title?: string }
        list_reply?: { id?: string; title?: string; description?: string }
      }
    | undefined
  if (msg.type !== 'interactive' || !interactive) return null
  if (interactive.type === 'button_reply' && interactive.button_reply?.id) {
    return {
      buttonsResponseMessage: {
        selectedButtonId: interactive.button_reply.id,
        selectedDisplayText: interactive.button_reply.title ?? '',
      },
    }
  }
  if (interactive.type === 'list_reply' && interactive.list_reply?.id) {
    return {
      listResponseMessage: {
        singleSelectReply: { selectedRowId: interactive.list_reply.id },
        title: interactive.list_reply.title ?? '',
      },
    }
  }
  return null
}

const translateMessage = (msg: CloudWebhookMessage, value: CloudWebhookValue): WAMessage | null => {
  if (!msg.id || !msg.from) return null
  const message: Record<string, unknown> | null =
    msg.type === 'text' && typeof msg.text?.body === 'string'
      ? { conversation: msg.text.body }
      : (mediaNode(msg) ?? interactiveNode(msg))
  if (message === null) return null
  const pushName = contactName(value, msg.from)
  return {
    key: { id: msg.id, remoteJid: toJid(msg.from), fromMe: false },
    message,
    messageTimestamp: Number(msg.timestamp ?? 0) || 0,
    ...(pushName ? { pushName } : {}),
  } as WAMessage
}

export interface CloudReactionItem {
  key: { id: string; remoteJid: string; fromMe: boolean }
  reaction: { key: { id: string; remoteJid: string; fromMe: boolean }; text: string; senderTimestampMs: number }
  pushName?: string
}

const translateReaction = (msg: CloudWebhookMessage, value: CloudWebhookValue): CloudReactionItem | null => {
  const reaction = msg['reaction'] as { message_id?: string; emoji?: string } | undefined
  if (msg.type !== 'reaction' || !msg.id || !msg.from || typeof reaction?.message_id !== 'string') return null
  const senderJid = toJid(msg.from)
  const pushName = contactName(value, msg.from)
  return {
    key: { id: msg.id, remoteJid: senderJid, fromMe: false },
    reaction: {
      key: { id: reaction.message_id, remoteJid: senderJid, fromMe: false },
      text: reaction.emoji ?? '',
      senderTimestampMs: (Number(msg.timestamp ?? 0) || 0) * 1000,
    },
    ...(pushName ? { pushName } : {}),
  }
}

/** Flatten a Meta webhook delivery into baileys-shaped events the existing pipeline can decode. */
export function translateInbound(payload: CloudWebhookPayload): {
  messages: WAMessage[]
  reactions: CloudReactionItem[]
} {
  const messages: WAMessage[] = []
  const reactions: CloudReactionItem[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      for (const msg of value.messages ?? []) {
        const reaction = translateReaction(msg, value)
        if (reaction) {
          reactions.push(reaction)
          continue
        }
        const translated = translateMessage(msg, value)
        if (translated) messages.push(translated)
      }
    }
  }
  return { messages, reactions }
}
