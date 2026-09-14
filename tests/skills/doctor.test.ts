import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error -- plain ESM script without type declarations
import { diagnose } from '../../skills/zaileys/scripts/doctor.mjs'

type Check = { id: string; status: 'ok' | 'warn' | 'error' | 'skip'; message: string; fix?: string; where?: string }
type Report = { zaileys: string | null; node: string; checks: Check[] }

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const project = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'zaileys-doctor-'))
  dirs.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const installed = (version = '4.15.1', extra: Record<string, string> = {}) => ({
  'package.json': JSON.stringify({ name: 'bot', type: 'module', dependencies: { zaileys: '^4.15.0' } }),
  'node_modules/zaileys/package.json': JSON.stringify({ name: 'zaileys', version, engines: { node: '>=20.0.0' } }),
  '.gitignore': 'node_modules\n.zaileys/\n',
  ...extra,
})

const webpEncoders = ' V....D libwebp              libwebp WebP image (codec webp)\n'
const exec = (output = webpEncoders) => () => ({ status: 0, stdout: output })
const run = (dir: string, options: Record<string, unknown> = {}): Report =>
  diagnose(dir, { nodeVersion: 'v22.11.0', env: {}, exec: exec(), ...options })
const check = (report: Report, id: string) => report.checks.find((c) => c.id === id)

describe('diagnose: runtime and install', () => {
  it('reports the installed zaileys version and a clean project as ok', () => {
    const report = run(project(installed('4.15.1', { 'src/bot.ts': "import { Client } from 'zaileys'\nconst client = new Client({ sessionId: 'shop' })\n" })))
    expect(report.zaileys).toBe('4.15.1')
    expect(report.checks.filter((c) => c.status === 'error' || c.status === 'warn')).toEqual([])
  })

  it('flags a Node.js version below 20', () => {
    expect(check(run(project(installed()), { nodeVersion: 'v18.19.0' }), 'node-version')).toMatchObject({ status: 'error' })
    expect(check(run(project(installed())), 'node-version')).toMatchObject({ status: 'ok' })
  })

  it('flags zaileys declared but not installed', () => {
    const dir = project({ 'package.json': JSON.stringify({ dependencies: { zaileys: '^4' } }) })
    expect(check(run(dir), 'zaileys-installed')).toMatchObject({ status: 'error' })
  })

  it('flags a v3 range in package.json', () => {
    const dir = project(installed('4.15.1', { 'package.json': JSON.stringify({ dependencies: { zaileys: '^3.2.0' } }) }))
    expect(check(run(dir), 'zaileys-range')).toMatchObject({ status: 'error' })
  })

  it('compares with the latest release only when online', async () => {
    const dir = project(installed('4.14.1'))
    expect(check(run(dir), 'zaileys-latest')).toMatchObject({ status: 'skip' })
    const online = run(dir, { online: true, latest: '4.15.1' })
    expect(check(online, 'zaileys-latest')).toMatchObject({ status: 'warn', message: expect.stringContaining('4.15.1') })
  })

  it('never writes into the project', () => {
    const dir = project(installed('4.15.1', { 'src/bot.ts': "new Client({ provider: 'cloud', cloud: {} })\n" }))
    const snapshot = () => readdirSync(dir, { recursive: true }).map((f) => `${f}:${statSync(join(dir, String(f))).mtimeMs}`).sort()
    const before = snapshot()
    run(dir)
    expect(snapshot()).toEqual(before)
  })
})

