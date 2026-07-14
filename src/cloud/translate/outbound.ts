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
  const location = c['location'] as
    | { degreesLatitude?: number; degreesLongitude?: number; name?: string; address?: string }
    | undefined
  if (location && typeof location.degreesLatitude === 'number' && typeof location.degreesLongitude === 'number') {
    return {
      ...basePayload(to, 'location', options),
      location: {
        latitude: location.degreesLatitude,
        longitude: location.degreesLongitude,
        ...(location.name !== undefined ? { name: location.name } : {}),
        ...(location.address !== undefined ? { address: location.address } : {}),
      },
    }
  }
  const contacts = c['contacts'] as { contacts?: Array<{ vcard?: string }> } | undefined
  if (contacts?.contacts && Array.isArray(contacts.contacts)) {
    const parsed = contacts.contacts
      .map((entry) => (typeof entry.vcard === 'string' ? vcardToGraphContact(entry.vcard) : null))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
    if (parsed.length > 0) {
      return { ...basePayload(to, 'contacts', options), contacts: parsed }
    }
  }
  return null
}

/** Minimal vcard extraction (FN/N + TELs) — Graph requires formatted_name plus one name part. */
export function vcardToGraphContact(vcard: string): Record<string, unknown> | null {
  const lines = vcard.split(/\r?\n/)
  let formattedName = ''
  let firstName = ''
  let lastName = ''
  const phones: Array<{ phone: string; wa_id?: string }> = []
  for (const line of lines) {
    if (line.startsWith('FN:')) formattedName = line.slice(3).trim()
    if (line.startsWith('N:')) {
      /** vcard N = Family;Given;Middle;Prefix;Suffix */
      const parts = line.slice(2).split(';')
      lastName = (parts[0] ?? '').trim()
      firstName = (parts[1] ?? '').trim()
    }
    if (line.startsWith('TEL')) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        const phone = line.slice(idx + 1).trim()
        const waidMatch = /waid=([0-9]+)/.exec(line)
        if (phone.length > 0) phones.push({ phone, ...(waidMatch?.[1] ? { wa_id: waidMatch[1] } : {}) })
      }
    }
  }
  if (formattedName.length === 0 && phones.length === 0) return null
  const display = formattedName || phones[0]?.phone || 'Contact'
  /** Graph rejects a name with only formatted_name (#131009); derive first/last from FN when absent. */
  if (firstName.length === 0 && lastName.length === 0) {
    const words = display.split(/\s+/)
    firstName = words[0] ?? display
    if (words.length > 1) lastName = words.slice(1).join(' ')
  }
  return {
    name: {
      formatted_name: display,
      first_name: firstName || display,
      ...(lastName ? { last_name: lastName } : {}),
    },
    ...(phones.length > 0 ? { phones } : {}),
  }
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
