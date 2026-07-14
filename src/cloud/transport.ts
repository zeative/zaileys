import { EventEmitter } from 'node:events'
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'
import type { Transport } from '../transport/types.js'
import { ZaileysCloudError } from './errors.js'
import type { CloudOptions } from './types.js'
import {
  createGraphClient,
  DEFAULT_GRAPH_BASE_URL,
  DEFAULT_GRAPH_VERSION,
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
    let res: Response
    try {
      res = await fetch(this.url(this.options.phoneNumberId), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.options.accessToken}` },
      })
    } catch (err) {
      throw new ZaileysCloudError('REQUEST_FAILED', 'cloud health-check request failed', { cause: err })
    }
    if (res.status === 401 || res.status === 403) {
      throw new ZaileysCloudError('AUTH', `cloud auth rejected (${res.status}) — check accessToken/phoneNumberId`)
    }
    if (!res.ok) {
      throw new ZaileysCloudError('REQUEST_FAILED', `cloud health-check failed (${res.status})`)
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string; verified_name?: string }
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
    const interactive = translateInteractiveProto(message as Record<string, unknown>)
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
    let res: Response
    try {
      res = await fetch(meta.url, { headers: { Authorization: `Bearer ${this.options.accessToken}` } })
    } catch (err) {
      throw new ZaileysCloudError('REQUEST_FAILED', 'media download failed', { cause: err })
    }
    if (!res.ok) throw new ZaileysCloudError('REQUEST_FAILED', `media download failed (${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const mime = meta.mime_type ?? (await detectMimeFromBuffer(buffer))
    return { buffer, mime, size: buffer.byteLength }
  }

  /** Feed a verified webhook payload into the shared event pipeline. */
  ingest(payload: unknown): void {
    const { messages, reactions, statuses, templateStatuses } = translateInbound(payload as CloudWebhookPayload)
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
