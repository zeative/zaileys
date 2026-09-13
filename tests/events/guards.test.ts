import { describe, expect, it } from 'vitest'
import type { WAMessage } from 'baileys'
import { dropSpoofedSelfOnly, type UpsertPayload } from '../../src/events/guards.js'

const msg = (overrides: Partial<WAMessage> = {}): WAMessage =>
  ({ key: { id: 'm1' }, ...overrides }) as WAMessage

const payload = (messages: WAMessage[], extra: Partial<UpsertPayload> = {}): UpsertPayload => ({
  messages,
  type: 'notify',
  ...extra,
})

describe('dropSpoofedSelfOnly', () => {
  it('G1: drops every message when the upsert carries a requestId', () => {
    const out = dropSpoofedSelfOnly(payload([msg(), msg()], { requestId: 'req-1' }))
    expect(out.messages).toEqual([])
  })

  it('G2: keeps messages when requestId is absent', () => {
    const messages = [msg(), msg()]
    const out = dropSpoofedSelfOnly(payload(messages))
    expect(out.messages).toHaveLength(2)
  })

  it('G3: treats an explicit undefined requestId as absent', () => {
    const out = dropSpoofedSelfOnly(payload([msg()], { requestId: undefined }))
    expect(out.messages).toHaveLength(1)
  })

  it('G4: drops our own message carrying a requestId stub marker', () => {
    const ours = msg({ key: { id: 'own', fromMe: true }, messageStubParameters: ['requestId:abc'] })
    const clean = msg({ messageStubParameters: ['someOther:value'] })
    const out = dropSpoofedSelfOnly(payload([ours, clean]))
    expect(out.messages).toEqual([clean])
  })

  it('G4b: a remote sender cannot suppress their own delivery with that marker', () => {
    const remote = msg({ key: { id: 'remote', fromMe: false }, messageStubParameters: ['requestId:abc'] })
    const out = dropSpoofedSelfOnly(payload([remote]))
    expect(out.messages).toEqual([remote])
  })

  it('G5: keeps a message when stubParameters is not an array', () => {
    const out = dropSpoofedSelfOnly(payload([msg({ messageStubParameters: undefined })]))
    expect(out.messages).toHaveLength(1)
  })

  it('G6: ignores non-string stub parameter entries', () => {
    const out = dropSpoofedSelfOnly(
      payload([msg({ messageStubParameters: [null as never, 42 as never] })]),
    )
    expect(out.messages).toHaveLength(1)
  })

  it('G7: keeps a message whose stub string does not start with requestId:', () => {
    const out = dropSpoofedSelfOnly(
      payload([msg({ messageStubParameters: ['xrequestId:abc'] })]),
    )
    expect(out.messages).toHaveLength(1)
  })

  it('G8: returns a shallow-copied payload, not the original reference', () => {
    const original = payload([msg()])
    const out = dropSpoofedSelfOnly(original)
    expect(out).not.toBe(original)
    expect(out.type).toBe('notify')
  })

  it('G9: preserves requestId field on the returned payload', () => {
    const out = dropSpoofedSelfOnly(payload([msg()], { requestId: 'req-9' }))
    expect(out.requestId).toBe('req-9')
  })
})
