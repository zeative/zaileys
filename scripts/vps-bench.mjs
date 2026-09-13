/**
 * Measures what zaileys actually needs on a small VPS.
 *
 * Bundles the scenario the way a deployment would, then runs it in a child process under real V8
 * heap caps. Measuring inside vitest would fold the test runner's own footprint into the numbers,
 * and running through tsx would add the TypeScript compiler to RSS; neither reflects production.
 *
 *   node scripts/vps-bench.mjs            # the matrix
 *   node scripts/vps-bench.mjs --sustained # a paced soak, printing the memory curve
 *   node scripts/vps-bench.mjs --heavy     # sessions + hostile traffic + real media, whole-tree RSS
 */
import { build } from 'esbuild'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const EXTERNAL = [
  'sharp', 'jimp', 'baileys', 'pino', 'lru-cache', 'file-type', 'better-sqlite3',
  '@ffmpeg-installer/ffmpeg', '@ffprobe-installer/ffprobe', 'node-webpmux', 'audio-decode',
]

const MATRIX = [
  { store: 'none', heap: 32, label: 'pipeline only' },
  { store: 'sqlite', heap: 48, label: 'sqlite store' },
  { store: 'pruned', heap: 48, label: 'memory store + retention window' },
  { store: 'memory', heap: 96, label: 'memory store, no pruning' },
  { store: 'memory', heap: 128, label: 'memory store, no pruning' },
]

