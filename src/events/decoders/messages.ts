import { jidNormalizedUser, type WAContextInfo, type WAMessage, type WAMessageKey } from 'baileys'
import type { TextOptions } from '../../builder/builder.js'
import {
  buildMessageContext,
  type ChatType,
  type CitationConfig,
  type ContextMedia,
  type MediaAttachment,
  type MentionAllContext,
  type MentionContext,
  type MessageContext,
} from '../context.js'
import type { MediaKind, SenderInfo } from '../types.js'
import { createDownloadFn, createStreamFn, type DownloadLogger } from './_media-download.js'
import {
  extractMentions,
  extractQuoted,
  extractSender,
  isGroupJid,
  safeNumber,
} from './_shared.js'

export interface DecodeContext {
  selfJid: string
  selfLid?: string
  selfName?: string
  mentionMap?: Map<string, string>
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

const buttonResponseText = (content: Record<string, unknown>): string | null =>
  firstString(
    asRecord(content['buttonsResponseMessage'])?.['selectedDisplayText'],
    asRecord(content['buttonsResponseMessage'])?.['selectedButtonId'],
    asRecord(content['templateButtonReplyMessage'])?.['selectedDisplayText'],
    asRecord(content['templateButtonReplyMessage'])?.['selectedId'],
    asRecord(content['listResponseMessage'])?.['title'],
    asRecord(asRecord(content['listResponseMessage'])?.['singleSelectReply'])?.['selectedRowId'],
    asRecord(asRecord(content['interactiveResponseMessage'])?.['body'])?.['text'],
  )

const mediaCaptionText = (content: Record<string, unknown>): string | null =>
  firstString(
    asRecord(content['imageMessage'])?.['caption'],
    asRecord(content['videoMessage'])?.['caption'],
    asRecord(content['documentMessage'])?.['caption'],
    asRecord(content['documentMessage'])?.['fileName'],
  )

const toNum = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  const n = safeNumber(value as never)
  return typeof n === 'number' ? n : null
}

const STRUCTURED_FIELDS: ReadonlyArray<readonly [string, ChatType]> = [
  ['pollCreationMessage', 'poll'],
  ['pollCreationMessageV2', 'poll'],
  ['pollCreationMessageV3', 'poll'],
  ['contactMessage', 'contact'],
  ['contactsArrayMessage', 'contact'],
  ['locationMessage', 'location'],
  ['liveLocationMessage', 'live-location'],
  ['eventMessage', 'event'],
  ['buttonsMessage', 'buttons'],
  ['listMessage', 'list'],
  ['interactiveMessage', 'interactive'],
  ['templateMessage', 'template'],
]

