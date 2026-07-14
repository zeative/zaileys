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

export interface CloudTemplateStatusEvent {
  event: string
  id: string
  name: string
  language?: string
  reason?: string
}

const translateTemplateStatus = (value: Record<string, unknown>): CloudTemplateStatusEvent | null => {
  const event = value['event']
  const name = value['message_template_name']
  if (typeof event !== 'string' || typeof name !== 'string') return null
  return {
    event,
    id: String(value['message_template_id'] ?? ''),
    name,
    ...(typeof value['message_template_language'] === 'string'
      ? { language: value['message_template_language'] }
      : {}),
    ...(typeof value['reason'] === 'string' ? { reason: value['reason'] } : {}),
  }
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

const locationNode = (msg: CloudWebhookMessage): Record<string, unknown> | null => {
  const location = msg['location'] as
    | { latitude?: number; longitude?: number; name?: string; address?: string }
    | undefined
  if (msg.type !== 'location' || typeof location?.latitude !== 'number' || typeof location.longitude !== 'number') {
    return null
  }
  return {
    locationMessage: {
      degreesLatitude: location.latitude,
      degreesLongitude: location.longitude,
      ...(location.name ? { name: location.name } : {}),
      ...(location.address ? { address: location.address } : {}),
    },
  }
}

const contactsNode = (msg: CloudWebhookMessage): Record<string, unknown> | null => {
  const contacts = msg['contacts'] as
    | Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string; wa_id?: string }> }>
    | undefined
  if (msg.type !== 'contacts' || !Array.isArray(contacts) || contacts.length === 0) return null
  const cards = contacts.map((c) => {
    const name = c.name?.formatted_name ?? ''
    const tels = (c.phones ?? [])
      .filter((p) => typeof p.phone === 'string')
      .map((p) => `TEL${p.wa_id ? `;waid=${p.wa_id}` : ''}:${p.phone}`)
      .join('\n')
    return {
      displayName: name,
      vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${name}${tels ? `\n${tels}` : ''}\nEND:VCARD`,
    }
  })
  const single = cards.length === 1 ? cards[0] : undefined
  if (single) return { contactMessage: single }
  return { contactsArrayMessage: { displayName: `${cards.length} contacts`, contacts: cards } }
}

/**
 * Attach a baileys-shaped contextInfo (from Meta's `context: { id, from }`) so the decoder can
 * resolve the quoted message via the store — enables `msg.replied()` on cloud replies. A stub
 * `quotedMessage` is required to enter the decoder's resolve branch (it looks up by stanzaId).
 */
const applyQuotedContext = (
  message: Record<string, unknown>,
  msg: CloudWebhookMessage,
): Record<string, unknown> => {
  const context = msg['context'] as { id?: string; from?: string } | undefined
  if (!context?.id) return message
  const contextInfo = {
    stanzaId: context.id,
    ...(context.from ? { participant: toJid(context.from) } : {}),
    quotedMessage: {},
  }
  if (typeof message['conversation'] === 'string') {
    return { extendedTextMessage: { text: message['conversation'], contextInfo } }
  }
  const key = Object.keys(message)[0]
  if (key) (message[key] as Record<string, unknown>)['contextInfo'] = contextInfo
  return message
}

const translateMessage = (msg: CloudWebhookMessage, value: CloudWebhookValue): WAMessage | null => {
  if (!msg.id || !msg.from) return null
  const node: Record<string, unknown> | null =
    msg.type === 'text' && typeof msg.text?.body === 'string'
      ? { conversation: msg.text.body }
      : (mediaNode(msg) ?? interactiveNode(msg) ?? locationNode(msg) ?? contactsNode(msg))
  if (node === null) return null
  const message = applyQuotedContext(node, msg)
  const pushName = contactName(value, msg.from)
  return {
    key: { id: msg.id, remoteJid: toJid(msg.from), fromMe: false },
    message,
    messageTimestamp: Number(msg.timestamp ?? 0) || 0,
    ...(pushName ? { pushName } : {}),
  } as WAMessage
}

export type CloudMessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface CloudStatusEvent {
  id: string
  status: CloudMessageStatus
  recipientId: string
  timestamp: number
  conversationId?: string
  error?: { code?: number; title?: string; message?: string }
}

const translateStatus = (raw: Record<string, unknown>): CloudStatusEvent | null => {
  const id = raw['id']
  const status = raw['status']
  if (typeof id !== 'string' || typeof status !== 'string') return null
  if (status !== 'sent' && status !== 'delivered' && status !== 'read' && status !== 'failed') return null
  const recipient = typeof raw['recipient_id'] === 'string' ? toJid(raw['recipient_id']) : ''
  const conversation = raw['conversation'] as { id?: string } | undefined
  const errors = raw['errors'] as Array<{ code?: number; title?: string; message?: string }> | undefined
  return {
    id,
    status,
    recipientId: recipient,
    timestamp: Number(raw['timestamp'] ?? 0) || 0,
    ...(conversation?.id ? { conversationId: conversation.id } : {}),
    ...(errors?.[0] ? { error: errors[0] } : {}),
  }
}

export interface CloudFlowResponseEvent {
  id: string
  name: string
  body?: string
  response: Record<string, unknown>
  senderId: string
  senderName?: string
  timestamp: number
}

export interface CloudOrderEvent {
  id: string
  catalogId: string
  text?: string
  items: Array<{ productRetailerId: string; quantity: number; price: number; currency: string }>
  senderId: string
  senderName?: string
  timestamp: number
}

const translateFlowResponse = (msg: CloudWebhookMessage, value: CloudWebhookValue): CloudFlowResponseEvent | null => {
  const interactive = msg['interactive'] as
    | { type?: string; nfm_reply?: { name?: string; body?: string; response_json?: string } }
    | undefined
  if (msg.type !== 'interactive' || interactive?.type !== 'nfm_reply' || !msg.id || !msg.from) return null
  const nfm = interactive.nfm_reply
  let response: Record<string, unknown> = {}
  try {
    response = JSON.parse(nfm?.response_json ?? '{}') as Record<string, unknown>
  } catch {
    response = {}
  }
  const pushName = contactName(value, msg.from)
  return {
    id: msg.id,
    name: nfm?.name ?? 'flow',
    ...(nfm?.body ? { body: nfm.body } : {}),
    response,
    senderId: toJid(msg.from),
    ...(pushName ? { senderName: pushName } : {}),
    timestamp: Number(msg.timestamp ?? 0) || 0,
  }
}

const translateOrder = (msg: CloudWebhookMessage, value: CloudWebhookValue): CloudOrderEvent | null => {
  const order = msg['order'] as
    | {
        catalog_id?: string
        text?: string
        product_items?: Array<{ product_retailer_id?: string; quantity?: number; item_price?: number; currency?: string }>
      }
    | undefined
  if (msg.type !== 'order' || !order || !msg.id || !msg.from) return null
  const pushName = contactName(value, msg.from)
  return {
    id: msg.id,
    catalogId: order.catalog_id ?? '',
    ...(order.text ? { text: order.text } : {}),
    items: (order.product_items ?? []).map((p) => ({
      productRetailerId: p.product_retailer_id ?? '',
      quantity: p.quantity ?? 0,
      price: p.item_price ?? 0,
      currency: p.currency ?? '',
    })),
    senderId: toJid(msg.from),
    ...(pushName ? { senderName: pushName } : {}),
    timestamp: Number(msg.timestamp ?? 0) || 0,
  }
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
  statuses: CloudStatusEvent[]
  templateStatuses: CloudTemplateStatusEvent[]
  flowResponses: CloudFlowResponseEvent[]
  orders: CloudOrderEvent[]
} {
  const messages: WAMessage[] = []
  const reactions: CloudReactionItem[] = []
  const statuses: CloudStatusEvent[] = []
  const templateStatuses: CloudTemplateStatusEvent[] = []
  const flowResponses: CloudFlowResponseEvent[] = []
  const orders: CloudOrderEvent[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      if (!value) continue
      if (change.field === 'message_template_status_update') {
        const tpl = translateTemplateStatus(value as Record<string, unknown>)
        if (tpl) templateStatuses.push(tpl)
        continue
      }
      for (const msg of value.messages ?? []) {
        const reaction = translateReaction(msg, value)
        if (reaction) {
          reactions.push(reaction)
          continue
        }
        const flowResponse = translateFlowResponse(msg, value)
        if (flowResponse) {
          flowResponses.push(flowResponse)
          continue
        }
        const order = translateOrder(msg, value)
        if (order) {
          orders.push(order)
          continue
        }
        const translated = translateMessage(msg, value)
        if (translated) messages.push(translated)
      }
      for (const raw of value.statuses ?? []) {
        const status = translateStatus(raw)
        if (status) statuses.push(status)
      }
    }
  }
  return { messages, reactions, statuses, templateStatuses, flowResponses, orders }
}
