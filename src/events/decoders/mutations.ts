import { proto, type WAMessageKey } from 'baileys'
import type { DeletePayload, EditPayload, PollVotePayload, ReactionPayload } from '../types.js'
import { extractJid, extractSender, safeNumber, type LongLike } from './_shared.js'

/** Ambient context every mutation decoder needs to resolve identity and scope. */
export interface MutationContext {
  selfJid: string
  pushName?: string
}

/** Single entry of a baileys `messages.reaction` event batch. */
export interface ReactionItem {
  key: WAMessageKey
  reaction: proto.IReaction
}

/** A baileys `messages.update` entry: a partial message body keyed to its target. */
export interface MessageUpdate {
  key: WAMessageKey
  update: {
    message?: proto.IMessage | null
    messageTimestamp?: number | LongLike | null
    pollUpdates?: proto.IPollUpdate[] | null
    status?: number | null
  }
}

const numberOr = (value: number | LongLike | null | undefined, fallback: number): number => {
  const n = safeNumber(value)
  return n === null ? fallback : n
}

const textOf = (message: proto.IMessage | null | undefined): string => {
  if (!message) return ''
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage?.text
  if (typeof ext === 'string') return ext
  const imgCaption = message.imageMessage?.caption
  if (typeof imgCaption === 'string') return imgCaption
  const vidCaption = message.videoMessage?.caption
  if (typeof vidCaption === 'string') return vidCaption
  const docCaption = message.documentMessage?.caption
  if (typeof docCaption === 'string') return docCaption
  return ''
}

const toHex = (bytes: Uint8Array[] | null | undefined): string[] => {
  if (!Array.isArray(bytes)) return []
  return bytes.map((b) => Buffer.from(b).toString('hex'))
}

/**
 * Decode a single `messages.reaction` item into a {@link ReactionPayload}.
 * An empty reaction text denotes an unreact and is normalized to a `null` emoji.
 * Returns `null` when the targeted message key is missing.
 */
export const decodeReaction = (item: ReactionItem, ctx: MutationContext): ReactionPayload | null => {
  const reaction = item?.reaction
  const target = reaction?.key
  if (!target) return null
  const sender = extractSender(item.key, ctx.pushName)
  if (sender === null) return null
  const text = reaction.text
  const emoji = typeof text === 'string' && text.length > 0 ? text : null
  return {
    key: target,
    emoji,
    sender,
    timestamp: numberOr(reaction.senderTimestampMs, 0),
  }
}

/**
 * Decode a `messages.update` carrying a `MESSAGE_EDIT` protocol message into an
 * {@link EditPayload}. Returns `null` when the update is not an edit or the
 * original message key is absent.
 */
export const decodeEdit = (update: MessageUpdate, ctx: MutationContext): EditPayload | null => {
  const protocol = update?.update?.message?.protocolMessage
  if (!protocol) return null
  if (protocol.type !== proto.Message.ProtocolMessage.Type.MESSAGE_EDIT) return null
  const original = protocol.key
  if (!original) return null
  const sender = extractSender(update.key, ctx.pushName)
  if (sender === null) return null
  return {
    key: original,
    newContent: textOf(protocol.editedMessage),
    editedAt: numberOr(update.update.messageTimestamp, 0),
    sender,
  }
}

/**
 * Decode a `messages.update` carrying a `REVOKE` protocol message into a
 * {@link DeletePayload}. The deletion scope is `'me'` only when the revoke lands
 * in the user's self-chat; every other revoke is treated as `'everyone'`.
 * Returns `null` when the update is not a revoke or the revoked key is absent.
 */
export const decodeDelete = (update: MessageUpdate, ctx: MutationContext): DeletePayload | null => {
  const protocol = update?.update?.message?.protocolMessage
  if (!protocol) return null
  if (protocol.type !== proto.Message.ProtocolMessage.Type.REVOKE) return null
  const revoked = protocol.key
  if (!revoked) return null
  const sender = extractSender(update.key, ctx.pushName)
  if (sender === null) return null
  const remoteJid = extractJid(update.key.remoteJid)
  const self = extractJid(ctx.selfJid)
  const deletedFor: DeletePayload['deletedFor'] =
    remoteJid !== null && self !== null && remoteJid === self ? 'me' : 'everyone'
  return {
    key: revoked,
    deletedFor,
    sender,
    timestamp: numberOr(update.update.messageTimestamp, 0),
  }
}

/**
 * Decode a poll vote from either a top-level `pollUpdates` entry or an inner
 * `pollUpdateMessage` on a `messages.update`. Selected options are returned as
 * raw hex-encoded SHA-256 hashes; resolving them to human-readable option text
 * requires the original poll metadata and is deferred to the message store.
 * Returns `null` when no poll update is present or the poll key is absent.
 */
export const decodePollVote = (update: MessageUpdate, ctx: MutationContext): PollVotePayload | null => {
  const fromUpdates = update?.update?.pollUpdates?.[0]
  const inner = update?.update?.message?.pollUpdateMessage
  const sender = extractSender(update?.key, ctx.pushName)
  if (sender === null) return null
  if (fromUpdates) {
    const pollKey = fromUpdates.pollUpdateMessageKey
    if (!pollKey) return null
    return {
      pollKey,
      selectedOptions: toHex(fromUpdates.vote?.selectedOptions),
      voter: sender,
      timestamp: numberOr(fromUpdates.senderTimestampMs, numberOr(update.update.messageTimestamp, 0)),
    }
  }
  if (inner) {
    const pollKey = inner.pollCreationMessageKey
    if (!pollKey) return null
    return {
      pollKey,
      selectedOptions: [],
      voter: sender,
      timestamp: numberOr(inner.senderTimestampMs, numberOr(update.update.messageTimestamp, 0)),
    }
  }
  return null
}
