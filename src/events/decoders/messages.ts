import { jidNormalizedUser, type WAContextInfo, type WAMessage, type WAMessageKey } from 'baileys'
import type { TextOptions } from '../../builder/builder.js'
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

export interface DecodeContext {
  selfJid: string
  logger?: DownloadLogger
  channelId?: string
  receiverId?: string
  prefixes?: string[]
  citationConfig?: CitationConfig
  resolveRoomName?: (roomId: string) => Promise<string | null>
  resolveReceiverName?: () => Promise<string | null>
  resolveQuoted?: (id: string, remoteJid: string) => Promise<WAMessage | null>
  reply?: (target: string, content: string, opts: TextOptions | undefined, quoted: WAMessage) => Promise<WAMessageKey>
  react?: (key: WAMessageKey, emoji: string) => Promise<WAMessageKey>
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

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value != null && typeof value === 'object' ? (value as Record<string, unknown>) : null

const nonEmptyString = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

const firstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = nonEmptyString(value)
    if (text != null) return text
  }
  return null
}

const WRAPPER_FIELDS = [
  'ephemeralMessage',
  'viewOnceMessage',
  'viewOnceMessageV2',
  'viewOnceMessageV2Extension',
  'documentWithCaptionMessage',
  'editedMessage',
] as const

const unwrap = (content: Record<string, unknown>): Record<string, unknown> => {
  let node = content
  for (let i = 0; i < 5; i++) {
    let next: Record<string, unknown> | null = null
    for (const field of WRAPPER_FIELDS) {
      const inner = asRecord(asRecord(node[field])?.['message'])
      if (inner != null) {
        next = inner
        break
      }
    }
    if (next == null) break
    node = next
  }
  return node
}

const richResponseText = (content: Record<string, unknown>): string | null => {
  const forwarded = asRecord(asRecord(asRecord(content['botForwardedMessage'])?.['message'])?.['richResponseMessage'])
  const rich = forwarded ?? asRecord(content['richResponseMessage'])
  if (rich == null) return null
  const submessages = rich['submessages']
  if (!Array.isArray(submessages)) return null
  const parts: string[] = []
  for (const sub of submessages) {
    const text = nonEmptyString(asRecord(sub)?.['messageText'])
    if (text != null) parts.push(text)
  }
  const joined = parts.join('\n').trim()
  return joined.length > 0 ? joined : null
}

const templateText = (content: Record<string, unknown>): string | null => {
  const tpl = asRecord(content['templateMessage'])
  const hydrated = asRecord(tpl?.['hydratedTemplate']) ?? asRecord(tpl?.['hydratedFourRowTemplate'])
  return nonEmptyString(hydrated?.['hydratedContentText'])
}

const pollText = (content: Record<string, unknown>): string | null =>
  firstString(
    asRecord(content['pollCreationMessage'])?.['name'],
    asRecord(content['pollCreationMessageV2'])?.['name'],
    asRecord(content['pollCreationMessageV3'])?.['name'],
  )

const locationText = (content: Record<string, unknown>): string | null => {
  const loc = asRecord(content['locationMessage']) ?? asRecord(content['liveLocationMessage'])
  if (loc == null) return null
  const labelled = firstString(loc['name'], loc['address'])
  if (labelled != null) {
    const name = nonEmptyString(loc['name'])
    const address = nonEmptyString(loc['address'])
    return name != null && address != null && name !== address ? `${name} — ${address}` : labelled
  }
  const lat = loc['degreesLatitude']
  const lng = loc['degreesLongitude']
  return typeof lat === 'number' && typeof lng === 'number' ? `${lat}, ${lng}` : null
}

const contactText = (content: Record<string, unknown>): string | null => {
  const single = nonEmptyString(asRecord(content['contactMessage'])?.['displayName'])
  if (single != null) return single
  const arr = asRecord(content['contactsArrayMessage'])
  const display = nonEmptyString(arr?.['displayName'])
  if (display != null) return display
  const contacts = arr?.['contacts']
  if (Array.isArray(contacts)) {
    const names = contacts
      .map((c) => nonEmptyString(asRecord(c)?.['displayName']))
      .filter((n): n is string => n != null)
    if (names.length > 0) return names.join(', ')
  }
  return null
}

const bodyText = (content: Record<string, unknown>): string | null =>
  firstString(
    content['conversation'],
    asRecord(content['extendedTextMessage'])?.['text'],
    richResponseText(content),
    nonEmptyString(asRecord(asRecord(content['interactiveMessage'])?.['body'])?.['text']),
    asRecord(content['buttonsMessage'])?.['contentText'],
    asRecord(content['listMessage'])?.['description'],
    templateText(content),
    pollText(content),
    locationText(content),
    contactText(content),
  )

const mediaCaptionText = (content: Record<string, unknown>): string | null =>
  firstString(
    asRecord(content['imageMessage'])?.['caption'],
    asRecord(content['videoMessage'])?.['caption'],
    asRecord(content['documentMessage'])?.['caption'],
    asRecord(content['documentMessage'])?.['fileName'],
  )

