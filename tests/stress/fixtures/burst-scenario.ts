/**
 * Inbound burst: a flood of mention-heavy messages emitted faster than LID resolution can keep up.
 * Reports peak heap and whether every message still reached the handler with a resolved sender.
 *
 * Env: BURST_MSGS (default 4000), BURST_MENTIONS (default 2000), BURST_RESOLVE_MS (default 2),
 *      BURST_PACED=1 to emit each message on its own macrotask, the way a socket delivers them
 */
import { EventEmitter } from 'node:events'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../../src/events/pipeline.js'
import { TypedEventEmitter } from '../../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../../src/client/types.js'

const MSGS = Number(process.env['BURST_MSGS'] ?? 4000)
const MENTIONS = Number(process.env['BURST_MENTIONS'] ?? 2000)
const RESOLVE_MS = Number(process.env['BURST_RESOLVE_MS'] ?? 2)
const SELF = '628000@s.whatsapp.net'
const PACED = process.env['BURST_PACED'] === '1'

const main = async (): Promise<void> => {
  const ev = new EventEmitter()
  ev.setMaxListeners(0)
  const emitter = new TypedEventEmitter<ClientEventMap>()
  let delivered = 0
  let resolvedSender = 0
  const warnings: string[] = []
  emitter.on('message', (ctx: { senderId?: string }) => {
    delivered += 1
    if (typeof ctx.senderId === 'string' && ctx.senderId.endsWith('@s.whatsapp.net')) resolvedSender += 1
  })
  const handle = attachInboundPipeline(emitter as never, { ev, user: { id: SELF } } as never, {
    selfJid: SELF,
    channelId: 'burst',
    receiverId: SELF,
    prefixes: [],
    logger: { warn: (_o: unknown, msg: string) => warnings.push(msg), debug() {}, info() {}, error() {}, fatal() {} },
    resolveLidToPn: async (lid: string) => {
      await new Promise((r) => setTimeout(r, RESOLVE_MS))
      return lid.replace('@lid', '@s.whatsapp.net')
    },
  } as never)

  let peakHeap = 0
  const sampler = setInterval(() => {
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
  }, 5)

  const t0 = Date.now()
  for (let i = 0; i < MSGS; i += 1) {
    const sender = `${7_000_000 + (i % 500)}@lid`
    ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { id: `B${i}`, remoteJid: '120363@g.us', fromMe: false, participant: sender },
          messageTimestamp: i,
          message: {
            extendedTextMessage: {
              text: 'x',
              contextInfo: { mentionedJid: Array.from({ length: MENTIONS }, (_, m) => `${9_000_000 + m}@lid`) },
            },
          },
        } as unknown as WAMessage,
      ],
    })
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
    if (PACED) await new Promise((r) => setImmediate(r))
  }
  for (let tick = 0; tick < 2400 && delivered < MSGS; tick += 1) {
    await new Promise((r) => setTimeout(r, 50))
  }
  clearInterval(sampler)
  handle.detach()

  process.stdout.write(
    JSON.stringify({
      msgs: MSGS,
      delivered,
      resolvedSender,
      peakHeapMb: Math.round(peakHeap / 1048576),
      elapsedMs: Date.now() - t0,
      overloadWarnings: warnings.filter((w) => /overload|backlog|shed/i.test(w)).length,
    }) + '\n',
  )
}

void main()
