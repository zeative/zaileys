import { describe, expect, it, vi } from 'vitest'
import { Client, parseMexUsers } from '../../src/client/client.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'

const LID = '115362955808779@lid'
const LID2 = '234256710246613@lid'

/** Shaped from a real `w:mex` reply captured on the wire. */
const mexReply = (users: unknown[]) => ({
  tag: 'iq',
  attrs: { from: '@s.whatsapp.net', type: 'result' },
  content: [
    { tag: 'result', attrs: {}, content: Buffer.from(JSON.stringify({ data: { xwa2_fetch_wa_users: users } })) },
  ],
})

const namedUser = (jid: string, username: string) => ({
  __typename: 'XWA2User',
  id: null,
  jid,
  username_info: { __typename: 'XWA2Username', pin: null, state: null, timestamp: null, username },
})

const emptyUser = (jid: string) => ({
  __typename: 'XWA2User',
  id: null,
  jid,
  username_info: { __typename: 'XWA2ResponseStatus', status: 'EMPTY' },
})

const connected = (query: unknown) => {
  const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
  ;(c as unknown as { _socket: unknown })._socket = { query, generateMessageTag: () => 'TAG1' }
  return c
}

describe('parseMexUsers', () => {
  it('reads the usernames out of a real reply', () => {
    expect(parseMexUsers(mexReply([namedUser(LID, 'hacelo'), namedUser(LID2, 'hanntylor')]))).toEqual([
      { jid: LID, username: 'hacelo' },
      { jid: LID2, username: 'hanntylor' },
    ])
  })

  it('skips users WhatsApp reports as having no username', () => {
    expect(parseMexUsers(mexReply([emptyUser(LID), namedUser(LID2, 'hanntylor')]))).toEqual([
      { jid: LID2, username: 'hanntylor' },
    ])
  })

  it('survives a malformed or unexpected payload', () => {
    expect(parseMexUsers(undefined)).toEqual([])
    expect(parseMexUsers({ content: 'not-an-array' })).toEqual([])
    expect(parseMexUsers({ content: [{ tag: 'other', content: Buffer.from('{}') }] })).toEqual([])
    expect(parseMexUsers({ content: [{ tag: 'result', content: Buffer.from('not json') }] })).toEqual([])
    expect(parseMexUsers({ content: [{ tag: 'result', content: Buffer.from('{"data":{}}') }] })).toEqual([])
  })

  it('ignores an entry whose username is empty', () => {
    expect(parseMexUsers(mexReply([namedUser(LID, '')]))).toEqual([])
  })
})

describe('Client.usernames', () => {
  it('resolves many jids in a single round trip', async () => {
    const query = vi.fn(async () => mexReply([namedUser(LID, 'hacelo'), namedUser(LID2, 'hanntylor')]))
    const map = await connected(query).usernames([LID, LID2])
    expect(query).toHaveBeenCalledTimes(1)
    expect(map.get(LID)).toBe('hacelo')
    expect(map.get(LID2)).toBe('hanntylor')
  })

  it('sends the GraphQL document the official client uses', async () => {
    const query = vi.fn(async () => mexReply([]))
    await connected(query).usernames([LID])
    const iq = query.mock.calls[0]![0] as {
      attrs: { xmlns: string }
      content: Array<{ attrs: { query_id: string }; content: Buffer }>
    }
    expect(iq.attrs.xmlns).toBe('w:mex')
    expect(iq.content[0]!.attrs.query_id).toBe('29829202653362039')
    const body = JSON.parse(iq.content[0]!.content.toString())
    expect(body.variables.include_username).toBe(true)
    expect(body.variables.input.query_input).toEqual([{ jid: LID }])
  })

  it('omits jids that have no username rather than mapping them to null', async () => {
    const query = vi.fn(async () => mexReply([emptyUser(LID)]))
    const map = await connected(query).usernames([LID])
    expect(map.has(LID)).toBe(false)
    expect(map.size).toBe(0)
  })

  it('skips the round trip for an empty input', async () => {
    const query = vi.fn(async () => mexReply([]))
    expect((await connected(query).usernames([])).size).toBe(0)
    expect(query).not.toHaveBeenCalled()
  })

  it('returns an empty map when the query throws', async () => {
    const query = vi.fn(async () => {
      throw new Error('offline')
    })
    expect((await connected(query).usernames([LID])).size).toBe(0)
  })

  it('returns an empty map when no socket is attached', async () => {
    const c = new Client({ auth: new MemoryAuthStore(), qrTerminal: false, autoConnect: false })
    expect((await c.usernames([LID])).size).toBe(0)
  })
})

describe('Client.getUsername', () => {
  it('returns the single username', async () => {
    const query = vi.fn(async () => mexReply([namedUser(LID, 'hacelo')]))
    await expect(connected(query).getUsername(LID)).resolves.toBe('hacelo')
  })

  it('returns null when the account has no username', async () => {
    const query = vi.fn(async () => mexReply([emptyUser(LID)]))
    await expect(connected(query).getUsername(LID)).resolves.toBeNull()
  })
})
