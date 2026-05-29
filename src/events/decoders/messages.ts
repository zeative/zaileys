import { jidNormalizedUser, type WAContextInfo, type WAMessage, type WAMessageKey } from 'baileys'
import type {
  MediaDescriptor,
  MediaKind,
  MediaPayload,
  MentionAllPayload,
  MentionPayload,
  MessagePayload,
} from '../types.js'
import { createDownloadFn, type DownloadLogger } from './_media-download.js'
import {
  extractMentions,
  extractQuoted,
  extractSender,
  isGroupJid,
  safeNumber,
} from './_shared.js'

/** Decode context passed to every message decoder. */
export interface DecodeContext {
  selfJid: string
  logger?: DownloadLogger
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

const resolveJid = (key: WAMessageKey | undefined): string => {
  const remote = key?.remoteJid
  return typeof remote === 'string' && remote.length > 0 ? remote : ''
}

const timestampOf = (msg: WAMessage): number => {
  const ts = safeNumber(msg.messageTimestamp ?? null)
  return ts === null ? 0 : ts * 1000
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
  const ext = msg.message?.extendedTextMessage
  return ext?.contextInfo ?? null
}

const basePayload = (msg: WAMessage, content: string): MessagePayload | null => {
  const key = msg.key
  if (key == null) return null
  const sender = extractSender(key, msg.pushName ?? undefined)
  if (sender === null) return null
  const jid = resolveJid(key)
  if (jid.length === 0) return null
  const payload: MessagePayload = {
    jid,
    content,
    fromMe: key.fromMe === true,
    isGroup: isGroupJid(jid),
    sender,
    timestamp: timestampOf(msg),
  }
  const quoted = extractQuoted(contextInfoOf(msg))
  if (quoted !== null) payload.quoted = quoted
  return payload
}

/** Decode a plain or extended text message into a {@link MessagePayload}. */
export const decodeText = (msg: WAMessage, _ctx: DecodeContext): MessagePayload | null => {
  const content = textContent(msg)
  if (content === null) return null
  return basePayload(msg, content)
}

const mediaNodeOf = (msg: WAMessage, kind: MediaKind): MediaNode | null => {
  const content = msg.message
  if (content == null) return null
  const node = (content as Record<string, unknown>)[MEDIA_FIELD[kind]]
  if (node == null || typeof node !== 'object') return null
  return node as MediaNode
}

const decodeMedia = <K extends MediaKind>(
  kind: K,
  msg: WAMessage,
  ctx: DecodeContext,
): MediaPayload<K> | null => {
  const node = mediaNodeOf(msg, kind)
  if (node === null) return null
  const caption = typeof node.caption === 'string' ? node.caption : undefined
  const base = basePayload(msg, caption ?? '')
  if (base === null) return null
  const descriptor: MediaDescriptor = {
    mimetype: typeof node.mimetype === 'string' && node.mimetype.length > 0 ? node.mimetype : 'application/octet-stream',
  }
  const size = safeNumber(node.fileLength ?? null)
  if (size !== null) descriptor.size = size
  if (caption !== undefined) descriptor.caption = caption
  if (kind === 'document' && typeof node.fileName === 'string') descriptor.fileName = node.fileName
  if (kind === 'audio') descriptor.ptt = node.ptt === true
  return {
    ...base,
    kind,
    media: descriptor,
    download: createDownloadFn(msg, kind, ctx.logger),
  }
}

/** Decode an image message into a downloadable {@link MediaPayload}. */
export const decodeImage = (msg: WAMessage, ctx: DecodeContext): MediaPayload<'image'> | null =>
  decodeMedia('image', msg, ctx)

/** Decode a video message into a downloadable {@link MediaPayload}. */
export const decodeVideo = (msg: WAMessage, ctx: DecodeContext): MediaPayload<'video'> | null =>
  decodeMedia('video', msg, ctx)

/** Decode an audio message, surfacing the `ptt` push-to-talk flag. */
export const decodeAudio = (msg: WAMessage, ctx: DecodeContext): MediaPayload<'audio'> | null =>
  decodeMedia('audio', msg, ctx)

/** Decode a document message, surfacing the original `fileName`. */
export const decodeDocument = (msg: WAMessage, ctx: DecodeContext): MediaPayload<'document'> | null =>
  decodeMedia('document', msg, ctx)

/** Decode a sticker message into a downloadable {@link MediaPayload}. */
export const decodeSticker = (msg: WAMessage, ctx: DecodeContext): MediaPayload<'sticker'> | null =>
  decodeMedia('sticker', msg, ctx)

const normalizedEquals = (a: string, b: string): boolean => {
  try {
    return jidNormalizedUser(a) === jidNormalizedUser(b)
  } catch {
    return a === b
  }
}

/** Decode a mention event when the connected account appears in `mentionedJid`. */
export const decodeMention = (msg: WAMessage, ctx: DecodeContext): MentionPayload | null => {
  const key = msg.key
  if (key == null) return null
  const contextInfo = contextInfoOf(msg)
  const { mentionedJids } = extractMentions(contextInfo)
  if (mentionedJids.length === 0) return null
  const hasSelf = mentionedJids.some((jid) => normalizedEquals(jid, ctx.selfJid))
  if (!hasSelf) return null
  const sender = extractSender(key, msg.pushName ?? undefined)
  if (sender === null) return null
  const jid = resolveJid(key)
  if (jid.length === 0) return null
  return {
    key,
    jid,
    mentionedJids,
    selfJid: ctx.selfJid,
    content: textContent(msg) ?? '',
    sender,
    timestamp: timestampOf(msg),
  }
}

/** Decode a group-wide (`@everyone`) mention event scoped to group chats. */
export const decodeMentionAll = (msg: WAMessage, ctx: DecodeContext): MentionAllPayload | null => {
  const key = msg.key
  if (key == null) return null
  const jid = resolveJid(key)
  if (jid.length === 0 || !isGroupJid(jid)) return null
  const { mentionAll } = extractMentions(contextInfoOf(msg))
  if (!mentionAll) return null
  const sender = extractSender(key, msg.pushName ?? undefined)
  if (sender === null) return null
  return {
    key,
    jid,
    isMentionAll: true,
    selfJid: ctx.selfJid,
    content: textContent(msg) ?? '',
    sender,
    timestamp: timestampOf(msg),
  }
}
