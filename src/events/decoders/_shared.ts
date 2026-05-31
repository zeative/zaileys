import { isJidGroup, jidNormalizedUser, type WAContextInfo, type WAMessageKey } from 'baileys'
import type { QuotedRef, SenderInfo } from '../types.js'

/** Structural shape of a protobuf `Long` value (avoids a hard `long` dependency). */
export interface LongLike {
  toNumber(): number
  low: number
  high: number
}

/** LID-aware addressing aliases lifted from a message key. */
export interface AddressingAliases {
  remoteJidAlt?: string
  remoteJidUsername?: string
  participantAlt?: string
  participantUsername?: string
}

/** Mentions extracted from a context info, with a group-wide `@all` flag. */
export interface ExtractedMentions {
  mentionedJids: string[]
  mentionAll: boolean
}

/** Normalize a raw JID, returning `null` when absent or empty. */
export const extractJid = (remoteJid: string | undefined | null): string | null => {
  if (typeof remoteJid !== 'string' || remoteJid.length === 0) return null
  return jidNormalizedUser(remoteJid)
}

const nonEmpty = (value: string | undefined | null): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const PN_SERVERS = ['@s.whatsapp.net', '@c.us'] as const

/** Report whether a JID uses the hidden-number LID server (`@lid`). */
export const isLidJid = (jid: string): boolean => jid.endsWith('@lid')

/** Report whether a JID uses a phone-number server (`@s.whatsapp.net` / `@c.us`). */
export const isPnJid = (jid: string): boolean => PN_SERVERS.some((server) => jid.endsWith(server))

/**
 * Build {@link SenderInfo} from a message key. The primary addressing JID and its
 * alt (`participantAlt`/`remoteJidAlt`) are classified by server type so `pn` always
 * holds the phone-number JID (`@s.whatsapp.net`) and `lid` always holds the hidden
 * `@lid` JID — regardless of which one WhatsApp put in the primary slot.
 */
export const extractSender = (
  key: WAMessageKey | undefined,
  pushName?: string,
): SenderInfo | null => {
  if (!key) return null
  const raw = nonEmpty(key.participant) ?? key.remoteJid
  const jid = extractJid(raw)
  if (jid === null) return null
  const altRaw = nonEmpty(key.participantAlt) ?? nonEmpty(key.remoteJidAlt)
  const alt = altRaw != null ? extractJid(altRaw) : null
  const username = nonEmpty(key.participantUsername) ?? nonEmpty(key.remoteJidUsername)
  const sender: SenderInfo = { jid, isMe: key.fromMe === true }
  const candidates = alt !== null ? [jid, alt] : [jid]
  const lid = candidates.find(isLidJid)
  const pn = candidates.find(isPnJid)
  if (lid !== undefined) sender.lid = lid
  if (pn !== undefined) sender.pn = pn
  if (username !== undefined) sender.username = username
  const name = nonEmpty(pushName)
  if (name !== undefined) sender.pushName = name
  return sender
}

/** Resolve a quoted-message reference from a context info, or `null` when absent. */
export const extractQuoted = (
  contextInfo: WAContextInfo | null | undefined,
): QuotedRef | null => {
  if (!contextInfo) return null
  const stanzaId = contextInfo.stanzaId
  if (typeof stanzaId !== 'string' || stanzaId.length === 0) return null
  const participant = nonEmpty(contextInfo.participant)
  const remoteJid = nonEmpty(contextInfo.remoteJid) ?? participant
  const key: WAMessageKey = { id: stanzaId }
  if (typeof remoteJid === 'string') key.remoteJid = remoteJid
  if (typeof participant === 'string') key.participant = participant
  const quoted: QuotedRef = { key }
  const sender = extractSender(key)
  if (sender) quoted.sender = sender
  return quoted
}

/** Extract mentioned JIDs and the group-wide mention flag from a context info. */
export const extractMentions = (
  contextInfo: WAContextInfo | null | undefined,
): ExtractedMentions => {
  if (!contextInfo) return { mentionedJids: [], mentionAll: false }
  const raw = contextInfo.mentionedJid
  const mentionedJids = Array.isArray(raw) ? raw.filter((j): j is string => typeof j === 'string') : []
  const groupMentions = contextInfo.groupMentions
  const mentionAll = Array.isArray(groupMentions) && groupMentions.length > 0
  return { mentionedJids, mentionAll }
}

/** Lift LID-aware addressing aliases off a message key into a plain object. */
export const mapAddressing = (key: WAMessageKey): AddressingAliases => {
  const out: AddressingAliases = {}
  if (typeof key.remoteJidAlt === 'string') out.remoteJidAlt = key.remoteJidAlt
  if (typeof key.remoteJidUsername === 'string') out.remoteJidUsername = key.remoteJidUsername
  if (typeof key.participantAlt === 'string') out.participantAlt = key.participantAlt
  if (typeof key.participantUsername === 'string') out.participantUsername = key.participantUsername
  return out
}

/** Report whether a JID addresses a group (`@g.us`). */
export const isGroupJid = (jid: string): boolean => {
  return isJidGroup(jid) === true
}

/** Coerce a `number`, protobuf `Long`, or nullish value into a finite number or `null`. */
export const safeNumber = (n: number | LongLike | null | undefined): number | null => {
  if (n == null) return null
  if (typeof n === 'number') return Number.isFinite(n) ? n : null
  if (typeof n.toNumber === 'function') {
    const value = n.toNumber()
    return Number.isFinite(value) ? value : null
  }
  return null
}