const structuredMedia = (content: Record<string, unknown>): ContextMedia | null => {
  const poll =
    asRecord(content['pollCreationMessage']) ??
    asRecord(content['pollCreationMessageV2']) ??
    asRecord(content['pollCreationMessageV3'])
  if (poll != null) {
    const options = Array.isArray(poll['options']) ? poll['options'] : []
    return {
      type: 'poll',
      name: nonEmptyString(poll['name']),
      options: options
        .map((o) => nonEmptyString(asRecord(o)?.['optionName']))
        .filter((n): n is string => n != null),
      selectableCount: toNum(poll['selectableOptionsCount']) ?? 0,
    }
  }

  const contact = asRecord(content['contactMessage'])
  if (contact != null) {
    return {
      type: 'contact',
      displayName: nonEmptyString(contact['displayName']),
      vcard: nonEmptyString(contact['vcard']),
      contacts: [
        { displayName: nonEmptyString(contact['displayName']), vcard: nonEmptyString(contact['vcard']) },
      ],
    }
  }

  const contactsArray = asRecord(content['contactsArrayMessage'])
  if (contactsArray != null) {
    const list = Array.isArray(contactsArray['contacts']) ? contactsArray['contacts'] : []
    return {
      type: 'contact',
      displayName: nonEmptyString(contactsArray['displayName']),
      vcard: null,
      contacts: list.map((c) => ({
        displayName: nonEmptyString(asRecord(c)?.['displayName']),
        vcard: nonEmptyString(asRecord(c)?.['vcard']),
      })),
    }
  }

  const location = asRecord(content['locationMessage'])
  if (location != null) {
    return {
      type: 'location',
      latitude: toNum(location['degreesLatitude']),
      longitude: toNum(location['degreesLongitude']),
      name: nonEmptyString(location['name']),
      address: nonEmptyString(location['address']),
      accuracy: toNum(location['accuracyInMeters']),
      speed: toNum(location['speedInMps']),
      caption: nonEmptyString(location['comment']),
    }
  }

  const live = asRecord(content['liveLocationMessage'])
  if (live != null) {
    return {
      type: 'live-location',
      latitude: toNum(live['degreesLatitude']),
      longitude: toNum(live['degreesLongitude']),
      name: null,
      address: null,
      accuracy: toNum(live['accuracyInMeters']),
      speed: toNum(live['speedInMps']),
      caption: nonEmptyString(live['caption']),
    }
  }

  const event = asRecord(content['eventMessage'])
  if (event != null) {
    const evLoc = asRecord(event['location'])
    return {
      type: 'event',
      name: nonEmptyString(event['name']),
      description: nonEmptyString(event['description']),
      location: evLoc != null ? firstString(evLoc['name'], evLoc['address']) : null,
      startTime: toNum(event['startTime']),
      endTime: toNum(event['endTime']),
      isCanceled: event['isCanceled'] === true,
    }
  }

  const buttons = asRecord(content['buttonsMessage'])
  if (buttons != null) {
    const list = Array.isArray(buttons['buttons']) ? buttons['buttons'] : []
    return {
      type: 'buttons',
      contentText: nonEmptyString(buttons['contentText']),
      footerText: nonEmptyString(buttons['footerText']),
      buttons: list.map((b) => ({
        id: nonEmptyString(asRecord(b)?.['buttonId']),
        text: nonEmptyString(asRecord(asRecord(b)?.['buttonText'])?.['displayText']),
      })),
    }
  }

  const listMsg = asRecord(content['listMessage'])
  if (listMsg != null) {
    const sections = Array.isArray(listMsg['sections']) ? listMsg['sections'] : []
    return {
      type: 'list',
      title: nonEmptyString(listMsg['title']),
      description: nonEmptyString(listMsg['description']),
      buttonText: nonEmptyString(listMsg['buttonText']),
      sections: sections.map((s) => {
        const rows = Array.isArray(asRecord(s)?.['rows']) ? (asRecord(s)!['rows'] as unknown[]) : []
        return {
          title: nonEmptyString(asRecord(s)?.['title']),
          rows: rows.map((r) => ({
            id: nonEmptyString(asRecord(r)?.['rowId']),
            title: nonEmptyString(asRecord(r)?.['title']),
            description: nonEmptyString(asRecord(r)?.['description']),
          })),
        }
      }),
    }
  }

  const interactive = asRecord(content['interactiveMessage'])
  if (interactive != null) {
    const nativeFlow = asRecord(interactive['nativeFlowMessage'])
    const flowButtons = Array.isArray(nativeFlow?.['buttons'])
      ? (nativeFlow!['buttons'] as unknown[])
      : []
    return {
      type: 'interactive',
      title: nonEmptyString(asRecord(interactive['header'])?.['title']),
      body: nonEmptyString(asRecord(interactive['body'])?.['text']),
      footer: nonEmptyString(asRecord(interactive['footer'])?.['text']),
      buttons: flowButtons.map((b) => ({
        name: nonEmptyString(asRecord(b)?.['name']),
        params: nonEmptyString(asRecord(b)?.['buttonParamsJson']),
      })),
    }
  }

  const template = asRecord(content['templateMessage'])
  if (template != null) {
    const hydrated =
      asRecord(template['hydratedTemplate']) ?? asRecord(template['hydratedFourRowTemplate'])
    const hydratedButtons = Array.isArray(hydrated?.['hydratedButtons'])
      ? (hydrated!['hydratedButtons'] as unknown[])
      : []
    return {
      type: 'template',
      text: nonEmptyString(hydrated?.['hydratedContentText']),
      buttons: hydratedButtons.map((b) => {
        const rec = asRecord(b)
        const picked =
          asRecord(rec?.['quickReplyButton']) ??
          asRecord(rec?.['urlButton']) ??
          asRecord(rec?.['callButton'])
        return {
          id: nonEmptyString(picked?.['id']),
          text: nonEmptyString(picked?.['displayText']),
        }
      }),
    }
  }

  return null
}

const mainText = (msg: WAMessage): string | null => {
  const content = asRecord(msg.message)
  return content == null ? null : bodyText(unwrap(content))
}

