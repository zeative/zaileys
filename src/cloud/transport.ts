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
import { synthesizeSentMessage, translateOutbound } from './translate/outbound.js'
import { translateInbound, type CloudWebhookPayload } from './translate/inbound.js'

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

  /** Feed a verified webhook payload into the shared event pipeline. */
  ingest(payload: unknown): void {
    const { messages } = translateInbound(payload as CloudWebhookPayload)
    if (messages.length > 0) {
      this.ev.emit('messages.upsert', { messages, type: 'notify' })
    }
  }

  async sendMessage(
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined> {
    const payload = translateOutbound(jid, content, options)
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
