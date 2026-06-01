import { jidDecode, jidNormalizedUser, type WAMessage, type WAMessageKey } from 'baileys'
import { Readable } from 'stream'
import { isGroupJid } from './decoders/_shared.js'
import type { SenderInfo } from './types.js'
import type { TextOptions } from '../builder/builder.js'

/** Discriminator over the decoded inbound message content type. */
export type ChatType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'unknown'

/** Resolved sender device derived from the JID device segment heuristic. */
export type SenderDevice = 'unknown' | 'android' | 'ios' | 'web' | 'desktop' | string

/** Per-client citation access-control configuration for authors and banned senders. */
export interface CitationConfig {
  authors?: string[] | ((jid: string) => boolean | Promise<boolean>)
  banned?: string[] | ((jid: string) => boolean | Promise<boolean>)
}

/** Resolved async predicates from {@link CitationConfig}; always present on a context. */
export interface CitationPredicates {
  authors(): Promise<boolean>
  banned(): Promise<boolean>
}

/** Lazy media accessor providing buffer and stream download on demand. */
export interface ContextMedia {
  buffer(): Promise<Buffer>
  stream(): Promise<Readable>
}

/**
 * Rich flat+lazy message context delivered to every inbound message event.
 * Eager fields are computed at decode time from the stanza; lazy accessors resolve
 * only when called (zero network until accessed).
 */
export interface MessageContext {
  uniqueId: string
  channelId: string
  chatId: string
  chatType: ChatType
  receiverId: string
  roomId: string | null
  senderId: string
  senderLid: string | null
  senderName: string | null
  senderDevice: SenderDevice
  timestamp: number
  text: string
  mentions: string[]
  links: string[]
  isFromMe: boolean
  isGroup: boolean
  isNewsletter: boolean
  isBroadcast: boolean
  isViewOnce: boolean
  isEphemeral: boolean
  isForwarded: boolean
  isQuestion: boolean
  isPrefix: boolean
  isTagMe: boolean
  /**
   * Defaults `false` at upsert time. The dedicated `edit` event is the source of truth
   * for edited messages; this flag is only meaningful when set by the edit decoder.
   */
  isEdited: boolean
  /**
   * Defaults `false` at upsert time. The dedicated `delete` event is the source of truth
   * for revoked messages; this flag is only meaningful when set by the delete decoder.
   */
  isDeleted: boolean
  /**
   * Defaults `false` at upsert time. The dedicated pin protocol-message event is the
   * source of truth for pinned messages.
   */
  isPinned: boolean
  /**
   * Defaults `false` at upsert time. The dedicated unpin protocol-message event is the
   * source of truth for unpinned messages.
   */
  isUnPinned: boolean
  /** Defaults `false` — no reliable signal from a single upsert stanza; deferred. */
  isBot: boolean
  /** Defaults `false` — opinionated/stateful classification; deferred. */
  isSpam: boolean
  /** Defaults `false` — hidden-mention detection deferred; best-effort in future plan. */
  isHideTags: boolean
  /** Defaults `false` — status@broadcast semantics deferred. */
  isStatusMention: boolean
  /** Defaults `false` — status@broadcast group semantics deferred. */
  isGroupStatusMention: boolean
  /** Defaults `false` — story-context detection deferred. */
  isStory: boolean
  roomName(): Promise<string | null>
  receiverName(): Promise<string | null>
  media?: ContextMedia
  replied(): Promise<MessageContext | null>
  message(): WAMessage
  citation: CitationPredicates
  /**
   * Reply to this message, quoting it. Plain text by default; pass `{ rich: true }`
   * to send the markdown body as an EXPERIMENTAL AIRich rich-response. Resolves with
   * the sent message key. Requires a connected client.
   */
  reply(content: string, opts?: TextOptions): Promise<WAMessageKey>
  /** React to this message with `emoji` (empty string removes the reaction). Requires a connected client. */
  react(emoji: string): Promise<WAMessageKey>
}

/**
 * Extends {@link MessageContext} with the mention-specific fields carried by the
 * `mention` event, when the connected account is explicitly mentioned.
 */
export interface MentionContext extends MessageContext {
  mentionedJids: string[]
  selfJid: string
}

/**
 * Extends {@link MessageContext} with the group-wide mention flag and optional
 * member list carried by the `mention-all` event.
 */
export interface MentionAllContext extends MessageContext {
  isMentionAll: true
  selfJid: string
  members?: string[]
}

/** Input bag carrying raw values and injected lazy resolvers for {@link buildMessageContext}. */
export interface BuildContextInput {
  message: WAMessage
  key: WAMessageKey
  channelId: string
  receiverId: string
  selfJid: string
  text: string
  chatType: ChatType
  sender: SenderInfo
  mentions: string[]
  isViewOnce: boolean
  isEphemeral: boolean
  isForwarded: boolean
  isBroadcast: boolean
  isNewsletter: boolean
  prefixes: string[]
  citationConfig?: CitationConfig
  resolveRoomName: () => Promise<string | null>
  resolveReceiverName: () => Promise<string | null>
  resolveReplied: () => Promise<MessageContext | null>
  reply: (content: string, opts?: TextOptions) => Promise<WAMessageKey>
  react: (emoji: string) => Promise<WAMessageKey>
  media?: ContextMedia
}

/**
 * Extract HTTP/HTTPS URLs from `text` using a linear, non-backtracking regex.
 * Trailing punctuation characters are stripped from each match.
 */
