import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'

const SELF = '628000@s.whatsapp.net'

const fromLid = (i: number, lid: string): WAMessage =>
  ({
    key: { id: `P${i}`, remoteJid: '120363@g.us', fromMe: false, participant: lid },
    messageTimestamp: i,
    message: { conversation: `hello ${i}` },
  }) as unknown as WAMessage

const boot = (opts: {
  resolve: (lid: string) => Promise<string | null>
  maxPendingResolutions?: number
  maxQueuedResolutions?: number
}) => {
  const ev = new EventEmitter()
  ev.setMaxListeners(0)
  const emitter = new TypedEventEmitter<ClientEventMap>()
  const senders: string[] = []
  emitter.on('message', (ctx: { senderId: string }) => {
    senders.push(ctx.senderId)
  })
  const warn = vi.fn()
  const handle = attachInboundPipeline(emitter as never, { ev, user: { id: SELF } } as never, {
    selfJid: SELF,
    channelId: 'bp',
    receiverId: SELF,
    prefixes: [],
    logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
    resolveLidToPn: opts.resolve,
    ...(opts.maxPendingResolutions !== undefined ? { maxPendingResolutions: opts.maxPendingResolutions } : {}),
    ...(opts.maxQueuedResolutions !== undefined ? { maxQueuedResolutions: opts.maxQueuedResolutions } : {}),
  } as never)
  return { ev, senders, warn, handle }
}

describe('inbound backpressure', () => {
  it('shares one in-flight lookup per LID instead of repeating it for every message', async () => {
    const resolve = vi.fn(async (lid: string) => {
      await new Promise((r) => setTimeout(r, 30))
      return lid.replace('@lid', '@s.whatsapp.net')
    })
    const { ev, senders, handle } = boot({ resolve })
    for (let i = 0; i < 200; i += 1) {
      ev.emit('messages.upsert', { type: 'notify', messages: [fromLid(i, '7001@lid')] })
    }
    await vi.waitFor(() => expect(senders).toHaveLength(200), { timeout: 5000 })
    expect(resolve.mock.calls.filter(([l]) => l === '7001@lid')).toHaveLength(1)
    handle.detach()
  })

  it('bounds messages waiting on resolution and sheds the overflow with a warning', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const resolve = vi.fn(async (lid: string) => {
      await gate
      return lid.replace('@lid', '@s.whatsapp.net')
    })
    const { ev, senders, warn, handle } = boot({ resolve, maxPendingResolutions: 10, maxQueuedResolutions: 20 })
    for (let i = 0; i < 100; i += 1) {
      ev.emit('messages.upsert', { type: 'notify', messages: [fromLid(i, `${8000 + i}@lid`)] })
    }
    await new Promise((r) => setTimeout(r, 20))
    const senderLookups = resolve.mock.calls.filter(([l]) => /^80\d\d@lid$/.test(l as string)).length
    expect(senderLookups).toBeLessThanOrEqual(10)
    release()
    await vi.waitFor(() => expect(senders).toHaveLength(30), { timeout: 5000 })
    await new Promise((r) => setTimeout(r, 50))
    expect(senders).toHaveLength(30)
    expect(warn.mock.calls.some(([, msg]) => /shed/i.test(String(msg)))).toBe(true)
    handle.detach()
  })

  it('never delivers an overflowed message with an unresolved identity', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const resolve = async (lid: string): Promise<string> => {
      await gate
      return lid.replace('@lid', '@s.whatsapp.net')
    }
    const { ev, senders, handle } = boot({ resolve, maxPendingResolutions: 5, maxQueuedResolutions: 5 })
    for (let i = 0; i < 60; i += 1) {
      ev.emit('messages.upsert', { type: 'notify', messages: [fromLid(i, `${9100 + i}@lid`)] })
    }
    release()
    await vi.waitFor(() => expect(senders.length).toBeGreaterThan(0), { timeout: 5000 })
    await new Promise((r) => setTimeout(r, 100))
    expect(senders.every((s) => s.endsWith('@s.whatsapp.net'))).toBe(true)
    handle.detach()
  })
})

