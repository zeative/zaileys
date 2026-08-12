import { getContentType, normalizeMessageContent, proto, type AnyMessageContent, type WAMessage } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { RELAY_CONTENT_KEY, RELAY_REQUIRE_GROUP_KEY } from './buttons.js'
import type { GroupStatusFont, GroupStatusOptions, GroupStatusRepostOptions, GroupStatusSource } from '../types.js'

const MAX_ARGB = 0xffffffff

const HEX3 = /^[0-9a-fA-F]{3}$/
const HEX6 = /^[0-9a-fA-F]{6}$/
const HEX8 = /^[0-9a-fA-F]{8}$/

const FONT_VALUES: Record<GroupStatusFont, number> = {
  system: 0,
  'system-text': 1,
  'fb-script': 2,
  'system-bold': 6,
  morningbreeze: 7,
  calistoga: 8,
  exo2: 9,
  courierprime: 10,
}

const invalid = (message: string): never => {
  throw new ZaileysBuilderError('INVALID_OPTIONS', message)
}

/**
 * Parses a group status background into an ARGB integer. Unlike baileys' `assertColor` this keeps
 * numeric input (which that helper silently turns into `undefined`) and reads `#RGB` as CSS shorthand.
 */
export const parseStatusArgb = (value: string | number): number => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) return invalid(`groupStatus() backgroundColor must be an integer, got ${value}`)
    const argb = value < 0 ? MAX_ARGB + value + 1 : value
    if (argb < 0 || argb > MAX_ARGB) {
      return invalid(`groupStatus() backgroundColor is outside the ARGB range, got ${value}`)
    }
    return argb
  }
  if (typeof value !== 'string') return invalid('groupStatus() backgroundColor must be a hex string or an integer')
  const hex = value.trim().replace('#', '')
  if (HEX8.test(hex)) return Number.parseInt(hex, 16)
  if (HEX6.test(hex)) return Number.parseInt(`FF${hex}`, 16)
  if (HEX3.test(hex)) {
    const expanded = [...hex].map((c) => `${c}${c}`).join('')
    return Number.parseInt(`FF${expanded}`, 16)
  }
  return invalid(`groupStatus() backgroundColor must be #RGB, #RRGGBB or #AARRGGBB, got ${value}`)
}

/** Resolves a named font to its WhatsApp `FontType`; raw integers pass through for forward compatibility. */
export const resolveStatusFont = (value: GroupStatusFont | number): number => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0) {
      return invalid(`groupStatus() font must be a non-negative integer, got ${value}`)
    }
    return value
  }
  const resolved = FONT_VALUES[value]
  if (resolved === undefined) {
    return invalid(`groupStatus() font must be one of ${Object.keys(FONT_VALUES).join(', ')}, got ${String(value)}`)
  }
  return resolved
}

export const buildGroupStatusContent = (text: string, opts?: GroupStatusOptions): AnyMessageContent => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'groupStatus() requires a non-empty string')
  }
  const extendedTextMessage: Record<string, unknown> = { text }
  if (opts?.backgroundColor !== undefined) {
    extendedTextMessage['backgroundArgb'] = parseStatusArgb(opts.backgroundColor)
  }
  if (opts?.font !== undefined) {
    extendedTextMessage['font'] = resolveStatusFont(opts.font)
  }
  return wrapStatus({ extendedTextMessage })
}

const wrapStatus = (message: Record<string, unknown>): AnyMessageContent =>
  ({
    [RELAY_CONTENT_KEY]: { groupStatusMessageV2: { message } },
    [RELAY_REQUIRE_GROUP_KEY]: 'groupStatus()',
  }) as unknown as AnyMessageContent

const REPOSTABLE = ['conversation', 'extendedTextMessage'] as const

/**
 * Media inside the group-status envelope is rejected: eight live variants relayed cleanly and none
 * rendered, while the same session posted a media `status@broadcast` that did render — so the limit is
 * the envelope, not the media pipeline. Text in the same envelope renders fine. Lift this if a WhatsApp
 * build is found that shows one.
 */
const MEDIA_KEYS = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'])

const toWAMessage = (source: GroupStatusSource): WAMessage =>
  typeof (source as { message?: unknown }).message === 'function'
    ? (source as { message: () => WAMessage }).message()
    : (source as WAMessage)

/** Reposts an existing text message as a group status. Media sources are rejected — see `MEDIA_KEYS`. */
export const buildGroupStatusRepost = (
  source: GroupStatusSource,
  opts?: GroupStatusRepostOptions,
): AnyMessageContent => {
  const original = toWAMessage(source)
  const content = original?.message == null ? null : normalizeMessageContent(original.message)
  const key = content == null ? undefined : getContentType(content)
  if (content == null || key === undefined) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'groupStatus() source has no repostable content')
  }
  if (MEDIA_KEYS.has(key)) {
    throw new ZaileysBuilderError(
      'INVALID_OPTIONS',
      `groupStatus() cannot repost ${key}: media group status is not verified to render, so it is blocked rather than sent blind`,
    )
  }
  if (!REPOSTABLE.includes(key as (typeof REPOSTABLE)[number])) {
    throw new ZaileysBuilderError(
      'INVALID_OPTIONS',
      `groupStatus() cannot repost ${key}; supported: ${REPOSTABLE.join(', ')}`,
    )
  }
  const copy = proto.Message.decode(proto.Message.encode(content).finish()) as unknown as Record<string, unknown>
  if (key === 'conversation') {
    copy['extendedTextMessage'] = { text: copy['conversation'] }
    delete copy['conversation']
  }
  const nodeKey = key === 'conversation' ? 'extendedTextMessage' : key
  const node = copy[nodeKey] as Record<string, unknown>
  delete node['viewOnce']
  node['contextInfo'] = {}
  if (opts?.caption !== undefined) node['text'] = opts.caption
  return wrapStatus({ [nodeKey]: node })
}