const mainText = (msg: WAMessage): string | null => {
  const content = asRecord(msg.message)
  return content == null ? null : bodyText(unwrap(content))
}

const anyText = (msg: WAMessage): string | null => {
  const content = asRecord(msg.message)
  if (content == null) return null
  const inner = unwrap(content)
  return bodyText(inner) ?? mediaCaptionText(inner)
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

const chatTypeOf = (content: WAMessage['message']): ChatType => {
  if (content == null) return 'text'
  for (const field of Object.values(MEDIA_FIELD)) {
    if ((content as Record<string, unknown>)[field] != null) {
      return field.replace('Message', '') as ChatType
    }
  }
  return 'text'
}

const decodeQuotedContext = async (
  contextInfo: WAContextInfo | null,
  ctx: DecodeContext,
  parentRemoteJid: string,
): Promise<MessageContext | null> => {
  try {
    if (contextInfo == null) return null
    if (contextInfo.quotedMessage == null) return null
    const stanzaId = contextInfo.stanzaId
    if (typeof stanzaId !== 'string' || stanzaId.length === 0) return null

    if (ctx.resolveQuoted != null && parentRemoteJid.length > 0) {
      const original = await ctx.resolveQuoted(stanzaId, parentRemoteJid)
      if (original != null && original.message != null) {
        const originalText = anyText(original) ?? ''
        const fromStore = buildContext(original, ctx, chatTypeOf(original.message), originalText)
        if (fromStore !== null) return fromStore
      }
    }

    const quoted = extractQuoted(contextInfo)
    if (quoted === null) return null
    if (typeof quoted.key.id !== 'string' || quoted.key.id.length === 0) return null
    const remoteJid = quoted.key.remoteJid
    if (typeof remoteJid !== 'string' || remoteJid.length === 0) return null
    const participant = quoted.key.participant
    if (
      typeof participant === 'string' &&
      ctx.selfJid.length > 0 &&
      jidNormalizedUser(participant) === jidNormalizedUser(ctx.selfJid)
    ) {
      quoted.key.fromMe = true
    }
    const qm = contextInfo.quotedMessage as WAMessage['message']
    const reconstructed = Object.assign(
      { key: quoted.key, message: qm ?? null },
      quoted.sender?.pushName != null ? { pushName: quoted.sender.pushName } : {},
    ) as WAMessage
    const text = anyText(reconstructed) ?? ''
    return buildContext(reconstructed, ctx, chatTypeOf(qm), text)
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
    decodeQuotedContext(contextInfo, ctx, jid)

  const replyTarget = jid.length > 0 ? jid : (sender.pn ?? sender.jid)
  const reply = (content: string, opts?: TextOptions): Promise<WAMessageKey> => {
    if (ctx.reply == null) {
      return Promise.reject(new Error('zaileys: ctx.reply() requires a connected client'))
    }
    return ctx.reply(replyTarget, content, opts, msg)
  }
  const react = (emoji: string): Promise<WAMessageKey> => {
    if (ctx.react == null) {
      return Promise.reject(new Error('zaileys: ctx.react() requires a connected client'))
    }
    return ctx.react(key, emoji)
  }

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
    reply,
    react,
  }
  const withMedia = media !== undefined ? { ...baseInput, media } : baseInput
  return buildMessageContext(
    ctx.citationConfig !== undefined
      ? { ...withMedia, citationConfig: ctx.citationConfig }
      : withMedia,
  )
}

export const decodeText = (msg: WAMessage, ctx: DecodeContext): MessageContext | null => {
  const content = mainText(msg)
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

export const decodeImage = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('image', msg, ctx)

export const decodeVideo = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('video', msg, ctx)

export const decodeAudio = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('audio', msg, ctx)

export const decodeDocument = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('document', msg, ctx)

export const decodeSticker = (msg: WAMessage, ctx: DecodeContext): MessageContext | null =>
  decodeMedia('sticker', msg, ctx)

const normalizedEquals = (a: string, b: string): boolean => {
  try {
    return jidNormalizedUser(a) === jidNormalizedUser(b)
  } catch {
    return a === b
  }
}

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
  const text = anyText(msg) ?? ''
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

export const decodeMentionAll = (msg: WAMessage, ctx: DecodeContext): MentionAllContext | null => {
  const key = msg.key
  if (key == null) return null
  const jid = resolveJid(key)
  if (jid.length === 0 || !isGroupJid(jid)) return null
  const { mentionAll } = extractMentions(contextInfoOf(msg))
  if (!mentionAll) return null
  const content = msg.message
  if (content == null) return null
  const text = anyText(msg) ?? ''
  const base = buildContext(msg, ctx, 'text', text)
  if (base === null) return null
  return { ...base, isMentionAll: true, selfJid: ctx.selfJid }
}
