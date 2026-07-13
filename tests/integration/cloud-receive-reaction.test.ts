import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import type { ReactionPayload } from '../../src/events/types.js'

const fixture = readFileSync(new URL('../_fixtures/cloud/reaction-message.json', import.meta.url), 'utf8')

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('integration: cloud receive reaction', () => {
  it('reaction webhook fires the reaction event with emoji and target key', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false,
      statusLog: false,
    })
    await c.connect()
    const reactions: ReactionPayload[] = []
    c.on('reaction', (r) => reactions.push(r))
    await c.webhook()(new Request('https://x.test/wh', { method: 'POST', body: fixture }))
    await new Promise((r) => setTimeout(r, 10))
    expect(reactions).toHaveLength(1)
    const r = reactions[0] as ReactionPayload
    expect(r.emoji).toBe('🔥')
    expect(r.key.id).toBe('wamid.TARGET99')
    expect(r.sender.jid).toBe('628111000222@s.whatsapp.net')
  })
})
