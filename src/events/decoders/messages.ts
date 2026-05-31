import { jidNormalizedUser, type WAContextInfo, type WAMessage } from 'baileys'
import {
  buildMessageContext,
  type ChatType,
  type CitationConfig,
  type ContextMedia,
  type MentionAllContext,
  type MentionContext,
  type MessageContext,
} from '../context.js'
import type { MediaKind } from '../types.js'
import { createDownloadFn, createStreamFn, type DownloadLogger } from './_media-download.js'
import {
  extractMentions,
  extractQuoted,
  extractSender,
  isGroupJid,
} from './_shared.js'

/** Decode context passed to every message decoder. */
export interface DecodeContext {
  selfJid: string
  logger?: DownloadLogger
  channelId?: string
  receiverId?: string
  prefixes?: string[]
  citationConfig?: CitationConfig
  resolveRoomName?: (roomId: string) => Promise<string | null>
  resolveReceiverName?: () => Promise<string | null>
}

interface MediaNode {
  mimetype?: string | null
  fileLength?: number | { toNumber(): number; low: number; high: number } | null
  caption?: string | null
  fileName?: string | null
  ptt?: boolean | null
  contextInfo?: WAContextInfo | null
}

const MEDIA_FIELD: Record<MediaKind, string> = {
  image: 'imageMessage',
  video: 'videoMessage',
  audio: 'audioMessage',
  document: 'documentMessage',
  sticker: 'stickerMessage',
}

const resolveJid = (key: WAMessage['key'] | undefined): string => {
  const remote = key?.remoteJid
  return typeof remote === 'string' && remote.length > 0 ? remote : ''
}

const textContent = (msg: WAMessage): string | null => {
  const content = msg.message
  if (content == null) return null
  if (typeof content.conversation === 'string' && content.conversation.length > 0) {
    return content.conversation
  }
  const ext = content.extendedTextMessage
  if (ext != null && typeof ext.text === 'string' && ext.text.length > 0) return ext.text
  return null
}

const contextInfoOf = (msg: WAMessage): WAContextInfo | null => {
  const content = msg.message
  if (content == null) return null
  const ext = content.extendedTextMessage?.contextInfo
  if (ext != null) return ext
  for (const field of Object.values(MEDIA_FIELD)) {
    const node = (content as Record<string, unknown>)[field]
    if (node != null && typeof node === 'object') {
      const ci = (node as { contextInfo?: WAContextInfo | null }).contextInfo
      if (ci != null) return ci
    }
  }
  return null
}

const mediaNodeOf = (msg: WAMessage, kind: MediaKind): MediaNode | null => {
  const content = msg.message
  if (content == null) return null
  const node = (content as Record<string, unknown>)[MEDIA_FIELD[kind]]
  if (node == null || typeof node !== 'object') return null
  return node as MediaNode
}

const isViewOnceOf = (msg: WAMessage): boolean => {
  const content = msg.message
  if (content == null) return false
  if (content.viewOnceMessage != null) return true
  if (content.viewOnceMessageV2 != null) return true
  if (content.viewOnceMessageV2Extension != null) return true
  for (const field of Object.values(MEDIA_FIELD)) {
    const node = (content as Record<string, unknown>)[field]
    if (node != null && typeof node === 'object') {
      const vo = (node as { viewOnce?: boolean | null }).viewOnce
      if (vo === true) return true
    }
  }
  return false
}

const isEphemeralOf = (msg: WAMessage, contextInfo: WAContextInfo | null): boolean => {
  if (msg.message?.ephemeralMessage != null) return true
  return typeof contextInfo?.expiration === 'number' && contextInfo.expiration > 0
}

const decodeQuotedContext = async (
  contextInfo: WAContextInfo | null,
  ctx: DecodeContext,
): Promise<MessageContext | null> => {
  try {
    if (contextInfo == null) return null
    if (contextInfo.quotedMessage == null) return null
    const stanzaId = contextInfo.stanzaId
    if (typeof stanzaId !== 'string' || stanzaId.length === 0) return null
    const quoted = extractQuoted(contextInfo)
    if (quoted === null) return null
    if (typeof quoted.key.id !== 'string' || quoted.key.id.length === 0) return null
    const remoteJid = quoted.key.remoteJid
    if (typeof remoteJid !== 'string' || remoteJid.length === 0) return null
    const qm = contextInfo.quotedMessage as WAMessage['message']
    const reconstructed = Object.assign(
      { key: quoted.key, message: qm ?? null },
      quoted.sender?.pushName != null ? { pushName: quoted.sender.pushName } : {},
    ) as WAMessage
    const content = contextInfo.quotedMessage
    let chatType: ChatType = 'text'
    if (content != null) {
      const fields = Object.values(MEDIA_FIELD)
      for (const f of fields) {
        if ((content as Record<string, unknown>)[f] != null) {
          chatType = f.replace('Message', '') as ChatType
          break
        }
      }
    }
    const text = textContent(reconstructed) ?? ''
    return buildContext(reconstructed, ctx, chatType, text)
  } catch {
    return null
  }
}