const run = (scenario, env) =>
  new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${env.heap}`, scenario],
      {
        env: {
          ...process.env,
          VPS_STORE: env.store,
          VPS_MSGS: String(env.msgs),
          VPS_RATE: String(env.rate),
          ...(env.trace ? { VPS_TRACE: '1' } : {}),
          ...(env.db ? { VPS_SQLITE: env.db } : {}),
        },
        stdio: ['ignore', 'pipe', env.trace ? 'inherit' : 'pipe'],
      },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d.toString()
    })
    child.stderr?.on('data', (d) => {
      err += d.toString()
    })
    child.on('close', (code) => {
      const line = out.trim().split('\n').pop() ?? ''
      try {
        resolve({ ok: code === 0, ...JSON.parse(line) })
      } catch {
        /** Report why it died — "OOM" is a guess until the message says so. */
        const oom = /heap out of memory|Allocation failed/i.test(err)
        const scenario = err.match(/SCENARIO FAILED: (.*)/)?.[1]
        const other = err.trim().split('\n').filter(Boolean).pop()
        resolve({ ok: false, code, reason: oom ? 'heap out of memory' : (scenario ?? other ?? `exit ${code}`) })
      }
    })
  })


/** Sum RSS of a process and every descendant; ffmpeg children count against the same VPS. */
const treeRssMb = (rootPid) => {
  let rows
  try {
    rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' })
  } catch {
    return { total: 0, root: 0, children: 0 }
  }
  const byParent = new Map()
  const rss = new Map()
  for (const line of rows.trim().split('\n')) {
    const [pid, ppid, kb] = line.trim().split(/\s+/).map(Number)
    rss.set(pid, kb)
    if (!byParent.has(ppid)) byParent.set(ppid, [])
    byParent.get(ppid).push(pid)
  }
  let children = 0
  const stack = [...(byParent.get(rootPid) ?? [])]
  while (stack.length > 0) {
    const pid = stack.pop()
    children += rss.get(pid) ?? 0
    stack.push(...(byParent.get(pid) ?? []))
  }
  const root = rss.get(rootPid) ?? 0
  return { total: (root + children) / 1024, root: root / 1024, children: children / 1024 }
}

const prepareMedia = (dir) => {
  const require = createRequire(import.meta.url)
  const ffmpeg = require('@ffmpeg-installer/ffmpeg').path
  const files = {
    photo: path.join(dir, 'photo-12mp.jpg'),
    video: path.join(dir, 'clip-720p-15s.mp4'),
    videoHd: path.join(dir, 'clip-1080p-15s.mp4'),
    audio: path.join(dir, 'voice-30s.mp3'),
  }
  const make = (out, args) => {
    if (!existsSync(out)) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args, out])
  }
  make(files.photo, ['-f', 'lavfi', '-i', 'testsrc2=size=4000x3000', '-frames:v', '1', '-q:v', '3'])
  make(files.video, ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'])
  make(files.videoHd, ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'])
  make(files.audio, ['-f', 'lavfi', '-i', 'sine=frequency=300:duration=30', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k'])
  return files
}

const runHeavy = (scenario, opts) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [`--max-old-space-size=${opts.heap}`, scenario], {
      env: {
        ...process.env,
        HEAVY_SESSIONS: String(opts.sessions),
        HEAVY_DURATION: String(opts.duration),
        HEAVY_MSG_RATE: String(opts.msgRate),
        HEAVY_MEDIA_RATE: String(opts.mediaRate),
        HEAVY_DB: opts.db,
        HEAVY_PHOTO: opts.media.photo,
        HEAVY_VIDEO: opts.media.video,
        HEAVY_VIDEO_HD: opts.media.videoHd,
        HEAVY_AUDIO: opts.media.audio,
        ...(process.env['HEAVY_JOBS'] !== undefined ? { HEAVY_JOBS: process.env['HEAVY_JOBS'] } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let peakTotal = 0
    let peakRoot = 0
    let peakChildren = 0
    const sampler = setInterval(() => {
      const t = treeRssMb(child.pid)
      peakTotal = Math.max(peakTotal, t.total)
      peakRoot = Math.max(peakRoot, t.root)
      peakChildren = Math.max(peakChildren, t.children)
    }, 250)
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d.toString() })
    child.stderr.on('data', (d) => { err += d.toString() })
    child.on('close', (code) => {
      clearInterval(sampler)
      const peaks = {
        peakTreeRssMb: Math.round(peakTotal),
        peakNodeRssMb: Math.round(peakRoot),
        peakFfmpegRssMb: Math.round(peakChildren),
      }
      const line = out.trim().split('\n').pop() ?? ''
      try {
        resolve({ ok: code === 0, ...peaks, ...JSON.parse(line) })
      } catch {
        const oom = /heap out of memory|Allocation failed/i.test(err)
        resolve({ ok: false, ...peaks, reason: oom ? 'heap out of memory' : (err.trim().split('\n').pop() ?? `exit ${code}`) })
      }
    })
  })

const heavyMain = async (dir) => {
  const scenario = path.join(dir, 'heavy-scenario.mjs')
  await build({
    entryPoints: ['tests/stress/fixtures/vps-heavy-scenario.ts'],
    bundle: true, platform: 'node', format: 'esm', target: 'node20',
    outfile: scenario, external: EXTERNAL, logLevel: 'error',
  })
  const media = prepareMedia(dir)
  const duration = Number(process.env['HEAVY_DURATION'] ?? 90)
  const heaps = (process.env['HEAVY_HEAPS'] ?? '96,128,192,256').split(',').map(Number)
  const sessions = Number(process.env['HEAVY_SESSIONS'] ?? 5)
  const msgRate = Number(process.env['HEAVY_MSG_RATE'] ?? 100)
  const mediaRate = Number(process.env['HEAVY_MEDIA_RATE'] ?? 1)

  const jobs = process.env['HEAVY_JOBS'] ?? 'sticker, thumbnail, toJpeg 12MP, video 720p+1080p, video thumb, voice note'
  process.stdout.write(
    `heavy: ${sessions} numbers, ${msgRate} msg/s (20% hostile), ${mediaRate} media job/s (${jobs}), ${duration}s each\n\n`,
  )
  for (const heap of heaps) {
    const r = await runHeavy(scenario, {
      heap, sessions, duration, msgRate, mediaRate, media, db: path.join(dir, `heavy-${heap}.db`),
    })
    execFileSync('sh', ['-c', `rm -f ${JSON.stringify(path.join(dir, `heavy-${heap}.db`))}.*`])
    process.stdout.write(`${JSON.stringify({ heapCapMb: heap, ...r })}\n`)
  }
}

const main = async () => {
  /** Inside the project: the bundle keeps its externals, so it must resolve node_modules from here. */
  const dir = path.resolve('.vps-build')
  await mkdir(dir, { recursive: true })
  const scenario = path.join(dir, 'scenario.mjs')
  await build({
    entryPoints: ['tests/stress/fixtures/vps-scenario.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: scenario,
    external: EXTERNAL,
    logLevel: 'error',
  })

  const sustained = process.argv.includes('--sustained')
  if (process.argv.includes('--heavy')) {
    await heavyMain(dir)
    return
  }
  try {
    if (sustained) {
      process.stdout.write('sustained soak — 48 MB heap, sqlite store, ~30 msg/s\n\n')
      const r = await run(scenario, {
        store: 'sqlite', heap: 48, msgs: 6000, rate: 30, trace: true,
        db: path.join(dir, 'soak.db'),
      })
      process.stdout.write(`\n${r.ok ? 'OK' : 'FAILED'}  peakRSS=${r.peakRssMb}MB finalRSS=${r.finalRssMb}MB peakHeap=${r.peakHeapMb}MB\n`)
      process.exitCode = r.ok ? 0 : 1
      return
    }

    process.stdout.write('20000 messages, 20% adversarial, paced\n\n')
    process.stdout.write('store    heap    result\n')
    let failures = 0
    for (const entry of MATRIX) {
      const r = await run(scenario, {
        store: entry.store, heap: entry.heap, msgs: 20_000, rate: 1_000,
        db: path.join(dir, `${entry.store}-${entry.heap}.db`),
      })
      const detail = r.ok
        ? `OK    peakHeap=${String(r.peakHeapMb).padStart(3)}MB peakRSS=${String(r.peakRssMb).padStart(3)}MB ${String(r.throughputPerSec).padStart(4)}msg/s`
        : `FAIL  ${String(r.reason ?? 'unknown').slice(0, 60)}`
      if (!r.ok && entry.store !== 'memory') failures += 1
      process.stdout.write(`${entry.store.padEnd(8)} ${String(entry.heap).padStart(3)}MB   ${detail}   (${entry.label})\n`)
    }
    process.exitCode = failures > 0 ? 1 : 0
  } finally {
    await rm(path.join(dir, 'scenario.mjs'), { force: true })
  }
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`)
  process.exit(1)
})
