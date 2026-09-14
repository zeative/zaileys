#!/usr/bin/env node
// zaileys doctor: read-only checks for a zaileys project — runtime, install, config smells that compile but fail at
// runtime, store drivers, ffmpeg WebP support, and session persistence. No dependencies; no network unless --online.
// Usage: node doctor.mjs [project-dir] [--json] [--online]
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const CODE_FILE = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.next', '.zaileys', '.turbo'])
const MAX_FILE_BYTES = 512 * 1024
const SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/
const STORE_DRIVERS = { Sqlite: 'better-sqlite3', Postgres: 'pg', Redis: 'redis', Convex: 'convex' }
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}
const readJson = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

const codeFiles = (root, dir = root) => {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : codeFiles(root, path)
    if (!entry.isFile() || !CODE_FILE.test(entry.name) || entry.name.endsWith('.d.ts')) return []
    if (statSync(path).size > MAX_FILE_BYTES) return []
    return [{ file: relative(root, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }]
  })
}

// First match of `pattern` across files, as "file:line".
const locate = (files, pattern) => {
  for (const { file, text } of files) {
    const lines = text.split('\n')
    const index = lines.findIndex((line) => pattern.test(line))
    if (index >= 0) return { where: `${file}:${index + 1}`, line: lines[index] }
  }
  return undefined
}

const compareVersions = (a, b) => {
  const pa = a.split(/[.-]/).map(Number)
  const pb = b.split(/[.-]/).map(Number)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}

const defaultExec = (bin, args) => {
  const result = spawnSync(bin, args, { encoding: 'utf8', timeout: 10_000 })
  return { status: result.error ? null : result.status, stdout: result.stdout ?? '' }
}

