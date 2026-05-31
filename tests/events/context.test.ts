import { describe, expect, it, vi } from 'vitest'

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual }
})

const {
  extractLinks,
  computeUniqueId,
  isQuestionOf,
  isPrefixOf,
  isTagMeOf,
  makeCitation,
  buildMessageContext,
} = await import('../../src/events/context.js')

describe('extractLinks', () => {
  it('extracts multiple URLs from text', () => {
    const result = extractLinks('a https://x.io b http://y.co/z?q=1')
    expect(result).toEqual(['https://x.io', 'http://y.co/z?q=1'])
  })

  it('returns empty array when no URLs present', () => {
    expect(extractLinks('no urls here')).toEqual([])
  })

  it('handles empty string', () => {
    expect(extractLinks('')).toEqual([])
  })

  it('strips trailing punctuation from URLs', () => {
    const result = extractLinks('see https://example.com. done')
    expect(result[0]).toBe('https://example.com')
  })

  it('completes in linear time on adversarial input', () => {
    const adversarial = 'a'.repeat(10000)
    const start = performance.now()
    extractLinks(adversarial)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(50)
  })
})

describe('computeUniqueId', () => {
  it('is deterministic: two calls with same key produce the same id', () => {
    const key = { remoteJid: 'r@s.whatsapp.net', id: 'abc123', fromMe: false }
    expect(computeUniqueId(key)).toBe(computeUniqueId(key))
  })

  it('differs when id changes', () => {
    const key1 = { remoteJid: 'r@s.whatsapp.net', id: 'abc', fromMe: false }
    const key2 = { remoteJid: 'r@s.whatsapp.net', id: 'xyz', fromMe: false }
    expect(computeUniqueId(key1)).not.toBe(computeUniqueId(key2))
  })

  it('differs when fromMe changes', () => {
    const key1 = { remoteJid: 'r@s.whatsapp.net', id: 'abc', fromMe: false }
    const key2 = { remoteJid: 'r@s.whatsapp.net', id: 'abc', fromMe: true }
    expect(computeUniqueId(key1)).not.toBe(computeUniqueId(key2))
  })

  it('returns a non-empty hex string', () => {
    const id = computeUniqueId({ remoteJid: 'r', id: 'i', fromMe: false })
    expect(id).toMatch(/^[0-9a-f]+$/)
    expect(id.length).toBeGreaterThan(0)
  })

  it('handles undefined key fields gracefully', () => {
    const id = computeUniqueId({ remoteJid: undefined, id: undefined, fromMe: undefined })
    expect(typeof id).toBe('string')
  })
})

describe('isQuestionOf', () => {
  it('returns true for text ending with ?', () => {
    expect(isQuestionOf('is this a question?')).toBe(true)
  })

  it('returns false for text not ending with ?', () => {
    expect(isQuestionOf('hello world')).toBe(false)
  })

  it('trims whitespace before checking', () => {
    expect(isQuestionOf('  is this a question?  ')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isQuestionOf('')).toBe(false)
  })
})

describe('isPrefixOf', () => {
  it('returns false for empty prefix list', () => {
    expect(isPrefixOf('!hello', [])).toBe(false)
  })

  it('returns true when text starts with a configured prefix', () => {
    expect(isPrefixOf('!hello', ['!', '/'])).toBe(true)
  })

  it('returns true for slash prefix', () => {
    expect(isPrefixOf('/cmd', ['!', '/'])).toBe(true)
  })

  it('returns false when text does not start with any prefix', () => {
    expect(isPrefixOf('hello', ['!', '/'])).toBe(false)
  })
})

describe('isTagMeOf', () => {
  it('returns true when selfJid is in mentions', () => {
    const self = '628111@s.whatsapp.net'
    expect(isTagMeOf(self, [self])).toBe(true)
  })

  it('returns false when selfJid is not in mentions', () => {
    expect(isTagMeOf('628111@s.whatsapp.net', ['628222@s.whatsapp.net'])).toBe(false)
  })

  it('returns false for empty mentions', () => {
    expect(isTagMeOf('628111@s.whatsapp.net', [])).toBe(false)
  })
})

describe('makeCitation', () => {
  it('authors() resolves false when config absent', async () => {
    const citation = makeCitation(undefined, '628111@s.whatsapp.net')
    expect(await citation.authors()).toBe(false)
  })

  it('banned() resolves false when config absent', async () => {
    const citation = makeCitation(undefined, '628111@s.whatsapp.net')
    expect(await citation.banned()).toBe(false)
  })

  it('authors() resolves true when sender is in authors array', async () => {
    const senderJid = '628111@s.whatsapp.net'
    const citation = makeCitation({ authors: [senderJid] }, senderJid)
    expect(await citation.authors()).toBe(true)
  })

  it('authors() resolves false when sender is NOT in authors array', async () => {
    const citation = makeCitation({ authors: ['628999@s.whatsapp.net'] }, '628111@s.whatsapp.net')
    expect(await citation.authors()).toBe(false)
  })

  it('banned() resolves true when sender is in banned array', async () => {
    const senderJid = '628222@s.whatsapp.net'
    const citation = makeCitation({ banned: [senderJid] }, senderJid)
    expect(await citation.banned()).toBe(true)
  })

  it('authors() respects function predicate returning true', async () => {
    const fn = vi.fn().mockResolvedValue(true)
    const citation = makeCitation({ authors: fn }, '628111@s.whatsapp.net')
    expect(await citation.authors()).toBe(true)
    expect(fn).toHaveBeenCalledWith('628111@s.whatsapp.net')
  })

  it('banned() respects function predicate returning false', async () => {
    const fn = vi.fn().mockResolvedValue(false)
    const citation = makeCitation({ banned: fn }, '628111@s.whatsapp.net')
    expect(await citation.banned()).toBe(false)
  })

  it('rejects when predicate function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('predicate error'))
    const citation = makeCitation({ authors: fn }, '628111@s.whatsapp.net')
    await expect(citation.authors()).rejects.toThrow('predicate error')
  })
})

