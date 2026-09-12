/**
 * A realistic bot workload, run as its own process under a hard V8 heap cap so the numbers mean
 * something for a small VPS. Paced like network traffic rather than a synchronous flood: the point
 * is whether zaileys stays alive and steady on cheap hardware, not how fast it can be overwhelmed.
 *
 * Env:
 *   VPS_MSGS       total inbound messages          (default 20000)
 *   VPS_RATE       messages per second             (default 50)
 *   VPS_HOSTILE    1 to mix in adversarial shapes  (default 1)
 *   VPS_MEDIA      1 to also run media processing  (default 1)
 *   VPS_STORE      none | memory | pruned | sqlite (default memory)
 */
import { EventEmitter } from 'node:events'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../../src/events/pipeline.js'
import { TypedEventEmitter } from '../../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../../src/client/types.js'
import { MemoryMessageStore } from '../../../src/store/adapters/memory.js'
import { SqliteMessageStore } from '../../../src/store/adapters/sqlite.js'
import { MemoryAuthStore } from '../../../src/auth/adapters/memory.js'
import { ImageProcessor } from '../../../src/media/ffmpeg/image.js'

const num = (name: string, fallback: number): number => {
  const raw = process.env[name]
  const parsed = raw === undefined ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

const TOTAL = num('VPS_MSGS', 20_000)
const RATE = num('VPS_RATE', 50)
const HOSTILE = process.env['VPS_HOSTILE'] !== '0'
const MEDIA = process.env['VPS_MEDIA'] !== '0'
const STORE_MODE = process.env['VPS_STORE'] ?? 'memory'
const PRUNE_KEEP_PER_CHAT = 50
const PRUNE_WINDOW = 2_000
const SELF = '628000@s.whatsapp.net'

const rssMb = (): number => process.memoryUsage().rss / 1024 / 1024
const heapMb = (): number => process.memoryUsage().heapUsed / 1024 / 1024

const pngBomb = (): Buffer => {
  const buf = Buffer.alloc(24)
  buf.writeUInt32BE(0x89504e47, 0)
  buf.writeUInt32BE(0x0d0a1a0a, 4)
  buf.writeUInt32BE(13, 8)
  buf.write('IHDR', 12, 'ascii')
  buf.writeUInt32BE(65535, 16)
  buf.writeUInt32BE(65535, 20)
  return buf
}

const ordinary = (i: number): WAMessage =>
  ({
    key: { id: `M${i}`, remoteJid: `628${100000 + (i % 3000)}@s.whatsapp.net`, fromMe: false },
    messageTimestamp: 1700000000 + i,
    pushName: `User${i % 200}`,
    message: { conversation: `pesan biasa ${i} https://example.com/a${i}` },
  }) as unknown as WAMessage

const hostile = (i: number): WAMessage => {
  const jid = `628${200000 + (i % 3000)}@s.whatsapp.net`
  const key = { id: `H${i}`, remoteJid: jid, fromMe: false, participant: jid }
  switch (i % 4) {
    case 0:
      return { key, messageTimestamp: i, message: { conversation: `http://a${'.'.repeat(20_000)}x` } } as unknown as WAMessage
    case 1:
      return {
        key,
        messageTimestamp: i,
        message: {
          extendedTextMessage: {
            text: 'm',
            contextInfo: { mentionedJid: Array.from({ length: 1_000 }, (_, m) => `${9_000_000 + m}@lid`) },
          },
        },
      } as unknown as WAMessage
    case 2:
      return { key, messageTimestamp: i, message: { protocolMessage: { type: 6 } } } as unknown as WAMessage
    default:
      return { key, messageTimestamp: i, message: { conversation: '['.repeat(2_000) + ']('.repeat(2_000) } } as unknown as WAMessage
  }
}

const main = async (): Promise<void> => {
  const ev = new EventEmitter()
  ev.setMaxListeners(0)
  const sock = { ev, user: { id: SELF } }
  const emitter = new TypedEventEmitter<ClientEventMap>()
  const store =
    STORE_MODE === 'sqlite'
      ? new SqliteMessageStore({ database: process.env['VPS_SQLITE'] ?? ':memory:' })
      : new MemoryMessageStore()
  const auth = new MemoryAuthStore()

  let delivered = 0
  const latencies: number[] = []
  emitter.on('message', () => {
    delivered += 1
  })

  const handle = attachInboundPipeline(emitter as never, sock as never, {
    selfJid: SELF,
    channelId: 'vps',
    receiverId: SELF,
    prefixes: ['!'],
    resolveLidToPn: async (lid: string) => lid.replace('@lid', '@s.whatsapp.net'),
  } as never)

  const batchSize = Math.max(1, Math.round(RATE / 20))
  const samples: Array<{ rss: number; heap: number }> = []
  const started = Date.now()

  for (let i = 0; i < TOTAL; i += batchSize) {
    const t0 = process.hrtime.bigint()
    for (let b = 0; b < batchSize && i + b < TOTAL; b += 1) {
      const n = i + b
      const msg = HOSTILE && n % 5 === 0 ? hostile(n) : ordinary(n)
      ev.emit('messages.upsert', { type: 'notify', messages: [msg] })
      if (STORE_MODE !== 'none') await store.saveMessage(msg)
    }
    await new Promise((r) => setTimeout(r, 50))
    latencies.push(Number(process.hrtime.bigint() - t0) / 1e6)
    if (STORE_MODE === 'pruned' && i % 1000 === 0) {
      /**
       * A sliding retention window, which is what actually bounds a busy bot: `maxPerChat` alone
       * does nothing when traffic is spread thin across thousands of chats.
       */
      await store.pruneMessages?.({
        olderThan: 1700000000 + i - PRUNE_WINDOW,
        maxPerChat: PRUNE_KEEP_PER_CHAT,
      })
    }
    if (i % Math.max(1, Math.floor(TOTAL / 12)) < batchSize) {
      const s = { rss: rssMb(), heap: heapMb() }
      samples.push(s)
      if (process.env['VPS_TRACE'] === '1') {
        process.stderr.write(`  t=${((Date.now() - started) / 1000).toFixed(0)}s msgs=${i} rss=${s.rss.toFixed(0)}MB heap=${s.heap.toFixed(0)}MB\n`)
      }
      await auth.creds.writeCreds({ registered: true, me: { id: SELF } } as never)
      await auth.signal.write({ session: { [String(i)]: Uint8Array.from([i & 0xff]) } } as never)
    }
  }

  await new Promise((r) => setTimeout(r, 500))
  handle.detach()

  const elapsed = (Date.now() - started) / 1000
  const peakRss = Math.max(...samples.map((s) => s.rss), rssMb())
  const peakHeap = Math.max(...samples.map((s) => s.heap), heapMb())
  const sorted = [...latencies].sort((a, b) => a - b)
  const p99 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] ?? 0

  if (MEDIA) {
    let rejected = 0
    for (let i = 0; i < 200; i += 1) {
      try {
        await ImageProcessor.thumbnail(pngBomb())
      } catch {
        rejected += 1
      }
    }
    if (rejected !== 200) throw new Error(`media bombs not all rejected: ${rejected}/200`)
  }

  /** i=0 is hostile (i % 5 === 0) and hostile jids use a different prefix, so probe an ordinary one. */
  if (STORE_MODE !== 'none') {
    const stored = await store.listMessages('628100001@s.whatsapp.net', { limit: 10 })
    if (stored.length === 0) throw new Error('store lost every message')
  }
  if (delivered < TOTAL * 0.7) throw new Error(`only ${delivered}/${TOTAL} delivered`)

  await store.close?.()

  process.stdout.write(
    JSON.stringify({
      ok: true,
      store: STORE_MODE,
      total: TOTAL,
      delivered,
      elapsedSec: Number(elapsed.toFixed(1)),
      throughputPerSec: Number((TOTAL / elapsed).toFixed(0)),
      peakRssMb: Number(peakRss.toFixed(0)),
      peakHeapMb: Number(peakHeap.toFixed(0)),
      finalRssMb: Number(rssMb().toFixed(0)),
      p99BatchMs: Number(p99.toFixed(1)),
    }) + '\n',
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`SCENARIO FAILED: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
