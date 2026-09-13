import { describe, expect, it, vi } from 'vitest'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../src/events/pipeline.js'
import { createMockSocket } from '../_helpers/mock-socket.js'
import { TypedEventEmitter } from '../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../src/client/types.js'
import { extractLinks } from '../../src/events/context.js'
import { buildAIRichContent } from '../../src/builder/content/airich.js'
import { MemoryMessageStore } from '../../src/store/adapters/memory.js'
import { MemoryAuthStore } from '../../src/auth/adapters/memory.js'
import { checkGuards, resetCooldowns } from '../../src/command/guards.js'
import { appendFileSync } from 'node:fs'

const METRICS = process.env['STRESS_METRICS_FILE']
const metric = (line: string): void => {
  if (METRICS !== undefined) appendFileSync(METRICS, line + '\n')
}

const SELF = '628000@s.whatsapp.net'

const inbound = (i: number): WAMessage =>
  ({
    key: { id: `M${i}`, remoteJid: `628${100000 + (i % 5000)}@s.whatsapp.net`, fromMe: false },
    messageTimestamp: 1700000000 + i,
    pushName: `User${i % 100}`,
    message: { conversation: `hello number ${i} http://example.com/${i}` },
  }) as unknown as WAMessage

const heapMb = (): number => {
  global.gc?.()
  return process.memoryUsage().heapUsed / 1024 / 1024
}

describe('stress: long-lived inbound traffic', () => {
  it('processes 20k messages from 5k distinct senders without unbounded growth', async () => {
    const sock = createMockSocket({ user: { id: SELF } })
    const emitter = new TypedEventEmitter<ClientEventMap>()
    let seen = 0
    emitter.on('message', () => {
      seen += 1
    })
    const handle = attachInboundPipeline(emitter as never, sock as never, {
      selfJid: SELF,
      channelId: 'c',
      receiverId: SELF,
      prefixes: ['!'],
    } as never)

    const before = heapMb()
    for (let i = 0; i < 20_000; i += 1) {
      sock.ev.emit('messages.upsert', { type: 'notify', messages: [inbound(i)] })
    }
    await new Promise((r) => setTimeout(r, 200))
    const after = heapMb()

    metric(`soak: ${seen} messages, heap ${before.toFixed(1)} -> ${after.toFixed(1)} MB (delta ${(after - before).toFixed(1)} MB)`)
    expect(seen).toBeGreaterThan(19_000)
    expect(after - before).toBeLessThan(400)
    handle.detach()
  }, 120_000)

  it('detaching the pipeline removes every listener it added', () => {
    const sock = createMockSocket({ user: { id: SELF } })
    const emitter = new TypedEventEmitter<ClientEventMap>()
    const baseline = sock.ev.eventNames().reduce((n, e) => n + sock.ev.listenerCount(e), 0)
    const handles = Array.from({ length: 50 }, () =>
      attachInboundPipeline(emitter as never, sock as never, {
        selfJid: SELF, channelId: 'c', receiverId: SELF, prefixes: [],
      } as never),
    )
    const attached = sock.ev.eventNames().reduce((n, e) => n + sock.ev.listenerCount(e), 0)
    expect(attached).toBeGreaterThan(baseline)
    for (const h of handles) h.detach()
    const afterDetach = sock.ev.eventNames().reduce((n, e) => n + sock.ev.listenerCount(e), 0)
    expect(afterDetach).toBe(baseline)
  })
})

describe('stress: hostile payloads at volume', () => {
  it('500 ReDoS-shaped messages stay well under a second in total', () => {
    const payload = `http://a${'.'.repeat(20_000)}x`
    const t = process.hrtime.bigint()
    for (let i = 0; i < 500; i += 1) extractLinks(payload)
    const ms = Number(process.hrtime.bigint() - t) / 1e6
    metric(`redos: 500 x 20k-dot payloads in ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(1_000)
  }, 60_000)

  it('200 bracket-bomb messages stay bounded', () => {
    const payload = '['.repeat(5_000) + ']('.repeat(5_000)
    const t = process.hrtime.bigint()
    for (let i = 0; i < 200; i += 1) buildAIRichContent([{ type: 'text', text: payload }])
    const ms = Number(process.hrtime.bigint() - t) / 1e6
    metric(`bracket-bomb: 200 x 5k payloads in ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(10_000)
  }, 60_000)

  it('command cooldowns from 50k distinct senders stay bounded', async () => {
    resetCooldowns()
    const before = heapMb()
    for (let i = 0; i < 50_000; i += 1) {
      await checkGuards(
        { cooldown: 60 },
        { command: 'ping', senderId: `628${i}@s.whatsapp.net`, isGroup: false, roomId: null } as never,
        { isAdmin: async () => false, now: () => Date.now() },
      )
    }
    const after = heapMb()
    metric(`cooldowns: 50k senders, heap delta ${(after - before).toFixed(1)} MB`)
    expect(after - before).toBeLessThan(150)
  }, 120_000)
})

describe('stress: concurrent store and auth writes', () => {
  it('5k concurrent message writes all land', async () => {
    const store = new MemoryMessageStore()
    await Promise.all(
      Array.from({ length: 5_000 }, (_, i) =>
        store.saveMessage({
          key: { id: `C${i}`, remoteJid: 'bulk@s.whatsapp.net', fromMe: false },
          messageTimestamp: i,
          message: { conversation: String(i) },
        } as never),
      ),
    )
    const listed = await store.listMessages('bulk@s.whatsapp.net', { limit: 6_000 })
    expect(listed).toHaveLength(5_000)
  }, 60_000)

  it('2k concurrent signal writes plus interleaved creds writes stay consistent', async () => {
    const auth = new MemoryAuthStore()
    await Promise.all([
      ...Array.from({ length: 2_000 }, (_, i) =>
        auth.signal.write({ session: { [String(i)]: Uint8Array.from([i & 0xff]) } }),
      ),
      ...Array.from({ length: 200 }, () => auth.creds.writeCreds({ registered: true } as never)),
    ])
    const read = await auth.signal.read('session', ['0', '1999'])
    expect(read['0']).toBeDefined()
    expect(read['1999']).toBeDefined()
    await expect(auth.creds.readCreds()).resolves.toBeDefined()
  }, 60_000)
})
