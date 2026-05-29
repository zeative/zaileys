import { proto } from 'baileys'
import type { WAMessageKey } from 'baileys'
import { describe, expect, it } from 'vitest'
import {
  decodeDelete,
  decodeEdit,
  decodePollVote,
  decodeReaction,
  type MutationContext,
  type ReactionItem,
} from '../../../src/events/decoders/mutations.js'

const ctx = (selfJid = '0@s.whatsapp.net'): MutationContext => ({ selfJid })

const key = (over: Partial<WAMessageKey> = {}): WAMessageKey => ({
  remoteJid: '111@s.whatsapp.net',
  fromMe: false,
  id: 'TARGET',
  ...over,
})

const reactionItem = (over: Partial<ReactionItem> = {}): ReactionItem => ({
  key: key({ id: 'ITEM' }),
  reaction: { key: key(), text: '👍', senderTimestampMs: 1700 },
  ...over,
})

describe('decodeReaction', () => {
  it('decodes a reaction with an emoji', () => {
    const out = decodeReaction(reactionItem(), ctx())
    expect(out).not.toBeNull()
    expect(out?.emoji).toBe('👍')
    expect(out?.key.id).toBe('TARGET')
    expect(out?.timestamp).toBe(1700)
    expect(out?.sender.jid).toBe('111@s.whatsapp.net')
  })

  it('treats an empty reaction text as an unreact (null emoji)', () => {
    const out = decodeReaction(
      reactionItem({ reaction: { key: key(), text: '', senderTimestampMs: 10 } }),
      ctx(),
    )
    expect(out?.emoji).toBeNull()
  })

  it('returns null when reaction.key is missing', () => {
    const out = decodeReaction(
      reactionItem({ reaction: { text: '😀', senderTimestampMs: 10 } }),
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('resolves the participant in a group reaction', () => {
    const out = decodeReaction(
      reactionItem({
        key: key({ remoteJid: '120@g.us', participant: '222@s.whatsapp.net', id: 'ITEM' }),
        reaction: { key: key({ remoteJid: '120@g.us' }), text: '🔥', senderTimestampMs: 5 },
      }),
      ctx(),
    )
    expect(out?.sender.jid).toBe('222@s.whatsapp.net')
  })

  it('flags a self-react via fromMe on the reactor key', () => {
    const out = decodeReaction(
      reactionItem({
        key: key({ fromMe: true, id: 'ITEM' }),
        reaction: { key: key(), text: '❤️', senderTimestampMs: 7 },
      }),
      ctx(),
    )
    expect(out?.sender.isMe).toBe(true)
  })

  it('defaults timestamp to 0 when senderTimestampMs is absent', () => {
    const out = decodeReaction(
      reactionItem({ reaction: { key: key(), text: '👍' } }),
      ctx(),
    )
    expect(out?.timestamp).toBe(0)
  })

  it('returns null when the whole item is malformed', () => {
    expect(decodeReaction({ key: undefined, reaction: {} } as ReactionItem, ctx())).toBeNull()
  })
})

const editUpdate = (over: Record<string, unknown> = {}) => ({
  key: key({ fromMe: true }),
  update: {
    messageTimestamp: 1800,
    message: {
      protocolMessage: {
        type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
        key: key({ id: 'ORIGINAL' }),
        editedMessage: { conversation: 'edited text' },
      },
    },
    ...over,
  },
})

describe('decodeEdit', () => {
  it('decodes an edited text message', () => {
    const out = decodeEdit(editUpdate(), ctx())
    expect(out).not.toBeNull()
    expect(out?.newContent).toBe('edited text')
    expect(out?.key.id).toBe('ORIGINAL')
    expect(out?.editedAt).toBe(1800)
  })

  it('decodes an edited caption from an inner media message', () => {
    const out = decodeEdit(
      editUpdate({
        message: {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            key: key({ id: 'ORIGINAL' }),
            editedMessage: { imageMessage: { caption: 'new caption' } },
          },
        },
      }),
      ctx(),
    )
    expect(out?.newContent).toBe('new caption')
  })

  it('decodes an edited extended text message', () => {
    const out = decodeEdit(
      editUpdate({
        message: {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            key: key({ id: 'ORIGINAL' }),
            editedMessage: { extendedTextMessage: { text: 'ext edit' } },
          },
        },
      }),
      ctx(),
    )
    expect(out?.newContent).toBe('ext edit')
  })

  it('returns null when protocolMessage is absent', () => {
    expect(decodeEdit({ key: key(), update: { message: {} } }, ctx())).toBeNull()
  })

  it('returns null when the protocol type is not MESSAGE_EDIT', () => {
    const out = decodeEdit(
      editUpdate({
        message: {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.REVOKE,
            key: key({ id: 'ORIGINAL' }),
          },
        },
      }),
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('returns null when the protocolMessage key is missing', () => {
    const out = decodeEdit(
      editUpdate({
        message: {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            editedMessage: { conversation: 'x' },
          },
        },
      }),
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('returns empty content when the edited message carries no text', () => {
    const out = decodeEdit(
      editUpdate({
        message: {
          protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
            key: key({ id: 'ORIGINAL' }),
            editedMessage: {},
          },
        },
      }),
      ctx(),
    )
    expect(out?.newContent).toBe('')
  })
})

const revokeUpdate = (keyOver: Partial<WAMessageKey> = {}, selfJid = '0@s.whatsapp.net') => ({
  key: key(keyOver),
  update: {
    messageTimestamp: 1900,
    message: {
      protocolMessage: {
        type: proto.Message.ProtocolMessage.Type.REVOKE,
        key: key({ id: 'REVOKED' }),
      },
    },
  },
  selfJid,
})

describe('decodeDelete', () => {
  it('decodes a revoke-for-everyone in a chat with someone else', () => {
    const out = decodeDelete(revokeUpdate({ remoteJid: '111@s.whatsapp.net' }), ctx())
    expect(out).not.toBeNull()
    expect(out?.deletedFor).toBe('everyone')
    expect(out?.key.id).toBe('REVOKED')
    expect(out?.timestamp).toBe(1900)
  })

  it("decodes a revoke-for-me in the user's self chat", () => {
    const self = '0@s.whatsapp.net'
    const out = decodeDelete(
      {
        key: key({ remoteJid: self, fromMe: true }),
        update: {
          messageTimestamp: 5,
          message: {
            protocolMessage: {
              type: proto.Message.ProtocolMessage.Type.REVOKE,
              key: key({ id: 'REVOKED', remoteJid: self }),
            },
          },
        },
      },
      ctx(self),
    )
    expect(out?.deletedFor).toBe('me')
  })

  it('decodes a group revoke as everyone', () => {
    const out = decodeDelete(
      revokeUpdate({ remoteJid: '120@g.us', participant: '222@s.whatsapp.net' }),
      ctx(),
    )
    expect(out?.deletedFor).toBe('everyone')
  })

  it('returns null when protocolMessage is absent', () => {
    expect(decodeDelete({ key: key(), update: { message: {} } }, ctx())).toBeNull()
  })

  it('returns null on a non-revoke protocol type', () => {
    const out = decodeDelete(
      {
        key: key(),
        update: {
          message: {
            protocolMessage: {
              type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
              key: key({ id: 'X' }),
            },
          },
        },
      },
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('returns null when the revoked key is missing', () => {
    const out = decodeDelete(
      {
        key: key(),
        update: {
          message: {
            protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE },
          },
        },
      },
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('returns null for a plain text update with no delete payload', () => {
    expect(
      decodeDelete({ key: key(), update: { status: 3 } }, ctx()),
    ).toBeNull()
  })
})

const hex = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s, 'hex'))

const pollUpdate = (over: Record<string, unknown> = {}) => ({
  key: key({ fromMe: false }),
  update: {
    messageTimestamp: 2000,
    pollUpdates: [
      {
        pollUpdateMessageKey: key({ id: 'POLL' }),
        vote: { selectedOptions: [hex('aabb'), hex('ccdd')] },
        senderTimestampMs: 2000,
      },
    ],
    ...over,
  },
})

describe('decodePollVote', () => {
  it('decodes a single-choice vote into hex option strings', () => {
    const out = decodePollVote(
      pollUpdate({
        pollUpdates: [
          {
            pollUpdateMessageKey: key({ id: 'POLL' }),
            vote: { selectedOptions: [hex('aabb')] },
            senderTimestampMs: 2000,
          },
        ],
      }),
      ctx(),
    )
    expect(out).not.toBeNull()
    expect(out?.selectedOptions).toEqual(['aabb'])
    expect(out?.pollKey.id).toBe('POLL')
    expect(out?.timestamp).toBe(2000)
  })

  it('decodes a multi-choice vote', () => {
    const out = decodePollVote(pollUpdate(), ctx())
    expect(out?.selectedOptions).toEqual(['aabb', 'ccdd'])
  })

  it('decodes an abstain (empty selectedOptions) vote', () => {
    const out = decodePollVote(
      pollUpdate({
        pollUpdates: [
          {
            pollUpdateMessageKey: key({ id: 'POLL' }),
            vote: { selectedOptions: [] },
            senderTimestampMs: 2000,
          },
        ],
      }),
      ctx(),
    )
    expect(out?.selectedOptions).toEqual([])
  })

  it('decodes a poll vote arriving via inner pollUpdateMessage (encrypted vote, options deferred)', () => {
    const out = decodePollVote(
      {
        key: key({ remoteJid: '120@g.us', participant: '222@s.whatsapp.net' }),
        update: {
          messageTimestamp: 30,
          message: {
            pollUpdateMessage: {
              pollCreationMessageKey: key({ id: 'POLL2' }),
              vote: { encPayload: hex('dead'), encIv: hex('beef') },
              senderTimestampMs: 30,
            },
          },
        },
      },
      ctx(),
    )
    expect(out?.pollKey.id).toBe('POLL2')
    expect(out?.selectedOptions).toEqual([])
    expect(out?.voter.jid).toBe('222@s.whatsapp.net')
  })

  it('returns null when no poll update is present', () => {
    expect(decodePollVote({ key: key(), update: { status: 2 } }, ctx())).toBeNull()
  })

  it('returns null when the poll key is missing', () => {
    const out = decodePollVote(
      pollUpdate({
        pollUpdates: [{ vote: { selectedOptions: [hex('aa')] }, senderTimestampMs: 1 }],
      }),
      ctx(),
    )
    expect(out).toBeNull()
  })

  it('falls back to messageTimestamp when senderTimestampMs is absent', () => {
    const out = decodePollVote(
      pollUpdate({
        pollUpdates: [{ pollUpdateMessageKey: key({ id: 'POLL' }), vote: { selectedOptions: [] } }],
      }),
      ctx(),
    )
    expect(out?.timestamp).toBe(2000)
  })
})
