import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createWebhookHandler } from '../../src/cloud/webhook.js'

const fixture = readFileSync(new URL('../_fixtures/cloud/text-message.json', import.meta.url), 'utf8')

const sign = (secret: string, body: string): string => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

const handler = (over: { verifyToken?: string; appSecret?: string; onPayload?: (p: unknown) => void } = {}) =>
  createWebhookHandler({
    verifyToken: over.verifyToken ?? 'verify-me',
    ...(over.appSecret !== undefined ? { appSecret: over.appSecret } : {}),
    onPayload: over.onPayload ?? ((): void => undefined),
  })

describe('cloud webhook handler', () => {
  it('GET with valid verify token echoes hub.challenge with 200', async () => {
    const h = handler()
    const res = await h(
      new Request('https://x.test/wh?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'),
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('12345')
  })

  it('GET with wrong verify token -> 403', async () => {
    const h = handler()
    const res = await h(
      new Request('https://x.test/wh?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=12345'),
    )
    expect(res.status).toBe(403)
  })

  it('POST with valid signature dispatches payload and returns 200', async () => {
    const onPayload = vi.fn()
    const h = handler({ appSecret: 'shh', onPayload })
    const res = await h(
      new Request('https://x.test/wh', {
        method: 'POST',
        headers: { 'x-hub-signature-256': sign('shh', fixture), 'content-type': 'application/json' },
        body: fixture,
      }),
    )
    expect(res.status).toBe(200)
    expect(onPayload).toHaveBeenCalledTimes(1)
    expect((onPayload.mock.calls[0] as unknown[])[0]).toMatchObject({ object: 'whatsapp_business_account' })
  })

  it('POST with tampered signature -> 401, no dispatch', async () => {
    const onPayload = vi.fn()
    const h = handler({ appSecret: 'shh', onPayload })
    const res = await h(
      new Request('https://x.test/wh', {
        method: 'POST',
        headers: { 'x-hub-signature-256': sign('other-secret', fixture) },
        body: fixture,
      }),
    )
    expect(res.status).toBe(401)
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('POST with missing signature when appSecret set -> 401', async () => {
    const onPayload = vi.fn()
    const h = handler({ appSecret: 'shh', onPayload })
    const res = await h(new Request('https://x.test/wh', { method: 'POST', body: fixture }))
    expect(res.status).toBe(401)
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('POST without appSecret configured skips signature check', async () => {
    const onPayload = vi.fn()
    const h = handler({ onPayload })
    const res = await h(new Request('https://x.test/wh', { method: 'POST', body: fixture }))
    expect(res.status).toBe(200)
    expect(onPayload).toHaveBeenCalledTimes(1)
  })

  it('POST with malformed JSON -> 400, no dispatch', async () => {
    const onPayload = vi.fn()
    const h = handler({ onPayload })
    const res = await h(new Request('https://x.test/wh', { method: 'POST', body: 'not-json{' }))
    expect(res.status).toBe(400)
    expect(onPayload).not.toHaveBeenCalled()
  })

  it('other methods -> 405', async () => {
    const h = handler()
    const res = await h(new Request('https://x.test/wh', { method: 'PUT', body: '{}' }))
    expect(res.status).toBe(405)
  })

  it('onPayload throwing still returns 200 (webhook must ack)', async () => {
    const h = handler({
      onPayload: () => {
        throw new Error('handler exploded')
      },
    })
    const res = await h(new Request('https://x.test/wh', { method: 'POST', body: fixture }))
    expect(res.status).toBe(200)
  })
})
