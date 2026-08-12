import type { WAMessage, WAMessageKey } from 'baileys'
import { describe, expect, it, vi } from 'vitest'
import { MessageBuilder, type BuilderSocketLike } from '../../src/builder/builder.js'
import { RELAY_CONTENT_KEY } from '../../src/builder/content/buttons.js'

const RECIPIENT = '1@s.whatsapp.net'
const GROUP = '120363000000000000@g.us'
const SENT_KEY: WAMessageKey = { remoteJid: RECIPIENT, fromMe: true, id: 'MSG1' }

type ContextInfo = { mentionedJid?: string[]; nonJidMentions?: number; expiration?: number }
type RelayedNode = { contextInfo?: ContextInfo }
type Relayed = Record<string, RelayedNode> & {
  messageContextInfo?: { messageSecret?: Uint8Array }
}

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const relayMessage = vi.fn(async () => 'RELAY1')
  const socket: BuilderSocketLike = { sendMessage, relayMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, sendMessage, relayMessage }
}

const relayedOf = (relayMessage: ReturnType<typeof makeSocket>['relayMessage']): Relayed =>
  relayMessage.mock.calls[0]![1] as unknown as Relayed

const LIST_OPTS = {
  buttonText: 'Pilih',
  sections: [{ title: 'S', rows: [{ id: 'r1', title: 'Row 1' }] }],
}

const INVITE_OPTS = { jid: GROUP, code: 'ABC123', subject: 'Grup' }

describe('relay path applies builder context', () => {
  it('applies mentions to the unwrapped node of an interactive relay', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .buttons([{ id: 'b1', text: 'Go' }])
      .mentions(['628111@s.whatsapp.net'])
    expect(relayedOf(relayMessage)['interactiveMessage']?.contextInfo?.mentionedJid).toEqual([
      '628111@s.whatsapp.net',
    ])
  })

  it('applies mentions to a non-interactive relay (groupInvite)', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).groupInvite(INVITE_OPTS).mentions(['628222@s.whatsapp.net'])
    expect(relayedOf(relayMessage)['groupInviteMessage']?.contextInfo?.mentionedJid).toEqual([
      '628222@s.whatsapp.net',
    ])
  })

  it('applies mentionAll as nonJidMentions on a relay', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).list(LIST_OPTS).mentionAll()
    expect(relayedOf(relayMessage)['interactiveMessage']?.contextInfo?.nonJidMentions).toBe(1)
  })

  it('applies disappearing as contextInfo.expiration on a relay', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).groupInvite(INVITE_OPTS).disappearing(60)
    expect(relayedOf(relayMessage)['groupInviteMessage']?.contextInfo?.expiration).toBe(60)
  })

  it('keeps mentions, mentionAll and disappearing on one contextInfo', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT)
      .groupInvite(INVITE_OPTS)
      .mentions(['628333@s.whatsapp.net'])
      .mentionAll()
      .disappearing(120)
    const ctx = relayedOf(relayMessage)['groupInviteMessage']?.contextInfo
    expect(ctx?.mentionedJid).toEqual(['628333@s.whatsapp.net'])
    expect(ctx?.nonJidMentions).toBe(1)
    expect(ctx?.expiration).toBe(120)
  })

  it('does not set contextInfo fields when no modifier was used', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).groupInvite(INVITE_OPTS)
    const ctx = relayedOf(relayMessage)['groupInviteMessage']?.contextInfo
    expect(ctx?.mentionedJid ?? []).toEqual([])
    expect(ctx?.nonJidMentions ?? 0).toBe(0)
  })
})

describe('relay path message secret', () => {
  it('injects a 32-byte messageSecret at the top level', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).groupInvite(INVITE_OPTS)
    const secret = relayedOf(relayMessage).messageContextInfo?.messageSecret
    expect(secret).toBeDefined()
    expect(secret!.length).toBe(32)
  })

  it('injects a messageSecret for interactive relays too', async () => {
    const { socket, relayMessage } = makeSocket()
    await MessageBuilder.create(socket, RECIPIENT).buttons([{ id: 'b1', text: 'Go' }])
    expect(relayedOf(relayMessage).messageContextInfo?.messageSecret?.length).toBe(32)
  })

  it('does not overwrite a messageSecret the content already carries', async () => {
    const { socket, relayMessage } = makeSocket()
    const preset = new Uint8Array(32).fill(7)
    const builder = MessageBuilder.create(socket, RECIPIENT).groupInvite(INVITE_OPTS)
    const internal = (builder as unknown as { internal: { content: Record<string, unknown> } }).internal
    const inner = internal.content[RELAY_CONTENT_KEY] as Record<string, unknown>
    inner['messageContextInfo'] = { messageSecret: preset }
    await builder
    expect(relayedOf(relayMessage).messageContextInfo?.messageSecret).toEqual(preset)
  })
})
