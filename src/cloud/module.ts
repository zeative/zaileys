import type { WAMessageKey } from 'baileys'
import { ZaileysCloudError } from './errors.js'
import { createGraphClient, type GraphClient } from './graph-client.js'
import type { CloudTransport } from './transport.js'
import type { CloudOptions } from './types.js'

export interface FlowSendOptions {
  flowId?: string
  flowName?: string
  cta: string
  bodyText: string
  headerText?: string
  footerText?: string
  screen: string
  flowToken?: string
  data?: Record<string, unknown>
  mode?: 'draft' | 'published'
  action?: 'navigate' | 'data_exchange'
}

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
  private readonly getTransport: () => CloudTransport

  constructor(options: CloudOptions, getTransport: () => CloudTransport) {
    this.options = options
    this.graph = createGraphClient(options)
    this.getTransport = getTransport
  }

  private requireWaba(): string {
    const waba = this.options.wabaId
    if (!waba) {
      throw new ZaileysCloudError('CONFIG', 'this operation needs cloud.wabaId (WhatsApp Business Account id)')
    }
    return waba
  }

  /** This sender's phone-number node: display number, verified name, quality rating, throughput. */
  async info(): Promise<Record<string, unknown>> {
    return this.graph.get<Record<string, unknown>>(
      `${this.options.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,throughput,code_verification_status,platform_type`,
    )
  }

  /** All phone numbers registered under the WhatsApp Business Account. */
  async phoneNumbers(): Promise<Array<Record<string, unknown>>> {
    const waba = this.requireWaba()
    const res = await this.graph.get<{ data?: Array<Record<string, unknown>> }>(
      `${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
    )
    return res.data ?? []
  }

  /** Request the user's shipping address (interactive address_message; ID/BR only per Meta). */
  async sendAddressRequest(
    to: string,
    opts: { bodyText: string; countryIso: string; values?: Record<string, unknown> },
  ): Promise<WAMessageKey> {
    const sent = await this.getTransport().sendInteractive(to, {
      type: 'address_message',
      body: { text: opts.bodyText },
      action: {
        name: 'address_message',
        parameters: { country: opts.countryIso, ...(opts.values ? { values: opts.values } : {}) },
      },
    })
    return sent.key
  }

  readonly commerce = {
    catalogs: async (): Promise<Array<{ id: string; name: string }>> => {
      const waba = this.requireWaba()
      const res = await this.graph.get<{ data?: Array<{ id: string; name: string }> }>(
        `${waba}/product_catalogs?fields=id,name`,
      )
      return res.data ?? []
    },
    products: async (
      catalogId: string,
      limit = 50,
    ): Promise<Array<{ id: string; retailer_id: string; name: string; price?: string; availability?: string }>> => {
      const res = await this.graph.get<{
        data?: Array<{ id: string; retailer_id: string; name: string; price?: string; availability?: string }>
      }>(`${catalogId}/products?fields=id,retailer_id,name,price,availability&limit=${limit}`)
      return res.data ?? []
    },
    sendProduct: async (
      to: string,
      opts: { catalogId: string; retailerId: string; bodyText?: string; footerText?: string },
    ): Promise<WAMessageKey> => {
      const sent = await this.getTransport().sendInteractive(to, {
        type: 'product',
        ...(opts.bodyText ? { body: { text: opts.bodyText } } : {}),
        ...(opts.footerText ? { footer: { text: opts.footerText } } : {}),
        action: { catalog_id: opts.catalogId, product_retailer_id: opts.retailerId },
      })
      return sent.key
    },
    sendProductList: async (
      to: string,
      opts: {
        catalogId: string
        headerText: string
        bodyText: string
        footerText?: string
        sections: Array<{ title: string; productIds: string[] }>
      },
    ): Promise<WAMessageKey> => {
      const sent = await this.getTransport().sendInteractive(to, {
        type: 'product_list',
        header: { type: 'text', text: opts.headerText },
        body: { text: opts.bodyText },
        ...(opts.footerText ? { footer: { text: opts.footerText } } : {}),
        action: {
          catalog_id: opts.catalogId,
          sections: opts.sections.map((s) => ({
            title: s.title,
            product_items: s.productIds.map((id) => ({ product_retailer_id: id })),
          })),
        },
      })
      return sent.key
    },
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
    get: async (idOrName: string): Promise<CloudTemplate | null> => {
      const fields = 'id,name,status,category,language,components,quality_score'
      if (/^\d+$/.test(idOrName)) {
        const t = await this.graph.get<CloudTemplate>(`${idOrName}?fields=${fields}`)
        return t.id ? t : null
      }
      const waba = this.requireWaba()
      const res = await this.graph.get<{ data?: CloudTemplate[] }>(
        `${waba}/message_templates?name=${encodeURIComponent(idOrName)}&fields=${fields}`,
      )
      return res.data?.[0] ?? null
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
    send: async (to: string, opts: FlowSendOptions): Promise<WAMessageKey> => {
      if (!opts.flowId && !opts.flowName) {
        throw new ZaileysCloudError('CONFIG', 'flows.send needs flowId or flowName')
      }
      const sent = await this.getTransport().sendInteractive(to, {
        type: 'flow',
        ...(opts.headerText ? { header: { type: 'text', text: opts.headerText } } : {}),
        body: { text: opts.bodyText },
        ...(opts.footerText ? { footer: { text: opts.footerText } } : {}),
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            ...(opts.flowId ? { flow_id: opts.flowId } : {}),
            ...(opts.flowName ? { flow_name: opts.flowName } : {}),
            flow_cta: opts.cta,
            ...(opts.flowToken ? { flow_token: opts.flowToken } : {}),
            ...(opts.mode ? { mode: opts.mode } : {}),
            flow_action: opts.action ?? 'navigate',
            flow_action_payload: { screen: opts.screen, ...(opts.data ? { data: opts.data } : {}) },
          },
        },
      })
      return sent.key
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
