import { EventEmitter } from 'node:events'
import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage } from 'baileys'
import type { Transport } from '../transport/types.js'
import { ZaileysCloudError } from './errors.js'
import type { CloudOptions } from './types.js'

/** Pinned default Graph API version — override via CloudOptions.apiVersion. */
export const DEFAULT_GRAPH_VERSION = 'v23.0'
export const DEFAULT_GRAPH_BASE_URL = 'https://graph.facebook.com'

export interface CloudMe {
  id: string
  name?: string
}

export class CloudTransport implements Transport {
  readonly ev = new EventEmitter()
  readonly user: { id: string }
  private readonly options: CloudOptions

  constructor(options: CloudOptions) {
    this.options = options
    this.user = { id: options.phoneNumberId }
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

  async sendMessage(
    _jid: string,
    _content: AnyMessageContent,
    _options?: MiscMessageGenerationOptions,
  ): Promise<WAMessage | undefined> {
    throw new ZaileysCloudError('NOT_IMPLEMENTED', 'cloud sendMessage lands in the next slice')
  }
}
