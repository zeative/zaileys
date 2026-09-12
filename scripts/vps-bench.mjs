/**
 * Measures what zaileys actually needs on a small VPS.
 *
 * Bundles the scenario the way a deployment would, then runs it in a child process under real V8
 * heap caps. Measuring inside vitest would fold the test runner's own footprint into the numbers,
 * and running through tsx would add the TypeScript compiler to RSS; neither reflects production.
 *
 *   node scripts/vps-bench.mjs            # the matrix
 *   node scripts/vps-bench.mjs --sustained # a paced soak, printing the memory curve
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
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