export function diagnose(projectDir, options = {}) {
  const dir = resolve(projectDir)
  const env = options.env ?? process.env
  const exec = options.exec ?? defaultExec
  const nodeVersion = options.nodeVersion ?? process.version
  const checks = []
  const add = (id, status, message, extra = {}) => checks.push({ id, status, message, ...extra })

  const pkg = readJson(join(dir, 'package.json')) ?? {}
  const declared = pkg.dependencies?.zaileys ?? pkg.devDependencies?.zaileys
  const installed = readJson(join(dir, 'node_modules', 'zaileys', 'package.json'))
  const files = codeFiles(dir)
  const usesCloud = files.some((f) => /provider\s*:\s*['"]cloud['"]/.test(f.text))
  const usesWeb = files.some((f) => /new\s+Client\s*\(/.test(f.text) && !/provider\s*:\s*['"]cloud['"]/.test(f.text))

  const nodeMajor = Number(nodeVersion.replace(/^v/, '').split('.')[0])
  if (nodeMajor < 20) add('node-version', 'error', `Node.js ${nodeVersion} is too old`, { fix: 'zaileys needs Node.js 20 or newer' })
  else add('node-version', 'ok', `Node.js ${nodeVersion}`)

  if (!installed) {
    add('zaileys-installed', 'error', declared ? `zaileys ${declared} is declared but not installed` : 'zaileys is not installed', {
      fix: 'install dependencies (npm install) in the project directory',
    })
  } else {
    add('zaileys-installed', 'ok', `zaileys ${installed.version}`)
  }

  const declaredMajor = declared ? Number((declared.match(/\d+/) ?? [])[0]) : undefined
  if (declaredMajor !== undefined && declaredMajor < 4) {
    add('zaileys-range', 'error', `package.json asks for zaileys ${declared}, a pre-v4 release`, {
      fix: 'v4 is a rewrite: follow the v3 → v4 migration and depend on "^4"',
    })
  } else if (declaredMajor !== undefined && declaredMajor > 4) {
    add('zaileys-range', 'warn', `package.json asks for zaileys ${declared}; this skill describes v4`)
  } else {
    add('zaileys-range', 'ok', declared ? `declared ${declared}` : 'no zaileys range declared')
  }

  if (!options.online) {
    add('zaileys-latest', 'skip', 'run with --online to compare with the latest release')
  } else if (!options.latest || !installed) {
    add('zaileys-latest', 'skip', 'could not determine the latest release')
  } else if (compareVersions(installed.version, options.latest) < 0) {
    add('zaileys-latest', 'warn', `zaileys ${installed.version} is installed; ${options.latest} is the latest release`, {
      fix: 'read the migration notes for the versions in between before upgrading',
    })
  } else {
    add('zaileys-latest', 'ok', `zaileys ${installed.version} is the latest release`)
  }

  // The webhook rejects every delivery without a signature check, so a Cloud client without appSecret never receives messages.
  const unsignedCloud = files
    .filter((f) => /provider\s*:\s*['"]cloud['"]/.test(f.text) && !/appSecret/.test(f.text) && !/allowUnsigned\s*:\s*true/.test(f.text))
    .map((f) => locate([f], /provider\s*:\s*['"]cloud['"]/))[0]
  if (unsignedCloud) {
    add('cloud-app-secret', 'error', 'Cloud API client without cloud.appSecret: the webhook answers 401 to every delivery', {
      where: unsignedCloud.where,
      fix: 'set cloud.appSecret from the Meta app settings (e.g. process.env.WA_APP_SECRET)',
    })
  } else {
    add('cloud-app-secret', 'ok', usesCloud ? 'Cloud API webhook is signed' : 'no Cloud API client')
  }

  const unsigned = locate(files, /allowUnsigned\s*:\s*true/)
  if (unsigned) {
    add('cloud-allow-unsigned', 'warn', 'allowUnsigned accepts webhook calls anyone can forge', {
      where: unsigned.where,
      fix: 'use it only for local testing; set appSecret in production',
    })
  } else add('cloud-allow-unsigned', 'ok', 'webhook signatures are not disabled')

  const webhookFiles = files.filter((f) => /\.webhook\(\s*\)/.test(f.text))
  const parsedBody = locate(webhookFiles, /\.use\(\s*(express|bodyParser)\.json\(|['"`][^'"`]*webhook[^'"`]*['"`][^\n]*(express|bodyParser)\.json\(/)
  if (parsedBody) {
    add('webhook-raw-body', 'error', 'the webhook route gets a JSON-parsed body, so every signature check fails (401 invalid signature)', {
      where: parsedBody.where,
      fix: "mount the webhook with express.raw({ type: '*/*' }) and keep express.json() off that route",
    })
  } else add('webhook-raw-body', 'ok', webhookFiles.length ? 'webhook receives the raw body' : 'no webhook route found')

  const badSession = files
    .flatMap((f) => [...f.text.matchAll(/sessionId\s*:\s*['"]([^'"]*)['"]/g)].map((m) => ({ f, id: m[1] })))
    .find(({ id }) => !SESSION_ID.test(id))
  if (badSession) {
    const found = locate([badSession.f], new RegExp(`sessionId\\s*:\\s*['"]${badSession.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`))
    add('session-id', 'error', `sessionId "${badSession.id}" is rejected by the constructor (1-64 chars of A-Z a-z 0-9 _ -)`, {
      where: found?.where,
      fix: 'rename it, and rename ./.zaileys/auth/<old id> to the new id so the bot stays linked',
    })
  } else add('session-id', 'ok', 'sessionId values are valid')

  const guard = locate(files, /(authGuard|operationGuard)\s*:\s*\{[^}]*enabled\s*:\s*false/)
  if (guard) {
    add('guards', 'warn', 'a WhatsApp ban guard is disabled', {
      where: guard.where,
      fix: 'remove { enabled: false }; tune limits (maxQrAttempts, maxPairingAttempts) instead',
    })
  } else add('guards', 'ok', 'ban guards are on')

  const chatId = locate(files, /\.send\(\s*[\w.?]*\.chatId\s*[),]/)
  if (chatId) {
    add('chatid-destination', 'error', 'msg.chatId is the message ID, not a chat; sends to it fail', {
      where: chatId.where,
      fix: 'use msg.reply() or client.send(msg.roomId ?? msg.senderId)',
    })
  } else add('chatid-destination', 'ok', 'no sends to msg.chatId')

  let reconnect
  for (const { file, text } of files) {
    const lines = text.split('\n')
    for (let i = 0; i < lines.length && !reconnect; i++) {
      if (!/\.on\(\s*['"]disconnect['"]/.test(lines[i])) continue
      for (let j = i; j < Math.min(lines.length, i + 15); j++) {
        if (/\.connect\(\s*\)/.test(lines[j])) {
          reconnect = `${file}:${i + 1}`
          break
        }
        if (j > i && /^\s*\}\s*\)/.test(lines[j])) break
      }
    }
  }
  if (reconnect) {
    add('manual-reconnect', 'warn', 'connect() inside a disconnect handler stacks a second retry loop on the built-in reconnect', {
      where: reconnect,
      fix: 'log disconnects instead; tune retries with the reconnect option',
    })
  } else add('manual-reconnect', 'ok', 'no manual reconnect loop')

  const legacy = locate(files, /\bwa\.on\(|messages\.upsert|useMultiFileAuthState|\bdefinePlugins\(|\bshowLogs\s*:|\bfancyLogs\s*:/)
  if (legacy) {
    add('legacy-api', 'error', 'v3 or raw Baileys API that zaileys v4 does not have', {
      where: legacy.where,
      fix: 'use v4 events (client.on("message" | "text" | …)) and options; see the migration reference',
    })
  } else add('legacy-api', 'ok', 'no v3 or raw Baileys APIs')

  const oldPlugin = locate(files.filter((f) => /definePlugin\(/.test(f.text)), /^\s*command\s*:/)
  if (oldPlugin) {
    add('plugin-handler', 'error', 'definePlugin() handler key is "message"; "command" is ignored and fails to type-check', {
      where: oldPlugin.where,
      fix: 'rename command: to message:',
    })
  } else add('plugin-handler', 'ok', 'plugins use the message handler')

  const missingDrivers = new Map()
  for (const { file, text } of files) {
    for (const m of text.matchAll(/\b(Sqlite|Postgres|Redis|Convex)(Auth|Message)Store\b/g)) {
      const driver = STORE_DRIVERS[m[1]]
      if (!existsSync(join(dir, 'node_modules', driver, 'package.json')) && !missingDrivers.has(driver)) missingDrivers.set(driver, file)
    }
  }
  if (missingDrivers.size) {
    const list = [...missingDrivers.keys()].join(', ')
    add('store-drivers', 'error', `store driver not installed: ${list} (fails with STORE_NOT_AVAILABLE)`, {
      where: [...missingDrivers.values()][0],
      fix: `npm install ${list}`,
    })
  } else add('store-drivers', 'ok', 'store drivers are installed')

  const convertsMedia = files.some((f) => /\.sticker\(|\.audio\(|toMp4\(|ptt\s*:/.test(f.text))
  if (usesCloud && !usesWeb && !convertsMedia) {
    add('ffmpeg-webp', 'skip', 'no media conversion in a Cloud API-only project')
  } else {
    const bundled = join(dir, 'node_modules', '@ffmpeg-installer', `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg')
    const bin = env.FFMPEG_PATH || (existsSync(bundled) ? bundled : 'ffmpeg')
    const label = bin === 'ffmpeg' ? 'ffmpeg on PATH' : bin
    let result
    try {
      result = exec(bin, ['-hide_banner', '-encoders'])
    } catch {
      result = { status: null, stdout: '' }
    }
    // Animated stickers are encoded with libwebp; some bundled builds (e.g. darwin-arm64) ship without it.
    if (result.status !== 0) {
      add('ffmpeg-webp', 'warn', `could not run ${label}`, { fix: 'install ffmpeg or set FFMPEG_PATH to a working binary' })
    } else if (!/\blibwebp\b/.test(result.stdout)) {
      add('ffmpeg-webp', 'warn', `${label} has no libwebp encoder: animated stickers from video or GIF will fail`, {
        fix: 'install an ffmpeg with libwebp (e.g. brew install ffmpeg) and set FFMPEG_PATH to it',
      })
    } else add('ffmpeg-webp', 'ok', `${label} has libwebp`)
  }

  if (usesWeb) {
    const gitignore = readText(join(dir, '.gitignore'))
    if (!gitignore || !/\.zaileys/.test(gitignore)) {
      add('session-gitignore', 'warn', '.zaileys/ is not in .gitignore: session credentials could be committed', {
        fix: 'add .zaileys/ (and SQLite session files) to .gitignore',
      })
    } else add('session-gitignore', 'ok', 'session files are ignored by git')

    const compose = COMPOSE_FILES.find((f) => existsSync(join(dir, f)))
    const remoteAuth = files.some((f) => /\b(Postgres|Redis|Convex)AuthStore\b/.test(f.text))
    if (compose && !remoteAuth && !/volumes\s*:/.test(readText(join(dir, compose)) ?? '')) {
      add('docker-session-volume', 'warn', `${compose} has no volume, so the session is lost on every rebuild and the bot asks for a new QR`, {
        where: compose,
        fix: 'mount a volume at the session folder (e.g. ./data/.zaileys:/app/.zaileys) or use a database auth store',
      })
    } else add('docker-session-volume', 'ok', compose ? 'session storage survives container rebuilds' : 'no docker compose file')
  } else {
    add('session-gitignore', 'skip', 'no WhatsApp Web client')
    add('docker-session-volume', 'skip', 'no WhatsApp Web client')
  }

  return { project: dir, zaileys: installed?.version ?? null, node: nodeVersion, checks }
}

const fetchLatest = async () => {
  try {
    const res = await fetch('https://registry.npmjs.org/zaileys/latest', { signal: AbortSignal.timeout(8000) })
    return res.ok ? (await res.json()).version : undefined
  } catch {
    return undefined
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const online = args.includes('--online')
  const dir = args.find((a) => !a.startsWith('--')) ?? '.'
  const report = diagnose(dir, { online, latest: online ? await fetchLatest() : undefined })
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`zaileys doctor — ${report.project}`)
    console.log(`zaileys ${report.zaileys ?? 'not installed'} · Node.js ${report.node}\n`)
    const icon = { error: '✗', warn: '!', ok: '✓', skip: '-' }
    for (const c of report.checks.filter((x) => x.status === 'error' || x.status === 'warn')) {
      console.log(`${icon[c.status]} ${c.id}: ${c.message}${c.where ? ` (${c.where})` : ''}`)
      if (c.fix) console.log(`    fix: ${c.fix}`)
    }
    const count = (s) => report.checks.filter((c) => c.status === s).length
    console.log(`\n${count('ok')} ok, ${count('warn')} warning(s), ${count('error')} error(s), ${count('skip')} skipped`)
  }
  process.exit(report.checks.some((c) => c.status === 'error') ? 1 : 0)
}