describe('diagnose: code smells', () => {
  const smell = (id: string, bad: string, good: string, extra: Record<string, string> = {}) => {
    const badReport = run(project(installed('4.15.1', { 'src/bot.ts': bad, ...extra })))
    const goodReport = run(project(installed('4.15.1', { 'src/bot.ts': good, ...extra })))
    return { bad: check(badReport, id), good: check(goodReport, id) }
  }

  it('flags a Cloud API client without appSecret', () => {
    const { bad, good } = smell(
      'cloud-app-secret',
      "const client = new Client({\n  provider: 'cloud',\n  cloud: { accessToken: 'x', phoneNumberId: '1', verifyToken: 'v' },\n})\n",
      "const client = new Client({\n  provider: 'cloud',\n  cloud: { accessToken: 'x', phoneNumberId: '1', verifyToken: 'v', appSecret: process.env.WA_APP_SECRET },\n})\n",
    )
    expect(bad).toMatchObject({ status: 'error', where: 'src/bot.ts:2' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('warns about allowUnsigned', () => {
    const { bad, good } = smell('cloud-allow-unsigned', "new Client({ provider: 'cloud', cloud: { allowUnsigned: true } })\n", "new Client({ provider: 'cloud', cloud: { appSecret: s } })\n")
    expect(bad).toMatchObject({ status: 'warn' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('flags express.json() in a file that serves the webhook', () => {
    const { bad, good } = smell(
      'webhook-raw-body',
      "app.use(express.json())\nconst webhook = client.webhook()\napp.post('/webhook', handle)\n",
      "const webhook = client.webhook()\napp.all('/webhook', express.raw({ type: '*/*' }), handle)\napp.use('/api', express.json())\n",
    )
    expect(bad).toMatchObject({ status: 'error', where: 'src/bot.ts:1' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('flags a sessionId the constructor rejects', () => {
    const { bad, good } = smell('session-id', "new Client({ sessionId: 'toko.utama' })\n", "new Client({ sessionId: 'toko_utama-2' })\n")
    expect(bad).toMatchObject({ status: 'error', message: expect.stringContaining('toko.utama') })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('warns when a ban guard is disabled', () => {
    const { bad, good } = smell('guards', "new Client({ authGuard: { enabled: false } })\n", "new Client({ authGuard: { maxQrAttempts: 10 } })\n")
    expect(bad).toMatchObject({ status: 'warn' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('flags msg.chatId used as a send destination', () => {
    const { bad, good } = smell('chatid-destination', 'await client.send(msg.chatId).text(reply)\n', 'await client.send(msg.roomId ?? msg.senderId).text(reply)\nconsole.log(msg.chatId)\n')
    expect(bad).toMatchObject({ status: 'error' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('warns about reconnecting from a disconnect handler', () => {
    const { bad, good } = smell(
      'manual-reconnect',
      "client.on('disconnect', async () => {\n  await client.connect()\n})\n",
      "client.on('disconnect', ({ willReconnect }) => {\n  if (!willReconnect) console.error('stopped')\n})\nawait client.connect()\n",
    )
    expect(bad).toMatchObject({ status: 'warn', where: 'src/bot.ts:1' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('flags v3 and raw Baileys APIs', () => {
    const { bad, good } = smell('legacy-api', "wa.on('messages', (ctx) => {})\nsock.ev.on('messages.upsert', () => {})\n", "client.on('message', (msg) => {})\n")
    expect(bad).toMatchObject({ status: 'error' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('flags plugins that still use the command handler key', () => {
    const { bad, good } = smell(
      'plugin-handler',
      "export default definePlugin({\n  name: 'menu',\n  command: async (ctx) => ctx.reply('menu'),\n})\n",
      "export default definePlugin({\n  name: 'menu',\n  message: async (ctx) => ctx.reply('menu'),\n})\n",
    )
    expect(bad).toMatchObject({ status: 'error', where: 'src/bot.ts:3' })
    expect(good).toMatchObject({ status: 'ok' })
  })

  it('ignores node_modules and build output', () => {
    const dir = project(installed('4.15.1', { 'dist/bot.js': 'client.send(msg.chatId)\n', 'node_modules/x/index.js': "wa.on('messages')\n" }))
    const report = run(dir)
    expect(check(report, 'chatid-destination')).toMatchObject({ status: 'ok' })
    expect(check(report, 'legacy-api')).toMatchObject({ status: 'ok' })
  })
})

describe('diagnose: stores, ffmpeg, session files', () => {
  it('flags a database store whose driver is not installed', () => {
    const code = "import { Client, SqliteAuthStore } from 'zaileys'\nnew Client({ auth: new SqliteAuthStore({ database: './s.db' }) })\n"
    const missing = run(project(installed('4.15.1', { 'src/bot.ts': code })))
    const present = run(project(installed('4.15.1', { 'src/bot.ts': code, 'node_modules/better-sqlite3/package.json': '{"version":"11.0.0"}' })))
    expect(check(missing, 'store-drivers')).toMatchObject({ status: 'error', message: expect.stringContaining('better-sqlite3') })
    expect(check(present, 'store-drivers')).toMatchObject({ status: 'ok' })
  })

  it('warns when the ffmpeg zaileys will use has no WebP encoder', () => {
    const dir = project(installed())
    expect(check(run(dir, { exec: exec(' A....D aac   AAC\n') }), 'ffmpeg-webp')).toMatchObject({ status: 'warn', fix: expect.stringContaining('FFMPEG_PATH') })
    expect(check(run(dir), 'ffmpeg-webp')).toMatchObject({ status: 'ok' })
  })

  it('prefers FFMPEG_PATH when it is set', () => {
    const calls: string[] = []
    const spy = (bin: string) => {
      calls.push(bin)
      return { status: 0, stdout: webpEncoders }
    }
    run(project(installed()), { env: { FFMPEG_PATH: '/opt/ffmpeg/bin/ffmpeg' }, exec: spy })
    expect(calls).toEqual(['/opt/ffmpeg/bin/ffmpeg'])
  })

  it('skips the ffmpeg check for a Cloud API-only project without media conversion', () => {
    const dir = project(installed('4.15.1', { 'src/bot.ts': "new Client({ provider: 'cloud', cloud: { appSecret: s } })\n" }))
    expect(check(run(dir, { exec: exec('') }), 'ffmpeg-webp')).toMatchObject({ status: 'skip' })
  })

  it('warns when session files are not ignored by git', () => {
    const dir = project(installed('4.15.1', { '.gitignore': 'node_modules\n', 'src/bot.ts': 'new Client()\n' }))
    expect(check(run(dir), 'session-gitignore')).toMatchObject({ status: 'warn' })
  })

  it('warns when docker compose runs a WhatsApp Web bot without a volume', () => {
    const bot = "new Client({ sessionId: 'shop' })\n"
    const bare = run(project(installed('4.15.1', { 'src/bot.ts': bot, 'docker-compose.yml': 'services:\n  bot:\n    build: .\n' })))
    const mounted = run(project(installed('4.15.1', { 'src/bot.ts': bot, 'docker-compose.yml': 'services:\n  bot:\n    build: .\n    volumes:\n      - ./data/.zaileys:/app/.zaileys\n' })))
    expect(check(bare, 'docker-session-volume')).toMatchObject({ status: 'warn' })
    expect(check(mounted, 'docker-session-volume')).toMatchObject({ status: 'ok' })
  })
})
