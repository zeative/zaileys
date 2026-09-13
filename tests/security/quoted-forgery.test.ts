import { describe, expect, it } from 'vitest'
import type { WAMessage } from 'baileys'
import { decodeMessage } from '../../src/events/decoders/messages.js'
import type { DecodeContext } from '../../src/events/decoders/messages.js'

const SELF = '628000@s.whatsapp.net'
const ATTACKER = '628999@s.whatsapp.net'

const baseCtx = (over: Partial<DecodeContext> = {}): DecodeContext =>
  ({ selfJid: SELF, channelId: 'c', receiverId: SELF, prefixes: [], ...over }) as DecodeContext

/** A DM from the attacker quoting a message they invented, with no participant set. */
const forgedDm = (): WAMessage =>
  ({
    key: { id: 'ATK1', remoteJid: ATTACKER, fromMe: false },
    messageTimestamp: 1,
    pushName: 'Mallory',
    message: {
      extendedTextMessage: {
        text: 'ok',
        contextInfo: {
          stanzaId: 'FAKE-ID-NEVER-SENT',
          quotedMessage: { conversation: 'CONFIRM: transfer approved' },
        },
      },
    },
  }) as unknown as WAMessage

/** Same, but in a group where the attacker names the bot as the quoted author. */
const forgedGroup = (): WAMessage =>
  ({
    key: { id: 'ATK2', remoteJid: '123@g.us', fromMe: false, participant: ATTACKER },
    messageTimestamp: 1,
    pushName: 'Mallory',
    message: {
      extendedTextMessage: {
        text: 'ok',
        contextInfo: {
          stanzaId: 'FAKE-ID-2',
          participant: SELF,
          quotedMessage: { conversation: 'CONFIRM: transfer approved' },
        },
      },
    },
  }) as unknown as WAMessage

describe('forged quoted messages', () => {
  it('marks a DM quote rebuilt from contextInfo as unverified', async () => {
    const ctx = decodeMessage(forgedDm(), baseCtx())
    expect(ctx).not.toBeNull()
    const quoted = await ctx!.replied()
    expect(quoted).not.toBeNull()
    expect(quoted!.verified).toBe(false)
  })

  it('marks a group quote naming the bot as unverified', async () => {
    const ctx = decodeMessage(forgedGroup(), baseCtx())
    const quoted = await ctx!.replied()
    expect(quoted).not.toBeNull()
    expect(quoted!.verified).toBe(false)
  })

  it('reports a quote resolved from the store as verified', async () => {
    const stored = {
      key: { id: 'REAL', remoteJid: ATTACKER, fromMe: true },
      messageTimestamp: 1,
      message: { conversation: 'the real thing' },
    } as unknown as WAMessage
    const msg = forgedDm()
    const ctx = decodeMessage(msg, baseCtx({ resolveQuoted: async () => stored }))
    const quoted = await ctx!.replied()
    expect(quoted).not.toBeNull()
    expect(quoted!.verified).toBe(true)
    expect(quoted!.text).toBe('the real thing')
  })

  it('the top-level inbound message is always verified', () => {
    const ctx = decodeMessage(forgedDm(), baseCtx())
    expect(ctx!.verified).toBe(true)
  })
})
