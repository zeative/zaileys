/**
 * Heavy, realistic bot load for sizing a server: several WhatsApp numbers receiving hostile-laced
 * traffic while real media jobs run through zaileys' own processors (sharp in-process, ffmpeg as
 * child processes). The runner samples RSS of the whole process tree, because a VPS has to fit
 * Node and every ffmpeg child together.
 *
 * Env:
 *   HEAVY_SESSIONS   numbers in this process          (default 5)
 *   HEAVY_DURATION   seconds of load                  (default 90)
 *   HEAVY_MSG_RATE   inbound messages per second      (default 100)
 *   HEAVY_MEDIA_RATE media jobs per second            (default 1)
 *   HEAVY_JOBS       comma list overriding the job mix (e.g. video1080 for a worst case)
 *   HEAVY_PHOTO / HEAVY_VIDEO / HEAVY_VIDEO_HD / HEAVY_AUDIO   input files prepared by the runner
 */
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { WAMessage } from 'baileys'
import { attachInboundPipeline } from '../../../src/events/pipeline.js'
import { TypedEventEmitter } from '../../../src/client/event-emitter.js'
import type { ClientEventMap } from '../../../src/client/types.js'
import { SqliteMessageStore } from '../../../src/store/adapters/sqlite.js'
import { ImageProcessor } from '../../../src/media/ffmpeg/image.js'
import { VideoProcessor } from '../../../src/media/ffmpeg/video.js'
import { AudioProcessor } from '../../../src/media/ffmpeg/audio.js'

const num = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && process.env[name] !== undefined ? parsed : fallback
}

const SESSIONS = Math.max(1, num('HEAVY_SESSIONS', 5))
const DURATION_S = num('HEAVY_DURATION', 90)
const MSG_RATE = num('HEAVY_MSG_RATE', 100)
const MEDIA_RATE = num('HEAVY_MEDIA_RATE', 1)
const DB_PREFIX = process.env['HEAVY_DB'] ?? ':memory:'

const photo = readFileSync(process.env['HEAVY_PHOTO'] as string)
const video = readFileSync(process.env['HEAVY_VIDEO'] as string)
const videoHd = readFileSync(process.env['HEAVY_VIDEO_HD'] as string)
/** toOpus validates for audio/*; a user's voice note arrives as audio, not as a video container. */
const audio = readFileSync(process.env['HEAVY_AUDIO'] as string)

const message = (n: number): WAMessage => {
  const jid = `628${100000 + (n % 4000)}@s.whatsapp.net`
  const key = { id: `X${n}`, remoteJid: jid, fromMe: false, participant: jid }
  if (n % 5 !== 0) {
    return {
      key,
      messageTimestamp: 1700000000 + n,
      pushName: `U${n % 300}`,
      message: { conversation: `!menu halo ${n} cek https://example.com/p/${n}` },
    } as unknown as WAMessage
  }
  switch ((n / 5) % 4) {
    case 0:
      return { key, messageTimestamp: n, message: { conversation: `http://a${'.'.repeat(20_000)}x` } } as unknown as WAMessage
    case 1:
      return {
        key,
        messageTimestamp: n,
        message: {
          extendedTextMessage: {
            text: 'spam',
            contextInfo: { mentionedJid: Array.from({ length: 1_000 }, (_, m) => `${9_000_000 + m}@lid`) },
          },
        },
      } as unknown as WAMessage
    case 2:
      return { key, messageTimestamp: n, message: { protocolMessage: { type: 6 } } } as unknown as WAMessage
    default:
      return { key, messageTimestamp: n, message: { conversation: '['.repeat(2_000) + ']('.repeat(2_000) } } as unknown as WAMessage
  }
}

type JobName = 'sticker' | 'thumbnail' | 'toJpeg' | 'video720' | 'video1080' | 'videoThumb' | 'voiceNote'

/** A plausible mix for a busy bot: mostly cheap image work, occasional video. */
const DEFAULT_CYCLE: JobName[] = [
  'sticker', 'thumbnail', 'sticker', 'voiceNote', 'toJpeg', 'sticker',
  'videoThumb', 'sticker', 'video720', 'thumbnail', 'sticker', 'video1080',
]
const JOB_CYCLE: JobName[] =
  process.env['HEAVY_JOBS'] !== undefined
    ? (process.env['HEAVY_JOBS'].split(',').map((j) => j.trim()) as JobName[])
    : DEFAULT_CYCLE

