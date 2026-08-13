import { describe, expect, it, vi } from 'vitest'
import type { MiscMessageGenerationOptions, WAMessage } from 'baileys'
import { MessageBuilder, STATUS_BROADCAST_JID } from '../../src/builder/builder.js'
import type { BuilderSocketLike } from '../../src/builder/builder.js'

const SENT_KEY = { remoteJid: STATUS_BROADCAST_JID, id: 'S1', fromMe: true }
const VIEWER = '628111@s.whatsapp.net'
const OTHER = '628222@s.whatsapp.net'

const makeSocket = () => {
  const sendMessage = vi.fn(async () => ({ key: SENT_KEY }) as WAMessage)
  const socket: BuilderSocketLike = { sendMessage, user: { id: '9@s.whatsapp.net' } }
  return { socket, sendMessage }
}

const optionsOf = (sendMessage: ReturnType<typeof makeSocket>['sendMessage']): MiscMessageGenerationOptions =>
  (sendMessage.mock.calls[0] as unknown as [string, unknown, MiscMessageGenerationOptions])[2]

const expectRejects = async (p: Promise<unknown>, code: string): Promise<void> => {
  await expect(p).rejects.toMatchObject({ code })
}

describe('personal status (status@broadcast)', () => {
  it('sends a text status to the jids listed as the audience', async () => {
    const { socket, sendMessage } = makeSocket()
    const key = await MessageBuilder.create(socket, STATUS_BROADCAST_JID).text('halo').audience([VIEWER])
    expect(key).toEqual(SENT_KEY)
    const [jid, content] = sendMessage.mock.calls[0] as unknown as [string, { text: string }]
    expect(jid).toBe(STATUS_BROADCAST_JID)
    expect(content.text).toBe('halo')
    expect(optionsOf(sendMessage).statusJidList).toEqual([VIEWER])
  })

  it('sends a media status through the same path', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, STATUS_BROADCAST_JID)
      .image(Buffer.from('jpegbytes'), { caption: 'hi' })
      .audience([VIEWER])
    const [, content] = sendMessage.mock.calls[0] as unknown as [string, { image: Buffer; caption?: string }]
    expect(Buffer.isBuffer(content.image)).toBe(true)
    expect(content.caption).toBe('hi')
    expect(optionsOf(sendMessage).statusJidList).toEqual([VIEWER])
  })

  it('merges and de-duplicates audiences across calls', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, STATUS_BROADCAST_JID).text('halo').audience([VIEWER]).audience([VIEWER, OTHER])
    expect(optionsOf(sendMessage).statusJidList).toEqual([VIEWER, OTHER])
  })

  it('refuses a status with no audience, which WhatsApp would silently show to nobody', async () => {
    const { socket, sendMessage } = makeSocket()
    await expectRejects(MessageBuilder.create(socket, STATUS_BROADCAST_JID).text('halo'), 'INVALID_OPTIONS')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('rejects an empty audience list up front', () => {
    const { socket } = makeSocket()
    expect(() => MessageBuilder.create(socket, STATUS_BROADCAST_JID).text('halo').audience([])).toThrowError(
      /at least one jid/,
    )
  })

  it('rejects a malformed jid in the audience', () => {
    const { socket } = makeSocket()
    expect(() => MessageBuilder.create(socket, STATUS_BROADCAST_JID).text('halo').audience(['nope'])).toThrowError(
      /invalid jid/,
    )
  })

  it('refuses audience() on an ordinary chat, where it would be silently ignored', async () => {
    const { socket, sendMessage } = makeSocket()
    await expectRejects(MessageBuilder.create(socket, OTHER).text('halo').audience([VIEWER]), 'INVALID_RECIPIENT')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('leaves statusJidList off an ordinary message entirely', async () => {
    const { socket, sendMessage } = makeSocket()
    await MessageBuilder.create(socket, OTHER).text('halo')
    expect(optionsOf(sendMessage)).not.toHaveProperty('statusJidList')
  })
})
