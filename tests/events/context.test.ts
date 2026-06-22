import { describe, expect, it, vi } from 'vitest'

vi.mock('baileys', async (importOriginal) => {
  const actual = await importOriginal<typeof import('baileys')>()
  return { ...actual }
})

const {
  extractLinks,
  computeUniqueId,
  computeStaticId,
  epochSecondsToMs,
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
    expect(id).toMatch(/^[0-9A-F]+$/)
    expect(id.length).toBeGreaterThan(0)
  })

  it('handles undefined key fields gracefully', () => {
    const id = computeUniqueId({ remoteJid: undefined, id: undefined, fromMe: undefined })
    expect(typeof id).toBe('string')
  })

  it('emits a 16-char hex id', () => {
    expect(computeUniqueId({ remoteJid: 'r', id: 'i', fromMe: false })).toMatch(/^[0-9A-F]{16}$/)
  })
})

describe('computeStaticId', () => {
  it('is stable for the same room+sender pair regardless of message', () => {
    const a = computeStaticId('628room@s.whatsapp.net', '628me@s.whatsapp.net')
    const b = computeStaticId('628room@s.whatsapp.net', '628me@s.whatsapp.net')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9A-F]{16}$/)
  })

  it('differs when room or sender differs', () => {
    const base = computeStaticId('room@g.us', 'a@s.whatsapp.net')
    expect(base).not.toBe(computeStaticId('room@g.us', 'b@s.whatsapp.net'))
    expect(base).not.toBe(computeStaticId('other@g.us', 'a@s.whatsapp.net'))
  })
})

describe('epochSecondsToMs', () => {
  const SECS = 1782132231
  it('converts a number (seconds) to ms', () => {
    expect(epochSecondsToMs(SECS)).toBe(SECS * 1000)
  })
  it('parses string seconds', () => {
    expect(epochSecondsToMs(String(SECS))).toBe(SECS * 1000)
  })
  it('handles Long-like with toNumber', () => {
    expect(epochSecondsToMs({ toNumber: () => SECS })).toBe(SECS * 1000)
  })
  it('handles serialized Long {low, high}', () => {
    expect(epochSecondsToMs({ low: SECS, high: 0 })).toBe(SECS * 1000)
  })
  it('returns 0 for missing/invalid', () => {
    expect(epochSecondsToMs(undefined)).toBe(0)
    expect(epochSecondsToMs(0)).toBe(0)
    expect(epochSecondsToMs('nope')).toBe(0)
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

  const withMessage = (m: Record<string, unknown>) => ({
    ...baseInput(),
    message: { key: MSG_KEY, messageTimestamp: 1700000000, pushName: 'Alice', message: m } as never,
  })

  it('isDeleted when protocolMessage is REVOKE', () => {
    expect(buildMessageContext(withMessage({ protocolMessage: { type: 0 } })).isDeleted).toBe(true)
  })

  it('isEdited from MESSAGE_EDIT protocol or editedMessage wrapper', () => {
    expect(buildMessageContext(withMessage({ protocolMessage: { type: 14 } })).isEdited).toBe(true)
    expect(buildMessageContext(withMessage({ editedMessage: { message: {} } })).isEdited).toBe(true)
  })

  it('isPinned / isUnPinned from pinInChatMessage type', () => {
    expect(buildMessageContext(withMessage({ pinInChatMessage: { type: 1 } })).isPinned).toBe(true)
    expect(buildMessageContext(withMessage({ pinInChatMessage: { type: 2 } })).isUnPinned).toBe(true)
  })

  it('isBot when messageContextInfo carries botMetadata', () => {
    expect(buildMessageContext(withMessage({ conversation: 'hi', messageContextInfo: { botMetadata: { botName: 'x' } } })).isBot).toBe(true)
  })

  it('isStatusMention / isGroupStatusMention from message fields', () => {
    expect(buildMessageContext(withMessage({ statusMentionMessage: {} })).isStatusMention).toBe(true)
    expect(buildMessageContext(withMessage({ groupStatusMentionMessage: {} })).isGroupStatusMention).toBe(true)
  })

  it('isStory when remoteJid is status@broadcast', () => {
    const key = { remoteJid: 'status@broadcast', id: 'S1', fromMe: false }
    const ctx = buildMessageContext({ ...baseInput(), key, message: { key, messageTimestamp: 1700000000, message: { conversation: 'hi' } } as never })
    expect(ctx.isStory).toBe(true)
  })

  it('isHideTags when mentions exist but text has no @number', () => {
    expect(buildMessageContext({ ...baseInput(), text: 'halo semua', mentions: ['628999@s.whatsapp.net'] }).isHideTags).toBe(true)
    expect(buildMessageContext({ ...baseInput(), text: 'halo @628999', mentions: ['628999@s.whatsapp.net'] }).isHideTags).toBe(false)
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
