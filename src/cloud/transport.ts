import { EventEmitter } from 'node:events'
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'
import type { Transport } from '../transport/types.js'
import { ZaileysCloudError } from './errors.js'
import type { CloudOptions } from './types.js'
import {
  createGraphClient,
  DEFAULT_GRAPH_BASE_URL,
  DEFAULT_GRAPH_VERSION,
  requestTimeoutError,
  resolveRequestTimeoutMs,
  type GraphClient,
} from './graph-client.js'
import { basePayload, synthesizeSentMessage, translateOutbound } from './translate/outbound.js'
import { mediaMessageBody, outboundMediaOf, uploadMedia } from './media.js'
import { detectMimeFromBuffer } from '../builder/media-loader.js'
import { translateInbound, type CloudWebhookPayload } from './translate/inbound.js'
import { translateInteractiveProto } from './translate/interactive.js'

export { DEFAULT_GRAPH_BASE_URL, DEFAULT_GRAPH_VERSION }

export interface CloudMe {
  id: string
  name?: string
}

const MEDIA_DOWNLOAD_TIMEOUT_MS = 60_000
const MEDIA_DOWNLOAD_MAX_BYTES = 128 * 1024 * 1024

/** Reads a body chunk by chunk, stopping at `max` bytes or when `signal` aborts, instead of buffering it whole. */
const readCappedBody = async (res: Response, max: number, signal: AbortSignal): Promise<Buffer> => {
  if (!res.body) return Buffer.from(await res.arrayBuffer())
  const reader = res.body.getReader()
  const aborted = new Promise<never>((_resolve, reject) => {
    const fail = (): void => reject(new ZaileysCloudError('REQUEST_FAILED', 'media download timed out'))
    if (signal.aborted) fail()
    else signal.addEventListener('abort', fail, { once: true })
  })
  aborted.catch(() => undefined)
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), aborted])
      if (done) break
      total += value.byteLength
      if (total > max) throw new ZaileysCloudError('REQUEST_FAILED', `media exceeds ${max} bytes`)
      chunks.push(value)
    }
  } catch (err) {
    await reader.cancel().catch(() => undefined)
    throw err
  }
  return Buffer.concat(chunks, total)
}

/** Meta serves media from these origins; anything else must not receive the access token. */
const ALLOWED_MEDIA_HOST_SUFFIXES: readonly string[] = [
  '.fbcdn.net',
  '.fbsbx.com',
  '.facebook.com',
  '.whatsapp.com',
  '.whatsapp.net',
  '.cdninstagram.com',
]

export const assertMetaMediaHost = (raw: string): void => {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ZaileysCloudError('REQUEST_FAILED', 'media url is not a valid url')
  }
  if (parsed.protocol !== 'https:') {
    throw new ZaileysCloudError('REQUEST_FAILED', `refusing a non-https media url: ${parsed.protocol}`)
  }
  const host = parsed.hostname.toLowerCase()
  const allowed = ALLOWED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
  )
  if (!allowed) {
    throw new ZaileysCloudError('REQUEST_FAILED', `refusing to send credentials to ${host}`)
  }
}

export class CloudTransport implements Transport {
  readonly ev = new EventEmitter()
  readonly user: { id: string }
  private readonly options: CloudOptions
  private readonly graph: GraphClient

  constructor(options: CloudOptions) {
    this.options = options
    this.user = { id: options.phoneNumberId }
    this.graph = createGraphClient(options)
  }

  get apiVersion(): string {
    return this.options.apiVersion ?? DEFAULT_GRAPH_VERSION
  }

  get baseUrl(): string {
    return this.options.baseUrl ?? DEFAULT_GRAPH_BASE_URL
  }

  url(path: string): string {
    return `${this.baseUrl}/${this.apiVersion}/${path}`
  }

