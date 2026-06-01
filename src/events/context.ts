import { jidDecode, jidNormalizedUser, type WAMessage, type WAMessageKey } from 'baileys'
import { Readable } from 'node:stream'
import { isGroupJid } from './decoders/_shared.js'
import type { SenderInfo } from './types.js'
import type { TextOptions } from '../builder/builder.js'

export type ChatType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'unknown'

export type SenderDevice = 'unknown' | 'android' | 'ios' | 'web' | 'desktop' | string

export interface CitationConfig {
  authors?: string[] | ((jid: string) => boolean | Promise<boolean>)
  banned?: string[] | ((jid: string) => boolean | Promise<boolean>)
}

export interface CitationPredicates {
  authors(): Promise<boolean>
  banned(): Promise<boolean>
}

export interface ContextMedia {
  buffer(): Promise<Buffer>
  stream(): Promise<Readable>
}

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

export const computeUniqueId = (key: WAMessageKey): string => {
  const input = `${key.remoteJid ?? ''}|${key.id ?? ''}|${key.fromMe === true ? '1' : '0'}`
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = (Math.imul(hash, 0x01000193) >>> 0)
  }
  return hash.toString(16).padStart(8, '0')
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
