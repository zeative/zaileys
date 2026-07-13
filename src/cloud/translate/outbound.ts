import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'

export interface GraphMessagePayload {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: string
  context?: { message_id: string }
  [key: string]: unknown
}

/** Graph `to` is a bare number — strip any jid server suffix. */
export const toGraphRecipient = (to: string): string => to.split('@')[0] ?? to

export const toJid = (recipient: string): string =>
  recipient.includes('@') ? recipient : `${recipient}@s.whatsapp.net`

export const basePayload = (to: string, type: string, options?: MiscMessageGenerationOptions): GraphMessagePayload => {
  const payload: GraphMessagePayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toGraphRecipient(to),
    type,
  }
  const quotedId = (options?.quoted as WAMessage | undefined)?.key?.id
  if (quotedId) payload.context = { message_id: quotedId }
  return payload
}

/** Translate baileys-style outbound content to a Graph payload; null = not translatable yet. */
export function translateOutbound(
  to: string,
  content: AnyMessageContent,
  options?: MiscMessageGenerationOptions,
): GraphMessagePayload | null {
  const c = content as Record<string, unknown>
  if (typeof c['text'] === 'string') {
    return { ...basePayload(to, 'text', options), text: { body: c['text'] } }
  }
  const react = c['react'] as { text?: string; key?: { id?: string } } | undefined
  if (react && typeof react === 'object' && typeof react.key?.id === 'string') {
    return {
      ...basePayload(to, 'reaction', options),
      reaction: { message_id: react.key.id, emoji: react.text ?? '' },
    }
  }
  return null
}

/** Minimal baileys-shaped WAMessage so recordSent/store/reply keep working on cloud. */
export function synthesizeSentMessage(
  wamid: string,
  to: string,
  content: AnyMessageContent,
  timestampMs: number,
): WAMessage {
  const c = content as Record<string, unknown>
  const message: Record<string, unknown> = typeof c['text'] === 'string' ? { conversation: c['text'] } : {}
  return {
    key: { id: wamid, remoteJid: toJid(toGraphRecipient(to)), fromMe: true },
    message,
    messageTimestamp: Math.floor(timestampMs / 1000),
  } as WAMessage
}
