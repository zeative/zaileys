import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '../../src/client/client.js'
import type { ButtonClickPayload, ListSelectPayload } from '../../src/events/types.js'

const fixture = readFileSync(new URL('../_fixtures/cloud/interactive-replies.json', import.meta.url), 'utf8')

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('integration: cloud receive interactive replies', () => {
  it('button_reply and list_reply fire button-click and list-select', async () => {
    fetchMock.mockResolvedValueOnce(ok({ id: '555' }))
    const c = new Client({
      provider: 'cloud',
      cloud: { accessToken: 'tok', phoneNumberId: '555' },
      autoConnect: false,
      statusLog: false,
    })
    await c.connect()
    const clicks: ButtonClickPayload[] = []
    const selects: ListSelectPayload[] = []
    c.on('button-click', (p) => clicks.push(p))
    c.on('list-select', (p) => selects.push(p))
    await c.webhook()(new Request('https://x.test/wh', { method: 'POST', body: fixture }))
    await new Promise((r) => setTimeout(r, 10))
    expect(clicks).toHaveLength(1)
    expect(clicks[0]).toMatchObject({ buttonId: 'yes', buttonText: 'Ya' })
    expect(selects).toHaveLength(1)
    expect(selects[0]).toMatchObject({ rowId: 'nasgor' })
  })
})