const anyText = (msg: WAMessage): string | null => {
  const content = asRecord(msg.message)
  if (content == null) return null
  const inner = unwrap(content)
  return bodyText(inner) ?? buttonResponseText(inner) ?? mediaCaptionText(inner)
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
  const rec = asRecord(content)
  if (rec == null) return 'text'
  const inner = unwrap(rec)
  for (const field of Object.values(MEDIA_FIELD)) {
    if (inner[field] != null) {
      return field.replace('Message', '') as ChatType
    }
  }
  for (const [field, type] of STRUCTURED_FIELDS) {
    if (inner[field] != null) return type
  }
  return 'text'
}

const sameAuthor = (a: SenderInfo | undefined, b: SenderInfo): boolean => {
  if (a == null) return false
  const av = [a.pn, a.lid, a.jid].filter((v): v is string => typeof v === 'string' && v.length > 0)
  const bv = [b.pn, b.lid, b.jid].filter((v): v is string => typeof v === 'string' && v.length > 0)
  return av.some((x) => bv.includes(x))
}

const decodeQuotedContext = async (
  contextInfo: WAContextInfo | null,
  ctx: DecodeContext,
  parentRemoteJid: string,
  parentSender?: SenderInfo,
  parentRoomName?: () => Promise<string | null>,
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
        const fromStore = buildContext(original, ctx, chatTypeOf(original.message), originalText, mediaOf(original, ctx), parentRoomName)
        if (fromStore !== null) return fromStore
      }
    }

    const quoted = extractQuoted(contextInfo)
    if (quoted === null) return null
    if (typeof quoted.key.id !== 'string' || quoted.key.id.length === 0) return null

    if (parentRemoteJid.length > 0) quoted.key.remoteJid = parentRemoteJid
    if (typeof quoted.key.remoteJid !== 'string' || quoted.key.remoteJid.length === 0) return null

    const author = quoted.key.participant
    const isSelf =
      typeof author === 'string' &&
      ((ctx.selfJid.length > 0 && normalizedEquals(author, ctx.selfJid)) ||
        (ctx.selfLid != null && normalizedEquals(author, ctx.selfLid)))
    const parentIsGroup = isGroupJid(parentRemoteJid)

    let pushName = quoted.sender?.pushName
    if (isSelf) {
      quoted.key.fromMe = true
      if (ctx.selfJid.length > 0) quoted.key.participant = ctx.selfJid
      if (ctx.selfLid != null) quoted.key.participantAlt = ctx.selfLid
      if (pushName == null) pushName = ctx.selfName
    } else if (parentSender != null && (!parentIsGroup || sameAuthor(quoted.sender, parentSender))) {
      if (parentSender.pn != null) quoted.key.participant = parentSender.pn
      if (parentSender.lid != null) quoted.key.participantAlt = parentSender.lid
      if (pushName == null) pushName = parentSender.pushName
    }

    const qm = contextInfo.quotedMessage as WAMessage['message']
    const reconstructed = Object.assign(
      { key: quoted.key, message: qm ?? null },
      pushName != null ? { pushName } : {},
    ) as WAMessage
    const text = anyText(reconstructed) ?? ''
    return buildContext(reconstructed, ctx, chatTypeOf(qm), text, mediaOf(reconstructed, ctx), parentRoomName)
  } catch {
    return null
  }
}

export const rawMentionsOf = (msg: WAMessage): string[] =>
  extractMentions(contextInfoOf(msg)).mentionedJids

const normalizeJid = (jid: string): string => {
  try {
    return jidNormalizedUser(jid)
  } catch {
    return jid
  }
}

const mapMentions = (jids: string[], ctx: DecodeContext): string[] =>
  jids.map((j) => normalizeJid(ctx.mentionMap?.get(j) ?? j))

const userPart = (jid: string): string => (jid.split('@')[0] ?? '').split(':')[0] ?? ''

const syncMentionText =(text: string, map: Map<string, string> | undefined): string => {
  if (map == null || map.size === 0 || text.length === 0) return text
  let out = text
  for (const [lid, pn] of map) {
    const from = userPart(lid)
    const to = userPart(pn)
    if (from.length > 0 && to.length > 0 && from !== to) out = out.split(`@${from}`).join(`@${to}`)
  }
  return out
}

