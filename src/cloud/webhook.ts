import { createHmac, timingSafeEqual } from 'node:crypto'

export type WebhookHandler = (req: Request) => Promise<Response>

export interface WebhookHandlerOptions {
  verifyToken?: string
  appSecret?: string
  onPayload: (payload: unknown) => void
}

const verifySignature = (appSecret: string, rawBody: string, header: string | null): boolean => {
  if (!header || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const received = header.slice('sha256='.length)
  if (received.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'))
}

/**
 * Framework-agnostic Meta webhook endpoint: handles the GET verification challenge and
 * signed POST deliveries. Mount it on any server that speaks Web Request/Response.
 */
export function createWebhookHandler(options: WebhookHandlerOptions): WebhookHandler {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const mode = url.searchParams.get('hub.mode')
      const token = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge') ?? ''
      if (mode === 'subscribe' && options.verifyToken !== undefined && token === options.verifyToken) {
        return new Response(challenge, { status: 200 })
      }
      return new Response('forbidden', { status: 403 })
    }
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 })
    }
    const rawBody = await req.text()
    if (options.appSecret !== undefined) {
      const ok = verifySignature(options.appSecret, rawBody, req.headers.get('x-hub-signature-256'))
      if (!ok) return new Response('invalid signature', { status: 401 })
    }
    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response('malformed body', { status: 400 })
    }
    try {
      options.onPayload(payload)
    } catch {
      /** Always ack — Meta retries aggressively on non-200 and consumer errors must not amplify. */
    }
    return new Response('OK', { status: 200 })
  }
}
