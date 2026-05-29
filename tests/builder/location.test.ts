import { describe, expect, it } from 'vitest'
import { buildLocationContent } from '../../src/builder/content/location.js'
import { ZaileysBuilderError } from '../../src/builder/errors.js'
import { type BuilderSocketLike, MessageBuilder } from '../../src/builder/builder.js'

type Captured = { jid: string; content: Record<string, unknown>; options: Record<string, unknown> }

const makeSocket = (): { socket: BuilderSocketLike; captured: () => Captured } => {
  let last: Captured | undefined
  const socket: BuilderSocketLike = {
    sendMessage: async (jid, content, options) => {
      last = {
        jid,
        content: content as unknown as Record<string, unknown>,
        options: (options ?? {}) as Record<string, unknown>,
      }
      return { key: { id: 'L1', remoteJid: jid, fromMe: true } } as never
    },
  }
  return {
    socket,
    captured: () => {
      if (!last) throw new Error('sendMessage was not called')
      return last
    },
  }
}

const loc = (c: Record<string, unknown>) =>
  (c.location as { degreesLatitude: number; degreesLongitude: number; name?: string; address?: string })

describe('buildLocationContent', () => {
  it('maps coordinates to degrees fields', () => {
    const content = buildLocationContent(-6.2, 106.8) as unknown as Record<string, unknown>
    expect(loc(content).degreesLatitude).toBe(-6.2)
    expect(loc(content).degreesLongitude).toBe(106.8)
  })

  it('propagates name and address', () => {
    const content = buildLocationContent(-6.2, 106.8, {
      name: 'Monas',
      address: 'Jakarta Pusat',
    }) as unknown as Record<string, unknown>
    expect(loc(content).name).toBe('Monas')
    expect(loc(content).address).toBe('Jakarta Pusat')
  })

  it('omits name/address when not given', () => {
    const content = buildLocationContent(0, 0) as unknown as Record<string, unknown>
    expect('name' in loc(content)).toBe(false)
    expect('address' in loc(content)).toBe(false)
  })

  it('accepts boundary coordinates', () => {
    expect(() => buildLocationContent(90, 180)).not.toThrow()
    expect(() => buildLocationContent(-90, -180)).not.toThrow()
  })

  it('throws on latitude above 90', () => {
    expect(() => buildLocationContent(91, 0)).toThrow(ZaileysBuilderError)
  })

  it('throws on longitude below -180', () => {
    expect(() => buildLocationContent(0, -181)).toThrow(ZaileysBuilderError)
  })

  it('throws INVALID_OPTIONS code on NaN latitude', () => {
    try {
      buildLocationContent(Number.NaN, 0)
      expect.unreachable()
    } catch (err) {
      expect((err as ZaileysBuilderError).code).toBe('INVALID_OPTIONS')
    }
  })

  it('sends location through builder terminal', async () => {
    const { socket, captured } = makeSocket()
    const key = await MessageBuilder.create(socket, '62811@s.whatsapp.net').location(-6.2, 106.8, { name: 'X' })
    expect(key.id).toBe('L1')
    expect(loc(captured().content).name).toBe('X')
  })

  it('chains with reply and mentions', async () => {
    const { socket, captured } = makeSocket()
    await MessageBuilder.create(socket, '62811@s.whatsapp.net')
      .location(1, 2)
      .reply({ id: 'Q', remoteJid: 'r', fromMe: false })
      .mentions(['62822@s.whatsapp.net'])
    expect(captured().options.quoted).toBeDefined()
    expect((captured().content.mentions as string[]).length).toBe(1)
  })
})