const buildContext = (
  msg: WAMessage,
  ctx: DecodeContext,
  chatType: ChatType,
  text: string,
  media?: ContextMedia,
  roomNameOverride?: () => Promise<string | null>,
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

  const resolveRoomName = roomNameOverride ?? ((): Promise<string | null> =>
    isGroup
      ? (ctx.resolveRoomName != null ? ctx.resolveRoomName(jid) : Promise.resolve(null))
      : Promise.resolve(sender.pushName ?? null))

  const resolveReceiverName: () => Promise<string | null> =
    ctx.resolveReceiverName ?? (() => Promise.resolve(null))

  const resolveReplied = (): Promise<MessageContext | null> =>
    decodeQuotedContext(contextInfo, ctx, jid, sender, resolveRoomName)

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

  const mentionedJids = mapMentions(extractMentions(contextInfo).mentionedJids, ctx)
  const syncedText = syncMentionText(text, ctx.mentionMap)

  const baseInput = {
    message: msg,
    key,
    channelId,
    receiverId,
    selfJid: ctx.selfJid,
    text: syncedText,
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

const MEDIA_KINDS: readonly string[] = ['image', 'video', 'audio', 'document', 'sticker']

const buildMediaAttachment = (
  msg: WAMessage,
  kind: MediaKind,
  ctx: DecodeContext,
): MediaAttachment | null => {
  const node = mediaNodeOf(msg, kind)
  if (node === null) return null
  const bufferFn = createDownloadFn(msg, kind, ctx.logger)
  const streamFn = createStreamFn(msg, kind, ctx.logger)
  return {
    type: kind,
    mimetype: typeof node.mimetype === 'string' ? node.mimetype : null,
    caption: typeof node.caption === 'string' ? node.caption : null,
    fileName: typeof node.fileName === 'string' ? node.fileName : null,
    fileSize: toNum(node.fileLength),
    ptt: node.ptt === true,
    buffer: async () => (await bufferFn()).buffer,
    stream: streamFn,
  }
}

const mediaOf =(msg: WAMessage, ctx: DecodeContext): ContextMedia | undefined => {
  const content = asRecord(msg.message)
  if (content == null) return undefined
  const chatType = chatTypeOf(msg.message)
  if (MEDIA_KINDS.includes(chatType)) {
    return buildMediaAttachment(msg, chatType as MediaKind, ctx) ?? undefined
  }
  return structuredMedia(unwrap(content)) ?? undefined
}

export const decodeMessage = (msg: WAMessage, ctx: DecodeContext): MessageContext | null => {
  const content = asRecord(msg.message)
  if (content == null) return null
  const chatType = chatTypeOf(msg.message)
  const media = mediaOf(msg, ctx)
  const text = anyText(msg) ?? ''
  if (text === '' && media === undefined) return null
  return buildContext(msg, ctx, chatType, text, media)
}

export const decodeText = (msg: WAMessage, ctx: DecodeContext): MessageContext | null => {
  const content = asRecord(msg.message)
  if (content == null) return null
  const inner = unwrap(content)
  const body = bodyText(inner)
  const media = structuredMedia(inner) ?? undefined
  if (body === null && media === undefined) return null
  return buildContext(msg, ctx, chatTypeOf(msg.message), body ?? '', media)
}

const decodeMedia = <K extends MediaKind>(
  kind: K,
  msg: WAMessage,
  ctx: DecodeContext,
): MessageContext | null => {
  const media = buildMediaAttachment(msg, kind, ctx)
  if (media === null) return null
  return buildContext(msg, ctx, kind as ChatType, media.caption ?? '', media)
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
  const rawMentions = extractMentions(contextInfo).mentionedJids
  if (rawMentions.length === 0) return null
  const mentionedJids = mapMentions(rawMentions, ctx)
  const hasSelf =
    mentionedJids.some((jid) => normalizedEquals(jid, ctx.selfJid)) ||
    (ctx.selfLid != null && rawMentions.some((jid) => normalizedEquals(jid, ctx.selfLid as string)))
  if (!hasSelf) return null
  const content = asRecord(msg.message)
  if (content == null) return null
  const text = anyText(msg) ?? ''
  const media = mediaOf(msg, ctx)
  const base = buildContext(msg, ctx, chatTypeOf(msg.message), text, media)
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
  const content = asRecord(msg.message)
  if (content == null) return null
  const text = anyText(msg) ?? ''
  const media = mediaOf(msg, ctx)
  const base = buildContext(msg, ctx, chatTypeOf(msg.message), text, media)
  if (base === null) return null
  return { ...base, isMentionAll: true, selfJid: ctx.selfJid }
}