const buildContext = (
  msg: WAMessage,
  ctx: DecodeContext,
  chatType: ChatType,
  text: string,
  media?: ContextMedia,
): MessageContext | null => {
  const key = msg.key
  if (key == null) return null
  const sender = extractSender(key, msg.pushName ?? undefined)
  if (sender === null) return null
  const jid = resolveJid(key)
  if (jid.length === 0) return null

  const contextInfo = contextInfoOf(msg)
  const isGroup = isGroupJid(jid)
  const isBroadcast = jid.endsWith('@broadcast')
  const isNewsletter = jid.endsWith('@newsletter')
  const isForwarded =
    contextInfo?.isForwarded === true || (contextInfo?.forwardingScore ?? 0) > 0
  const isViewOnce = isViewOnceOf(msg)
  const isEphemeral = isEphemeralOf(msg, contextInfo)

  const channelId = ctx.channelId ?? ''
  const receiverId = ctx.receiverId ?? ''
  const prefixes = ctx.prefixes ?? []

  const resolveRoomName = (): Promise<string | null> =>
    isGroup && ctx.resolveRoomName != null
      ? ctx.resolveRoomName(jid)
      : Promise.resolve(null)

  const resolveReceiverName: () => Promise<string | null> =
    ctx.resolveReceiverName ?? (() => Promise.resolve(null))

  const resolveReplied = (): Promise<MessageContext | null> =>
    decodeQuotedContext(contextInfo, ctx)

  const { mentionedJids } = extractMentions(contextInfo)

  const baseInput = {
    message: msg,
    key,
    channelId,
    receiverId,
    selfJid: ctx.selfJid,
    text,
    chatType,
    sender,
    mentions: mentionedJids,
    isViewOnce,
    isEphemeral,
    isForwarded,
    isBroadcast,
    isNewsletter,
    prefixes,
    resolveRoomName,
    resolveReceiverName,
    resolveReplied,
  }
  const withMedia = media !== undefined ? { ...baseInput, media } : baseInput
  return buildMessageContext(
    ctx.citationConfig !== undefined
      ? { ...withMedia, citationConfig: ctx.citationConfig }
      : withMedia,
  )
}

/** Decode a plain or extended text message into a {@link MessageContext}. */
export const decodeText = (msg: WAMessage, ctx: DecodeContext): MessageContext | null => {
  const content = textContent(msg)
  if (content === null) return null
  return buildContext(msg, ctx, 'text', content)
}

const decodeMedia = <K extends MediaKind>(
  kind: K,
  msg: WAMessage,
  ctx: DecodeContext,
): MessageContext | null => {
  const node = mediaNodeOf(msg, kind)
  if (node === null) return null
  const caption = typeof node.caption === 'string' ? node.caption : ''
  const chatType = kind as ChatType

  const bufferFn = createDownloadFn(msg, kind, ctx.logger)
  const streamFn = createStreamFn(msg, kind, ctx.logger)
  const media: ContextMedia = {
    buffer: async () => {
      const result = await bufferFn()
      return result.buffer
    },
    stream: streamFn,
  }

  return buildContext(msg, ctx, chatType, caption, media)
}

/** Decode an image message into a {@link MessageContext} with lazy media accessor. */
export const decodeImage = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('image', msg, ctx)

/** Decode a video message into a {@link MessageContext} with lazy media accessor. */
export const decodeVideo = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('video', msg, ctx)

/** Decode an audio message, surfacing lazy media with push-to-talk context via media node. */
export const decodeAudio = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('audio', msg, ctx)

/** Decode a document message with lazy media accessor. */
export const decodeDocument = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('document', msg, ctx)

/** Decode a sticker message into a {@link MessageContext} with lazy media accessor. */
export const decodeSticker = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('sticker', msg, ctx)

const normalizedEquals = (a: string, b: string): boolean => {
  try {
    return jidNormalizedUser(a) === jidNormalizedUser(b)
  } catch {
    return a === b
  }
}

/** Decode a mention event when the connected account appears in `mentionedJid`. */
export const decodeMention = (msg: WAMessage, ctx: DecodeContext): MentionContext | null => {
  const key = msg.key
  if (key == null) return null
  const contextInfo = contextInfoOf(msg)
  const { mentionedJids } = extractMentions(contextInfo)
  if (mentionedJids.length === 0) return null
  const hasSelf = mentionedJids.some((jid) => normalizedEquals(jid, ctx.selfJid))
  if (!hasSelf) return null
  const content = msg.message
  if (content == null) return null
  const text = textContent(msg) ?? ''
  let chatType: ChatType = 'text'
  if (content != null) {
    const fields = Object.values(MEDIA_FIELD)
    for (const f of fields) {
      if ((content as Record<string, unknown>)[f] != null) {
        chatType = f.replace('Message', '') as ChatType
        break
      }
    }
  }
  const base = buildContext(msg, ctx, chatType, text)
  if (base === null) return null
  return { ...base, mentionedJids, selfJid: ctx.selfJid }
}

/** Decode a group-wide (`@everyone`) mention event scoped to group chats. */
export const decodeMentionAll = (msg: WAMessage, ctx: DecodeContext): MentionAllContext | null => {
  const key = msg.key
  if (key == null) return null
  const jid = resolveJid(key)
  if (jid.length === 0 || !isGroupJid(jid)) return null
  const { mentionAll } = extractMentions(contextInfoOf(msg))
  if (!mentionAll) return null
  const content = msg.message
  if (content == null) return null
  const text = textContent(msg) ?? ''
  const base = buildContext(msg, ctx, 'text', text)
  if (base === null) return null
  return { ...base, isMentionAll: true, selfJid: ctx.selfJid }
}
