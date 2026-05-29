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

/** Build {@link SenderInfo} from a message key, preferring participant in group chats. */
export const extractSender = (
  key: WAMessageKey | undefined,
  pushName?: string,
): SenderInfo | null => {
  if (!key) return null
  const raw = key.participant ?? key.remoteJid
  const jid = extractJid(raw)
  if (jid === null) return null
  const alt = key.participantAlt ?? key.remoteJidAlt
  const username = key.participantUsername ?? key.remoteJidUsername
  const sender: SenderInfo = { jid, isMe: key.fromMe === true }
  if (typeof alt === 'string' && alt.length > 0) sender.lid = alt
  if (typeof username === 'string' && username.length > 0) sender.username = username
  if (typeof pushName === 'string' && pushName.length > 0) sender.pushName = pushName
  return sender
}

/** Resolve a quoted-message reference from a context info, or `null` when absent. */
export const extractQuoted = (
  contextInfo: WAContextInfo | null | undefined,
): QuotedRef | null => {
  if (!contextInfo) return null
  const stanzaId = contextInfo.stanzaId
  if (typeof stanzaId !== 'string' || stanzaId.length === 0) return null
  const participant = contextInfo.participant ?? undefined
  const remoteJid = contextInfo.remoteJid ?? participant ?? undefined
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