export const extractLinks = (text: string): string[] => {
  const matches = text.match(/(https?:\/\/[^\s]+)/g)
  if (!matches) return []
  return matches.map((url) => url.replace(/[.,;:!?]+$/, ''))
}

/**
 * Compute a deterministic, non-cryptographic FNV-1a 32-bit hash of the message key
 * fields and return it as a lowercase hex string. Uses no randomness or timestamps —
 * the same key always produces the same id.
 */
export const computeUniqueId = (key: WAMessageKey): string => {
  const input = `${key.remoteJid ?? ''}|${key.id ?? ''}|${key.fromMe === true ? '1' : '0'}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (Math.imul(hash, 0x01000193) >>> 0)
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Map a sender JID to the originating device using the `device` segment from
 * `jidDecode`. Mapping: `0` or `undefined` -> `'android'` (primary device),
 * `2` -> `'ios'`, `3` -> `'web'`, `4` -> `'desktop'`. Falls back to `'unknown'`
 * when `jidDecode` returns `undefined` or an unrecognized value.
 */
export const senderDeviceOf = (jid: string): SenderDevice => {
  const decoded = jidDecode(jid)
  if (!decoded) return 'unknown'
  const device = decoded.device
  if (device === undefined || device === 0) return 'android'
  if (device === 2) return 'ios'
  if (device === 3) return 'web'
  if (device === 4) return 'desktop'
  return 'unknown'
}

/** Returns `true` when the trimmed text ends with `?`. */
export const isQuestionOf = (text: string): boolean => text.trim().endsWith('?')

/** Returns `true` when any non-empty prefix in `prefixes` is a leading substring of `text`. */
export const isPrefixOf = (text: string, prefixes: string[]): boolean => {
  if (prefixes.length === 0) return false
  return prefixes.some((p) => p.length > 0 && text.startsWith(p))
}

/**
 * Returns `true` when `selfJid` (normalized) matches any mention in `mentions`.
 * Tolerates `jidNormalizedUser` decode errors by falling back to raw equality.
 */
export const isTagMeOf = (selfJid: string, mentions: string[]): boolean => {
  if (mentions.length === 0) return false
  let normalizedSelf: string
  try {
    normalizedSelf = jidNormalizedUser(selfJid)
  } catch {
    normalizedSelf = selfJid
  }
  return mentions.some((m) => {
    try {
      return jidNormalizedUser(m) === normalizedSelf
    } catch {
      return m === selfJid
    }
  })
}

/**
 * Build {@link CitationPredicates} from optional config. When config is absent both
 * predicates resolve `false` (deny-by-default). Array config uses `includes`; function
 * config is awaited and its thrown errors are propagated to the caller.
 */
export const makeCitation = (
  config: CitationConfig | undefined,
  senderJid: string,
): CitationPredicates => {
  const resolve = async (
    field: string[] | ((jid: string) => boolean | Promise<boolean>) | undefined,
  ): Promise<boolean> => {
    if (field === undefined) return false
    if (Array.isArray(field)) return field.includes(senderJid)
    return field(senderJid)
  }
  return {
    authors: () => resolve(config?.authors),
    banned: () => resolve(config?.banned),
  }
}

/**
 * Build a {@link MessageContext} from eagerly-derived input values and injected lazy
 * resolvers. This function is pure and I/O-free — all expensive work is delegated to
 * the injected `resolve*` callbacks.
 */
export const buildMessageContext = (input: BuildContextInput): MessageContext => {
  const remoteJid = typeof input.key.remoteJid === 'string' ? input.key.remoteJid : null
  const isGroup = remoteJid !== null && isGroupJid(remoteJid)

  const ctx: MessageContext = {
    uniqueId: computeUniqueId(input.key),
    channelId: input.channelId,
    chatId: input.key.id ?? '',
    chatType: input.chatType,
    receiverId: input.receiverId,
    roomId: isGroup ? remoteJid : null,
    senderId: input.sender.pn ?? input.sender.jid,
    senderLid: input.sender.lid ?? null,
    senderName: input.sender.pushName ?? null,
    senderDevice: senderDeviceOf(input.sender.jid),
    timestamp: typeof input.message.messageTimestamp === 'number'
      ? input.message.messageTimestamp * 1000
      : 0,
    text: input.text,
    mentions: input.mentions,
    links: extractLinks(input.text),
    isFromMe: input.key.fromMe === true,
    isGroup,
    isNewsletter: input.isNewsletter,
    isBroadcast: input.isBroadcast,
    isViewOnce: input.isViewOnce,
    isEphemeral: input.isEphemeral,
    isForwarded: input.isForwarded,
    isQuestion: isQuestionOf(input.text),
    isPrefix: isPrefixOf(input.text, input.prefixes),
    isTagMe: isTagMeOf(input.selfJid, input.mentions),
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    isUnPinned: false,
    isBot: false,
    isSpam: false,
    isHideTags: false,
    isStatusMention: false,
    isGroupStatusMention: false,
    isStory: false,
    roomName: input.resolveRoomName,
    receiverName: input.resolveReceiverName,
    replied: input.resolveReplied,
    reply: input.reply,
    react: input.react,
    message: () => input.message,
    citation: makeCitation(input.citationConfig, input.sender.pn ?? input.sender.jid),
  }

  if (input.media !== undefined) {
    ctx.media = input.media
  }

  return ctx
}