  /** Health check: token+phoneNumberId must resolve the phone-number node. No retry — a bad token never heals. */
  async connect(): Promise<CloudMe> {
    const timeoutMs = resolveRequestTimeoutMs(this.options)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    let body: { id?: string; verified_name?: string }
    try {
      res = await fetch(this.url(this.options.phoneNumberId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.options.accessToken}` },
        signal: controller.signal,
      })
      body = (await res.json().catch(() => ({}))) as { id?: string; verified_name?: string }
      if (controller.signal.aborted) throw controller.signal.reason
    } catch (err) {
      if (controller.signal.aborted) throw requestTimeoutError('cloud health-check', timeoutMs, err)
      throw new ZaileysCloudError('REQUEST_FAILED', 'cloud health-check request failed', { cause: err })
    } finally {
      clearTimeout(timer)
    }
    if (res.status === 401 || res.status === 403) {
      throw new ZaileysCloudError('AUTH', `cloud auth rejected (${res.status}) — check accessToken/phoneNumberId`)
    }
    if (!res.ok) {
      throw new ZaileysCloudError('REQUEST_FAILED', `cloud health-check failed (${res.status})`)
    }
    return {
      id: body.id ?? this.options.phoneNumberId,
      ...(body.verified_name ? { name: body.verified_name } : {}),
    }
  }

  async disconnect(): Promise<void> {
    this.ev.removeAllListeners()
  }

  /**
   * Relay seam used by the builder for interactive sends (buttons/list/cta). Translates the
   * proto to a Graph interactive payload. Returns the builder's messageId per contract, but
   * the store records the real wamid via the upsert emit.
   */
  relayMessage = async (
    jid: string,
    message: unknown,
    options: { messageId: string; additionalNodes?: unknown[] },
  ): Promise<string> => {
    const m = message as Record<string, unknown>
    if (m['botForwardedMessage'] != null || m['richResponseMessage'] != null) {
      throw new ZaileysCloudError(
        'NOT_IMPLEMENTED',
        'AIRich content (rich: true and htmlApp()) is WhatsApp-Web-only and not supported on the cloud provider. ' +
          'Send the text with send().text() — WhatsApp renders *bold*, _italic_, ~strike~ and ```mono``` natively.',
      )
    }
    const interactive = translateInteractiveProto(m)
    if (interactive === null) {
      throw new ZaileysCloudError('NOT_IMPLEMENTED', 'this relay content is not supported on the cloud provider')
    }
    const payload = { ...basePayload(jid, 'interactive'), interactive }
    const res = await this.graph.post<{ messages?: Array<{ id?: string }> }>(
      `${this.options.phoneNumberId}/messages`,
      payload,
    )
    const wamid = res.messages?.[0]?.id
    if (wamid) {
      const sent = synthesizeSentMessage(wamid, jid, { text: '' } as AnyMessageContent, Date.now())
      ;(sent as { message: unknown }).message = message
      this.ev.emit('messages.upsert', { messages: [sent], type: 'append' })
    }
    return options.messageId
  }

  /** Post a raw interactive object to /messages; shared by flows/commerce/address sends. */
  async sendInteractive(to: string, interactive: Record<string, unknown>): Promise<WAMessage> {
    const payload = { ...basePayload(to, 'interactive'), interactive }
    const res = await this.graph.post<{ messages?: Array<{ id?: string }> }>(
      `${this.options.phoneNumberId}/messages`,
      payload,
    )
    const wamid = res.messages?.[0]?.id
    if (!wamid) throw new ZaileysCloudError('REQUEST_FAILED', 'graph interactive send returned no message id')
    const sent = synthesizeSentMessage(wamid, to, { text: '' } as AnyMessageContent, Date.now())
    ;(sent as { message: unknown }).message = { interactiveMessage: interactive }
    this.ev.emit('messages.upsert', { messages: [sent], type: 'append' })
    return sent
  }

  /** Send an approved Meta message template (Cloud-only; templates are managed in Business Manager). */
  async sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    components?: Array<Record<string, unknown>>,
  ): Promise<WAMessage> {
    const payload = {
      ...basePayload(to, 'template'),
      template: {
        name,
        language: { code: languageCode },
        ...(components !== undefined ? { components } : {}),
      },
    }
    const res = await this.graph.post<{ messages?: Array<{ id?: string }> }>(
      `${this.options.phoneNumberId}/messages`,
      payload,
    )
    const wamid = res.messages?.[0]?.id
    if (!wamid) throw new ZaileysCloudError('REQUEST_FAILED', 'graph template send returned no message id')
    const sent = synthesizeSentMessage(wamid, to, { text: `template:${name}` } as AnyMessageContent, Date.now())
    this.ev.emit('messages.upsert', { messages: [sent], type: 'append' })
    return sent
  }

  /** Mark an inbound message read; optionally show a typing indicator alongside. */
  async markRead(messageId: string, opts?: { typing?: boolean }): Promise<void> {
    await this.graph.post(`${this.options.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      ...(opts?.typing === true ? { typing_indicator: { type: 'text' } } : {}),
    })
  }

  /** Resolve a Meta media id to bytes: GET /{mediaId} -> short-lived CDN url -> authorized fetch. */
  async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mime: string; size: number } | null> {
    const meta = await this.graph.get<{ url?: string; mime_type?: string }>(mediaId)
    if (!meta.url) return null
    /**
     * The url comes back inside a remote JSON body and the bearer token rides on the request, so a
     * hostile or misconfigured response could redirect the token to an attacker. Only Meta's own
     * download origins are allowed to see it.
     */
    assertMetaMediaHost(meta.url)
    /** The deadline covers the body as well, so a CDN that stalls mid-transfer cannot hang the caller. */
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), MEDIA_DOWNLOAD_TIMEOUT_MS)
    let buffer: Buffer
    try {
      let res: Response
      try {
        res = await fetch(meta.url, {
          headers: { Authorization: `Bearer ${this.options.accessToken}` },
          redirect: 'error',
          signal: controller.signal,
        })
      } catch (err) {
        throw new ZaileysCloudError('REQUEST_FAILED', 'media download failed', { cause: err })
      }
      if (!res.ok) throw new ZaileysCloudError('REQUEST_FAILED', `media download failed (${res.status})`)
      const declared = Number(res.headers?.get?.('content-length') ?? '0')
      if (Number.isFinite(declared) && declared > MEDIA_DOWNLOAD_MAX_BYTES) {
        throw new ZaileysCloudError('REQUEST_FAILED', `media exceeds ${MEDIA_DOWNLOAD_MAX_BYTES} bytes`)
      }
      buffer = await readCappedBody(res, MEDIA_DOWNLOAD_MAX_BYTES, controller.signal)
    } finally {
      clearTimeout(timer)
    }
    const mime = meta.mime_type ?? (await detectMimeFromBuffer(buffer))
    return { buffer, mime, size: buffer.byteLength }
  }

  /** Feed a verified webhook payload into the shared event pipeline. */
  ingest(payload: unknown): void {
    const { messages, reactions, statuses, templateStatuses, flowResponses, orders } = translateInbound(
      payload as CloudWebhookPayload,
    )
    if (messages.length > 0) {
      this.ev.emit('messages.upsert', { messages, type: 'notify' })
    }
    if (reactions.length > 0) {
      this.ev.emit('messages.reaction', reactions)
    }
    for (const status of statuses) {
      this.ev.emit('cloud.status', status)
    }
    for (const tpl of templateStatuses) {
      this.ev.emit('cloud.template-status', tpl)
    }
    for (const flow of flowResponses) {
      this.ev.emit('cloud.flow-response', flow)
    }
    for (const order of orders) {
      this.ev.emit('cloud.order', order)
    }
  }

  async sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined> {
    let payload = translateOutbound(jid, content, options)
    if (payload === null) {
      const media = outboundMediaOf(content)
      if (media) {
        const mediaId = await uploadMedia(this.graph, this.options.phoneNumberId, media)
        payload = {
          ...basePayload(jid, media.kind, options),
          [media.kind]: mediaMessageBody(media, mediaId),
        }
      }
    }
    if (payload === null) {
      throw new ZaileysCloudError('NOT_IMPLEMENTED', 'this content type is not supported on the cloud provider yet')
    }
    const res = await this.graph.post<{ messages?: Array<{ id?: string }> }>(
      `${this.options.phoneNumberId}/messages`,
      payload,
    )
    const wamid = res.messages?.[0]?.id
    if (!wamid) {
      throw new ZaileysCloudError('REQUEST_FAILED', 'graph send returned no message id')
    }
    const sent = synthesizeSentMessage(wamid, jid, content, Date.now())
    this.ev.emit('messages.upsert', { messages: [sent], type: 'append' })
    return sent
  }
}
