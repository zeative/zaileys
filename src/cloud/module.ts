import { ZaileysCloudError } from './errors.js'
import { createGraphClient, type GraphClient } from './graph-client.js'
import type { CloudOptions } from './types.js'

export interface CloudTemplate {
  id: string
  name: string
  status: string
  category?: string
  language?: string
  components?: Array<Record<string, unknown>>
}

export interface CloudBusinessProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  websites?: string[]
  vertical?: string
  messaging_product?: string
}

/** Cloud-only management surface: templates, profile, flows, commerce, blocklist, qr, analytics, phone. */
export class CloudModule {
  private readonly graph: GraphClient
  private readonly options: CloudOptions

  constructor(options: CloudOptions) {
    this.options = options
    this.graph = createGraphClient(options)
  }

  private requireWaba(): string {
    const waba = this.options.wabaId
    if (!waba) {
      throw new ZaileysCloudError('CONFIG', 'this operation needs cloud.wabaId (WhatsApp Business Account id)')
    }
    return waba
  }

  readonly templates = {
    list: async (params?: { status?: string; limit?: number }): Promise<CloudTemplate[]> => {
      const waba = this.requireWaba()
      const qs = new URLSearchParams()
      if (params?.status) qs.set('status', params.status)
      if (params?.limit) qs.set('limit', String(params.limit))
      const suffix = qs.size > 0 ? `?${qs.toString()}` : ''
      const res = await this.graph.get<{ data?: CloudTemplate[] }>(`${waba}/message_templates${suffix}`)
      return res.data ?? []
    },
    create: async (template: {
      name: string
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
      language: string
      components: Array<Record<string, unknown>>
    }): Promise<{ id: string; status: string }> => {
      const waba = this.requireWaba()
      return this.graph.post<{ id: string; status: string }>(`${waba}/message_templates`, template)
    },
    delete: async (name: string, id?: string): Promise<void> => {
      const waba = this.requireWaba()
      const qs = new URLSearchParams({ name })
      if (id) qs.set('hsm_id', id)
      await this.graph.delete(`${waba}/message_templates?${qs.toString()}`)
    },
  }

  readonly profile = {
    get: async (): Promise<CloudBusinessProfile> => {
      const res = await this.graph.get<{ data?: CloudBusinessProfile[] }>(
        `${this.options.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,websites,vertical`,
      )
      return res.data?.[0] ?? {}
    },
    update: async (fields: CloudBusinessProfile): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/whatsapp_business_profile`, {
        messaging_product: 'whatsapp',
        ...fields,
      })
    },
  }

  readonly flows = {
    list: async (): Promise<Array<{ id: string; name: string; status: string }>> => {
      const waba = this.requireWaba()
      const res = await this.graph.get<{ data?: Array<{ id: string; name: string; status: string }> }>(
        `${waba}/flows`,
      )
      return res.data ?? []
    },
  }

  readonly blocklist = {
    add: async (numbers: string[]): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/block_users`, {
        messaging_product: 'whatsapp',
        block_users: numbers.map((n) => ({ user: n })),
      })
    },
    remove: async (numbers: string[]): Promise<void> => {
      await this.graph.delete(`${this.options.phoneNumberId}/block_users`, {
        messaging_product: 'whatsapp',
        block_users: numbers.map((n) => ({ user: n })),
      })
    },
    list: async (): Promise<Array<{ wa_id: string }>> => {
      const res = await this.graph.get<{ data?: Array<{ block_users?: Array<{ wa_id: string }> }> }>(
        `${this.options.phoneNumberId}/block_users`,
      )
      return res.data?.[0]?.block_users ?? []
    },
  }

  readonly qr = {
    create: async (prefilledMessage: string, imageFormat: 'SVG' | 'PNG' = 'PNG'): Promise<{ code: string; prefilled_message: string; qr_image_url?: string }> => {
      return this.graph.post(`${this.options.phoneNumberId}/message_qrdls`, {
        prefilled_message: prefilledMessage,
        generate_qr_image: imageFormat,
      })
    },
    list: async (): Promise<Array<{ code: string; prefilled_message: string }>> => {
      const res = await this.graph.get<{ data?: Array<{ code: string; prefilled_message: string }> }>(
        `${this.options.phoneNumberId}/message_qrdls`,
      )
      return res.data ?? []
    },
    delete: async (code: string): Promise<void> => {
      await this.graph.delete(`${this.options.phoneNumberId}/message_qrdls/${code}`)
    },
  }

  readonly analytics = {
    conversations: async (params: { start: number; end: number; granularity?: 'HALF_HOUR' | 'DAILY' | 'MONTHLY' }): Promise<unknown> => {
      const waba = this.requireWaba()
      const field = `conversation_analytics.start(${params.start}).end(${params.end}).granularity(${params.granularity ?? 'DAILY'})`
      const res = await this.graph.get<Record<string, unknown>>(`${waba}?fields=${encodeURIComponent(field)}`)
      return res['conversation_analytics'] ?? res
    },
    messages: async (params: { start: number; end: number; granularity?: 'HALF_HOUR' | 'DAY' | 'MONTH' }): Promise<unknown> => {
      const waba = this.requireWaba()
      const field = `analytics.start(${params.start}).end(${params.end}).granularity(${params.granularity ?? 'DAY'})`
      const res = await this.graph.get<Record<string, unknown>>(`${waba}?fields=${encodeURIComponent(field)}`)
      return res['analytics'] ?? res
    },
  }

  readonly phone = {
    /** Registers the number for Cloud API messaging. Touches live registration — use with care. */
    register: async (pin: string): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/register`, { messaging_product: 'whatsapp', pin })
    },
    deregister: async (): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/deregister`, {})
    },
    requestCode: async (method: 'SMS' | 'VOICE', language = 'en_US'): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/request_code`, { code_method: method, language })
    },
    verifyCode: async (code: string): Promise<void> => {
      await this.graph.post(`${this.options.phoneNumberId}/verify_code`, { code })
    },
  }
}