describe('buildMessageContext', () => {
  const SELF = '628111@s.whatsapp.net'
  const SENDER = '628222@s.whatsapp.net'
  const MSG_KEY = { remoteJid: SENDER, id: 'M1', fromMe: false }

  const baseInput = () => ({
    message: { key: MSG_KEY, messageTimestamp: 1700000000, pushName: 'Alice', message: {} } as never,
    key: MSG_KEY,
    channelId: 'my-session',
    receiverId: SELF,
    selfJid: SELF,
    text: 'Hello world',
    chatType: 'text' as const,
    sender: { jid: SENDER, pushName: 'Alice', isMe: false },
    mentions: [],
    isViewOnce: false,
    isEphemeral: false,
    isForwarded: false,
    isBroadcast: false,
    isNewsletter: false,
    prefixes: ['!'],
    resolveRoomName: async () => null,
    resolveReceiverName: async () => 'Me',
    resolveReplied: async () => null,
  })

  it('produces an object with eager fields set correctly', () => {
    const ctx = buildMessageContext(baseInput())
    expect(ctx.channelId).toBe('my-session')
    expect(ctx.chatId).toBe('M1')
    expect(ctx.senderId).toBe(SENDER)
    expect(ctx.text).toBe('Hello world')
    expect(ctx.isFromMe).toBe(false)
    expect(ctx.isGroup).toBe(false)
    expect(typeof ctx.uniqueId).toBe('string')
  })

  it('uniqueId is deterministic across two buildMessageContext calls with same input', () => {
    const ctx1 = buildMessageContext(baseInput())
    const ctx2 = buildMessageContext(baseInput())
    expect(ctx1.uniqueId).toBe(ctx2.uniqueId)
  })

  it('deferred flags default to false', () => {
    const ctx = buildMessageContext(baseInput())
    expect(ctx.isEdited).toBe(false)
    expect(ctx.isDeleted).toBe(false)
    expect(ctx.isPinned).toBe(false)
    expect(ctx.isUnPinned).toBe(false)
    expect(ctx.isBot).toBe(false)
    expect(ctx.isSpam).toBe(false)
    expect(ctx.isHideTags).toBe(false)
    expect(ctx.isStatusMention).toBe(false)
    expect(ctx.isGroupStatusMention).toBe(false)
    expect(ctx.isStory).toBe(false)
  })

  it('isQuestion flag is set from text', () => {
    const ctx = buildMessageContext({ ...baseInput(), text: 'is this a test?' })
    expect(ctx.isQuestion).toBe(true)
  })

  it('isPrefix flag is set when text starts with prefix', () => {
    const ctx = buildMessageContext({ ...baseInput(), text: '!command', prefixes: ['!'] })
    expect(ctx.isPrefix).toBe(true)
  })

  it('isPrefix is false when prefixes empty', () => {
    const ctx = buildMessageContext({ ...baseInput(), text: '!cmd', prefixes: [] })
    expect(ctx.isPrefix).toBe(false)
  })

  it('links are extracted from text', () => {
    const ctx = buildMessageContext({ ...baseInput(), text: 'see https://example.com for more' })
    expect(ctx.links).toEqual(['https://example.com'])
  })

  it('lazy roomName delegates to resolver', async () => {
    const ctx = buildMessageContext({ ...baseInput(), resolveRoomName: async () => 'Test Group' })
    expect(await ctx.roomName()).toBe('Test Group')
  })

  it('lazy replied delegates to resolver', async () => {
    const ctx = buildMessageContext({ ...baseInput(), resolveReplied: async () => null })
    expect(await ctx.replied()).toBeNull()
  })

  it('message() returns the raw WAMessage', () => {
    const input = baseInput()
    const ctx = buildMessageContext(input)
    expect(ctx.message()).toBe(input.message)
  })

  it('citation defaults false when no config', async () => {
    const ctx = buildMessageContext(baseInput())
    expect(await ctx.citation.authors()).toBe(false)
    expect(await ctx.citation.banned()).toBe(false)
  })

  it('media is undefined when not provided', () => {
    const ctx = buildMessageContext(baseInput())
    expect(ctx.media).toBeUndefined()
  })

  it('media is set when provided in input', () => {
    const mockMedia = { buffer: async () => Buffer.alloc(0), stream: async () => { throw new Error() } }
    const ctx = buildMessageContext({ ...baseInput(), media: mockMedia })
    expect(ctx.media).toBeDefined()
  })
})