describe('inbound backpressure — tiered resolution', () => {
  it('under pressure a queued message still resolves its sender but skips mention lookups', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const looked: string[] = []
    const resolve = async (lid: string): Promise<string> => {
      looked.push(lid)
      await gate
      return lid.replace('@lid', '@s.whatsapp.net')
    }
    const { ev, senders, handle } = boot({ resolve, maxPendingResolutions: 1, maxQueuedResolutions: 10 })
    const withMentions = (i: number, sender: string): WAMessage =>
      ({
        key: { id: `M${i}`, remoteJid: '120363@g.us', fromMe: false, participant: sender },
        messageTimestamp: i,
        message: {
          extendedTextMessage: {
            text: 'hi',
            contextInfo: { mentionedJid: [`${5500 + i}@lid`, `${5600 + i}@lid`] },
          },
        },
      }) as unknown as WAMessage
    ev.emit('messages.upsert', { type: 'notify', messages: [withMentions(0, '4000@lid')] })
    ev.emit('messages.upsert', { type: 'notify', messages: [withMentions(1, '4001@lid')] })
    release()
    await vi.waitFor(() => expect(senders).toHaveLength(2), { timeout: 5000 })
    expect(senders).toEqual(['4000@s.whatsapp.net', '4001@s.whatsapp.net'])
    expect(looked).toContain('5500@lid')
    expect(looked).toContain('4001@lid')
    expect(looked).not.toContain('5501@lid')
    expect(looked).not.toContain('5601@lid')
    handle.detach()
  })
})

describe('inbound backpressure — legitimate catch-up', () => {
  it('delivers a 10k-message reconnect catch-up with a slow resolver, identities resolved', async () => {
    const resolve = async (lid: string): Promise<string> => {
      await new Promise((r) => setTimeout(r, 50))
      return lid.replace('@lid', '@s.whatsapp.net')
    }
    const { ev, senders, warn, handle } = boot({ resolve })
    for (let i = 0; i < 10_000; i += 1) {
      ev.emit('messages.upsert', { type: 'notify', messages: [fromLid(i, `${60000 + (i % 500)}@lid`)] })
      if (i % 200 === 0) await new Promise((r) => setImmediate(r))
    }
    await vi.waitFor(() => expect(senders).toHaveLength(10_000), { timeout: 20_000, interval: 100 })
    expect(senders.every((s) => s.endsWith('@s.whatsapp.net'))).toBe(true)
    expect(warn.mock.calls.some(([, msg]) => /shed/i.test(String(msg)))).toBe(false)
    handle.detach()
  }, 30_000)

  it('still sheds a mention bomb flood long before it exhausts memory', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const resolve = async (lid: string): Promise<string> => {
      await gate
      return lid.replace('@lid', '@s.whatsapp.net')
    }
    const { ev, senders, warn, handle } = boot({ resolve, maxPendingResolutions: 4, maxQueuedResolutions: 200 })
    for (let i = 0; i < 1_000; i += 1) {
      ev.emit('messages.upsert', {
        type: 'notify',
        messages: [
          {
            key: { id: `Z${i}`, remoteJid: '120363@g.us', fromMe: false, participant: `${30000 + i}@lid` },
            messageTimestamp: i,
            message: {
              extendedTextMessage: {
                text: 'x',
                contextInfo: { mentionedJid: Array.from({ length: 2_000 }, (_, m) => `${40000 + m}@lid`) },
              },
            },
          } as unknown as WAMessage,
        ],
      })
    }
    release()
    await new Promise((r) => setTimeout(r, 300))
    expect(senders.length).toBeLessThan(20)
    expect(warn.mock.calls.some(([, msg]) => /shed/i.test(String(msg)))).toBe(true)
    handle.detach()
  })
})
