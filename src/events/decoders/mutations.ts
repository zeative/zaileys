import { createHash } from 'node:crypto'
import { proto, type WAMessageKey } from 'baileys'
import type { CloudStatusEvent, CloudMessageStatus } from '../../cloud/translate/inbound.js'
import type { DeletePayload, EditPayload, PollVotePayload, ReactionPayload } from '../types.js'
import { extractJid, extractSender, safeNumber, type LongLike } from './_shared.js'

export interface MutationContext {
  selfJid: string
  pushName?: string
  /** Looks up the original poll so a vote's option hashes can be turned back into their text. */
  resolvePoll?: (id: string, remoteJid: string) => Promise<proto.IWebMessageInfo | null>
}

export interface ReactionItem {
  key: WAMessageKey
  reaction: proto.IReaction
}

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
  const rich = message.botForwardedMessage?.message?.richResponseMessage ?? message.richResponseMessage
  const submessages = rich?.submessages
  if (Array.isArray(submessages)) {
    const parts = submessages
      .map((s) => s?.messageText)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
    if (parts.length > 0) return parts.join('\n')
  }
  return ''
}

const toHex = (bytes: Uint8Array[] | null | undefined): string[] => {
  if (!Array.isArray(bytes)) return []
  return bytes.map((b) => Buffer.from(b).toString('hex'))
}

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

/** WhatsApp sends a vote as SHA-256 of each option's text, so hashing the poll's own options maps them back. */
const resolveOptionNames = async (
  pollKey: WAMessageKey,
  hashes: string[],
  ctx: MutationContext,
): Promise<string[]> => {
  if (hashes.length === 0 || ctx.resolvePoll == null) return []
  const id = pollKey.id
  const remoteJid = pollKey.remoteJid
  if (typeof id !== 'string' || typeof remoteJid !== 'string') return []
  const poll = await ctx.resolvePoll(id, remoteJid)
  const content = poll?.message
  const options =
    content?.pollCreationMessage?.options ??
    content?.pollCreationMessageV2?.options ??
    content?.pollCreationMessageV3?.options ??
    []
  const byHash = new Map<string, string>()
  for (const option of options) {
    const name = option?.optionName ?? ''
    byHash.set(createHash('sha256').update(Buffer.from(name)).digest('hex').toUpperCase(), name)
  }
  const out: string[] = []
  for (const hash of hashes) {
    const name = byHash.get(hash.toUpperCase())
    if (name !== undefined) out.push(name)
  }
  return out
}

export const decodePollVote = (update: MessageUpdate, ctx: MutationContext): PollVotePayload | null => {
  const fromUpdates = update?.update?.pollUpdates?.[0]
  const inner = update?.update?.message?.pollUpdateMessage
  const sender = extractSender(update?.key, ctx.pushName)
  if (sender === null) return null
  if (fromUpdates) {
    const pollKey = fromUpdates.pollUpdateMessageKey
    if (!pollKey) return null
    const hashes = toHex(fromUpdates.vote?.selectedOptions)
    return {
      pollKey,
      selectedOptions: hashes,
      voter: sender,
      timestamp: numberOr(fromUpdates.senderTimestampMs, numberOr(update.update.messageTimestamp, 0)),
      options: () => resolveOptionNames(pollKey, hashes, ctx),
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
      options: () => Promise.resolve([]),
    }
  }
  return null
}

/**
 * Maps Baileys' numeric ack to the same vocabulary the Cloud provider reports.
 *
 * Written as literals rather than `proto.WebMessageInfo.Status.*` on purpose:
 * touching `proto` while this module is being evaluated breaks every test that
 * mocks `baileys` without it. The numbers are pinned against the real enum in
 * `tests/events/decoders/mutations.test.ts`, so an upstream change fails loudly
 * instead of quietly shifting every status by one.
 *
 * `SERVER_ACK` (2) is *sent*, not delivered — the message reached WhatsApp and
 * nothing more. Reading it as delivered is the mistake that makes a screen
 * claim a message is on someone's phone when it is not.
 *
 * `PENDING` (1) is deliberately absent. It is not a receipt; it is the state a
 * message sits in before anyone has acknowledged anything, and emitting it as
 * one would make the timeline move backwards. `PLAYED` (5) maps to `read`: an
 * audio note that was listened to has certainly been read.
 */
const ACK_TO_STATUS: Partial<Record<number, CloudMessageStatus>> = {
  0: 'failed',
  2: 'sent',
  3: 'delivered',
  4: 'read',
  5: 'read',
}

/**
 * Decodes a delivery receipt for a message **we** sent.
 *
 * `messages.update` carries every kind of change, including ones about messages
 * other people sent. A receipt is only meaningful for our own outbound
 * messages, so anything without `fromMe` is not ours to report.
 *
 * The payload shape matches `CloudStatusEvent` on purpose: a consumer should
 * not need to know which transport a channel happens to use to learn whether
 * its message arrived.
 */
export const decodeReceipt = (update: MessageUpdate): CloudStatusEvent | null => {
  const key = update?.key
  if (!key || key.fromMe !== true) return null

  const ack = update.update?.status
  if (typeof ack !== 'number') return null

  const status = ACK_TO_STATUS[ack]
  if (status === undefined) return null

  const id = key.id
  if (typeof id !== 'string' || id.length === 0) return null

  return {
    id,
    status,
    recipientId: extractJid(key.remoteJid) ?? '',
    timestamp: numberOr(update.update?.messageTimestamp, 0),
  }
}
