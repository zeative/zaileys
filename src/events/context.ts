import { jidDecode, jidNormalizedUser, type WAMessage, type WAMessageKey } from 'baileys'
import { Readable } from 'node:stream'
import { isGroupJid } from './decoders/_shared.js'
import type { SenderInfo } from './types.js'
import type { TextOptions } from '../builder/builder.js'

export type ChatType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'poll'
  | 'contact'
  | 'location'
  | 'live-location'
  | 'event'
  | 'buttons'
  | 'list'
  | 'interactive'
  | 'template'
  | 'unknown'

export type SenderDevice = 'unknown' | 'android' | 'ios' | 'web' | 'desktop' | string

export interface CitationConfig {
  authors?: string[] | ((jid: string) => boolean | Promise<boolean>)
  banned?: string[] | ((jid: string) => boolean | Promise<boolean>)
}

export interface CitationPredicates {
  authors(): Promise<boolean>
  banned(): Promise<boolean>
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  mimetype: string | null
  caption: string | null
  fileName: string | null
  fileSize: number | null
  ptt: boolean
  buffer(): Promise<Buffer>
  stream(): Promise<Readable>
}

export interface PollMedia {
  type: 'poll'
  name: string | null
  options: string[]
  selectableCount: number
}

export interface ContactCard {
  displayName: string | null
  vcard: string | null
}

export interface ContactMedia {
  type: 'contact'
  displayName: string | null
  vcard: string | null
  contacts: ContactCard[]
}

export interface LocationMedia {
  type: 'location' | 'live-location'
  latitude: number | null
  longitude: number | null
  name: string | null
  address: string | null
  accuracy: number | null
  speed: number | null
  caption: string | null
}

export interface EventMedia {
  type: 'event'
  name: string | null
  description: string | null
  location: string | null
  startTime: number | null
  endTime: number | null
  isCanceled: boolean
}

export interface MessageButton {
  id: string | null
  text: string | null
}

export interface ButtonsMedia {
  type: 'buttons'
  contentText: string | null
  footerText: string | null
  buttons: MessageButton[]
}

export interface ListRow {
  id: string | null
  title: string | null
  description: string | null
}

export interface ListSection {
  title: string | null
  rows: ListRow[]
}

export interface ListMedia {
  type: 'list'
  title: string | null
  description: string | null
  buttonText: string | null
  sections: ListSection[]
}

export interface InteractiveMedia {
  type: 'interactive'
  title: string | null
  body: string | null
  footer: string | null
  buttons: Array<{ name: string | null; params: string | null }>
}

export interface TemplateMedia {
  type: 'template'
  text: string | null
  buttons: MessageButton[]
}

export type ContextMedia =
  | MediaAttachment
  | PollMedia
  | ContactMedia
  | LocationMedia
  | EventMedia
  | ButtonsMedia
  | ListMedia
  | InteractiveMedia
  | TemplateMedia

export interface MessageContext {
  uniqueId: string
  staticId: string
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
  isEdited: boolean
  isDeleted: boolean
  isPinned: boolean
  isUnPinned: boolean
  isBot: boolean
  isSpam: boolean
  isHideTags: boolean
  isStatusMention: boolean
  isGroupStatusMention: boolean
  isStory: boolean
  roomName(): Promise<string | null>
  receiverName(): Promise<string | null>
  media?: ContextMedia
  replied(): Promise<MessageContext | null>
  message(): WAMessage
  citation: CitationPredicates
  reply(content: string, opts?: TextOptions): Promise<WAMessageKey>
  react(emoji: string): Promise<WAMessageKey>
}

export interface MentionContext extends MessageContext {
  mentionedJids: string[]
  selfJid: string
}

export interface MentionAllContext extends MessageContext {
  isMentionAll: true
  selfJid: string
  members?: string[]
}

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

export const extractLinks = (text: string): string[] => {
  const matches = text.match(/(https?:\/\/[^\s]+)/g)
  if (!matches) return []
  return matches.map((url) => url.replace(/[.,;:!?]+$/, ''))
}

const fnv1a = (input: string, seed = 0x811c9dc5): number => {
  let hash = seed >>> 0
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

const hashHex = (input: string): string =>
  (fnv1a(input).toString(16).padStart(8, '0') + fnv1a(input, 0x9dc5811c).toString(16).padStart(8, '0')).toUpperCase()

export const computeUniqueId = (key: WAMessageKey): string =>
  hashHex(`${key.remoteJid ?? ''}|${key.id ?? ''}|${key.fromMe === true ? '1' : '0'}`)

export const computeStaticId = (roomId: string | null, senderId: string): string =>
  hashHex(`${roomId ?? ''}|${senderId}`)

export const epochSecondsToMs = (value: unknown): number => {
  let secs: number | null = null
  if (typeof value === 'number') secs = value
  else if (typeof value === 'bigint') secs = Number(value)
  else if (typeof value === 'string') {
    const n = Number.parseInt(value, 10)
    secs = Number.isFinite(n) ? n : null
  } else if (value != null && typeof value === 'object') {
    const o = value as { toNumber?: () => number; low?: number; high?: number }
    if (typeof o.toNumber === 'function') secs = o.toNumber()
    else if (typeof o.low === 'number') secs = (typeof o.high === 'number' ? o.high : 0) * 4294967296 + (o.low >>> 0)
  }
  return secs != null && Number.isFinite(secs) && secs > 0 ? secs * 1000 : 0
}

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

export const isQuestionOf = (text: string): boolean => text.trim().endsWith('?')

export const isPrefixOf = (text: string, prefixes: string[]): boolean => {
  if (prefixes.length === 0) return false
  return prefixes.some((p) => p.length > 0 && text.startsWith(p))
}

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

export const buildMessageContext = (input: BuildContextInput): MessageContext => {
  const remoteJid = typeof input.key.remoteJid === 'string' ? input.key.remoteJid : null
  const isGroup = remoteJid !== null && isGroupJid(remoteJid)
  const senderId = input.sender.pn ?? input.sender.jid
  const roomId = isGroup
    ? (remoteJid ? jidNormalizedUser(remoteJid) : null)
    : input.key.fromMe === true && remoteJid
      ? jidNormalizedUser(remoteJid)
      : senderId

  const ctx: MessageContext = {
    uniqueId: computeUniqueId(input.key),
    staticId: computeStaticId(roomId, senderId),
    channelId: input.channelId,
    chatId: input.key.id ?? '',
    chatType: input.chatType,
    receiverId: input.receiverId ? jidNormalizedUser(input.receiverId) : input.receiverId,
    roomId,
    senderId,
    senderLid: input.sender.lid ?? null,
    senderName: input.sender.pushName ?? null,
    senderDevice: senderDeviceOf(input.sender.deviceJid ?? input.sender.jid),
    timestamp: epochSecondsToMs(input.message.messageTimestamp),
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