const runJob = async (job: JobName): Promise<void> => {
  switch (job) {
    case 'sticker': await ImageProcessor.resizeForSticker(photo, 60); return
    case 'thumbnail': await ImageProcessor.thumbnail(photo); return
    case 'toJpeg': await ImageProcessor.toJpeg(photo); return
    case 'video720': await VideoProcessor.toMp4(video); return
    case 'video1080': await VideoProcessor.toMp4(videoHd); return
    case 'videoThumb': await VideoProcessor.thumbnail(video); return
    case 'voiceNote': await AudioProcessor.toOpus(audio); return
  }
}

const main = async (): Promise<void> => {
  const lag = monitorEventLoopDelay({ resolution: 10 })
  lag.enable()

  let delivered = 0
  const sessions = Array.from({ length: SESSIONS }, (_, idx) => {
    const ev = new EventEmitter()
    ev.setMaxListeners(0)
    const self = `62811${idx}@s.whatsapp.net`
    const emitter = new TypedEventEmitter<ClientEventMap>()
    emitter.on('message', () => {
      delivered += 1
    })
    const store = new SqliteMessageStore({
      database: DB_PREFIX === ':memory:' ? ':memory:' : `${DB_PREFIX}.${idx}`,
    })
    const handle = attachInboundPipeline(emitter as never, { ev, user: { id: self } } as never, {
      selfJid: self,
      channelId: `heavy-${idx}`,
      receiverId: self,
      prefixes: ['!'],
      resolveLidToPn: async (lid: string) => lid.replace('@lid', '@s.whatsapp.net'),
    } as never)
    return { ev, store, handle }
  })

  const done: Record<string, number> = {}
  const failed: Record<string, number> = {}
  /** First error per job type, so a failure is diagnosable instead of just counted. */
  const failureReasons: Record<string, string> = {}
  const mediaMs: number[] = []
  const inflight = new Set<Promise<void>>()
  let peakHeap = 0
  let sent = 0
  let jobIndex = 0

  const end = Date.now() + DURATION_S * 1000
  const tickMs = 50
  const msgsPerTick = Math.max(1, Math.round((MSG_RATE * tickMs) / 1000))
  const mediaEveryTicks = Math.max(1, Math.round(1000 / (MEDIA_RATE * tickMs)))
  let tick = 0

  while (Date.now() < end) {
    for (let i = 0; i < msgsPerTick; i += 1) {
      const msg = message(sent)
      const session = sessions[sent % SESSIONS]!
      session.ev.emit('messages.upsert', { type: 'notify', messages: [msg] })
      await session.store.saveMessage(msg)
      sent += 1
    }
    if (tick % mediaEveryTicks === 0) {
      const job = JOB_CYCLE[jobIndex % JOB_CYCLE.length]!
      jobIndex += 1
      const started = Date.now()
      const p = runJob(job)
        .then(() => {
          done[job] = (done[job] ?? 0) + 1
          mediaMs.push(Date.now() - started)
        })
        .catch((err: unknown) => {
          failed[job] = (failed[job] ?? 0) + 1
          failureReasons[job] ??= err instanceof Error ? err.message : String(err)
        })
        .finally(() => inflight.delete(p))
      inflight.add(p)
    }
    peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed)
    tick += 1
    await new Promise((r) => setTimeout(r, tickMs))
  }

  await Promise.allSettled([...inflight])
  for (const s of sessions) s.handle.detach()
  for (const s of sessions) await s.store.close?.()
  lag.disable()

  const sorted = [...mediaMs].sort((a, b) => a - b)
  const pct = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0

  if (delivered < sent * 0.7) throw new Error(`only ${delivered}/${sent} delivered`)

  process.stdout.write(
    JSON.stringify({
      ok: true,
      sessions: SESSIONS,
      durationSec: DURATION_S,
      messagesSent: sent,
      messagesDelivered: delivered,
      mediaDone: done,
      mediaFailed: failed,
      failureReasons,
      mediaP50Ms: pct(0.5),
      mediaP95Ms: pct(0.95),
      eventLoopLagP99Ms: Number((lag.percentile(99) / 1e6).toFixed(1)),
      eventLoopLagMaxMs: Number((lag.max / 1e6).toFixed(1)),
      peakHeapMb: Math.round(peakHeap / 1048576),
    }) + '\n',
  )
}

main().catch((err: unknown) => {
  process.stderr.write(`SCENARIO FAILED: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
