import { describe, expect, it } from 'vitest'
import { proto } from 'baileys'
import type { WAMessage } from 'baileys'
import { dropSpoofedSelfOnly, SELF_ONLY_PROTOCOL_TYPES } from '../../src/events/guards.js'

const T = proto.Message.ProtocolMessage.Type

const protocolMsg = (type: number, fromMe: boolean): WAMessage =>
  ({
    key: { id: 'X', remoteJid: '628999@s.whatsapp.net', fromMe, participant: '628999@s.whatsapp.net' },
    message: { protocolMessage: { type } },
  }) as unknown as WAMessage

const plainMsg = (): WAMessage =>
  ({
    key: { id: 'P', remoteJid: '628999@s.whatsapp.net', fromMe: false },
    message: { conversation: 'hello' },
  }) as unknown as WAMessage

const upsert = (messages: WAMessage[], requestId?: string) =>
  ({ messages, type: 'notify' as const, ...(requestId === undefined ? {} : { requestId }) })

describe('dropSpoofedSelfOnly', () => {
  it.each(SELF_ONLY_PROTOCOL_TYPES)('drops a spoofed %s from a remote sender', (name) => {
    const type = T[name as keyof typeof T] as number
    const out = dropSpoofedSelfOnly(upsert([protocolMsg(type, false)]))
    expect(out.messages).toHaveLength(0)
  })

  it.each(SELF_ONLY_PROTOCOL_TYPES)('keeps a genuine %s from our own device', (name) => {
    const type = T[name as keyof typeof T] as number
    const out = dropSpoofedSelfOnly(upsert([protocolMsg(type, true)]))
    expect(out.messages).toHaveLength(1)
  })

  it('leaves ordinary inbound messages alone', () => {
    const out = dropSpoofedSelfOnly(upsert([plainMsg()]))
    expect(out.messages).toHaveLength(1)
  })

  it('keeps a non-self-only protocol message from a remote sender (e.g. REVOKE)', () => {
    const out = dropSpoofedSelfOnly(upsert([protocolMsg(T.REVOKE as number, false)]))
    expect(out.messages).toHaveLength(1)
  })

  it('drops only the spoofed entry, not the whole batch', () => {
    const out = dropSpoofedSelfOnly(
      upsert([plainMsg(), protocolMsg(T.APP_STATE_SYNC_KEY_SHARE as number, false), plainMsg()]),
    )
    expect(out.messages).toHaveLength(2)
  })

  it('a remote sender cannot suppress delivery with a requestId stub parameter', () => {
    const msg = plainMsg() as unknown as { messageStubParameters: string[] }
    msg.messageStubParameters = ['requestId:abc']
    const out = dropSpoofedSelfOnly(upsert([msg as unknown as WAMessage]))
    expect(out.messages).toHaveLength(1)
  })

  it('still drops our own peer-data response batch', () => {
    const out = dropSpoofedSelfOnly(upsert([plainMsg()], 'req-1'))
    expect(out.messages).toHaveLength(0)
  })
})
