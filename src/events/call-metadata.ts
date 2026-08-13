import type { CallerInfo } from './types.js'

/** WhatsApp sends richer caller details on the raw call stanza than baileys keeps; this is that surplus. */
type RawNode = {
  tag?: string
  attrs?: Record<string, string | undefined>
  content?: unknown
}

const MAX_ENTRIES = 64

const cache = new Map<string, CallerInfo>()

const asNode = (value: unknown): RawNode | null =>
  value != null && typeof value === 'object' ? (value as RawNode) : null

const children = (node: RawNode): RawNode[] =>
  Array.isArray(node.content) ? node.content.map(asNode).filter((n): n is RawNode => n !== null) : []

const findChild = (node: RawNode, tag: string): RawNode | undefined =>
  children(node).find((child) => child.tag === tag)

const text = (value: string | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const int = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

const remember = (callId: string, info: CallerInfo): void => {
  if (Object.keys(info).length === 0) return
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(callId, info)
}

/** Reads the caller details WhatsApp puts on a raw `<call>` stanza. Returns false when the node is not an offer. */
export const rememberCallerInfo = (raw: unknown): boolean => {
  const node = asNode(raw)
  if (node === null || node.tag !== 'call') return false
  const offer = children(node).find((child) => child.tag === 'offer')
  const callId = text(offer?.attrs?.['call-id'])
  if (offer === undefined || callId === undefined) return false

  const info: CallerInfo = {}
  const platform = text(node.attrs?.['platform'])
  const appVersion = text(node.attrs?.['version'])
  const name = text(node.attrs?.['notify'])
  const countryCode = text(offer.attrs?.['caller_country_code'])
  const phoneJid = text(offer.attrs?.['caller_pn'])
  if (platform !== undefined) info.platform = platform
  if (appVersion !== undefined) info.appVersion = appVersion
  if (name !== undefined) info.name = name
  if (countryCode !== undefined) info.countryCode = countryCode
  if (phoneJid !== undefined) info.phoneJid = phoneJid

  const medium = int(findChild(offer, 'net')?.attrs?.['medium'])
  if (medium !== undefined) info.networkMedium = medium

  const video = findChild(offer, 'video')
  const width = int(video?.attrs?.['screen_width'])
  const height = int(video?.attrs?.['screen_height'])
  if (width !== undefined && height !== undefined) info.screen = { width, height }

  remember(callId, info)
  return true
}

/** Pops the caller details captured for a call id, if the raw stanza carried any. */
export const takeCallerInfo = (callId: string): CallerInfo | undefined => {
  const info = cache.get(callId)
  if (info !== undefined) cache.delete(callId)
  return info
}

/** Test seam: drops everything captured so far. */
export const resetCallerInfo = (): void => {
  cache.clear()
}
