// Type-checks every ```ts block in the docs against src/ so API drift fails loudly.
// Opt a block out with `{/* snippet-check: skip — <reason> */}` on the line above its fence.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DOCS = join(ROOT, 'docs')
// Per-process dir so several checks (e.g. parallel writers) never wipe each other's files.
const OUT = join(ROOT, 'node_modules', '.cache', `docs-snippets-${process.pid}`)
// Optional path arguments narrow the check, e.g. `pnpm docs:check docs/bots`.
const TARGETS = process.argv.slice(2).map((p) => resolve(process.cwd(), p))
const inTargets = (file) => !TARGETS.length || TARGETS.some((t) => file === t || file.startsWith(t + sep))
const LANGS = new Set(['ts', 'typescript'])
const SKIP = /\{\/\*\s*snippet-check:\s*skip\b(.*?)\*\/\}/

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' ? [] : walk(path)
    return path.endsWith('.mdx') ? [path] : []
  })

const problems = []
const snippets = []
let skipped = 0

for (const file of walk(DOCS).filter(inTargets)) {
  const lines = readFileSync(file, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(\s*)```(\w+)/)
    if (!open) continue
    let end = i + 1
    while (end < lines.length && !/^\s*```\s*$/.test(lines[end])) end++
    if (LANGS.has(open[2])) {
      const where = `${relative(ROOT, file)}:${i + 1}`
      const prev = lines.slice(0, i).reverse().find((l) => l.trim())
      const skip = prev?.match(SKIP)
      if (skip && !skip[1].replace(/^[\s—–:-]+/, '').trim()) problems.push(`${where}  skip marker needs a reason`)
      else if (skip) skipped++
      else {
        // Fences inside <Tabs>/<Steps> are indented; strip that indent so the code compiles as written.
        const indent = open[1].length
        const code = lines.slice(i + 1, end).map((l) => l.slice(Math.min(indent, l.search(/\S|$/))))
        snippets.push({ file, firstLine: i + 2, code: code.join('\n') })
      }
    }
    i = end
  }
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
// `export {}` makes each snippet its own module, so its locals shadow the prelude's ambient names.
snippets.forEach((s, n) => writeFileSync(join(OUT, `s${n}.ts`), `export {}\n${s.code}\n`))
writeFileSync(join(OUT, 'package.json'), '{ "type": "module" }\n')
writeFileSync(
  join(OUT, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2023'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        // Plain `strict` mirrors a typical user project, not zaileys' stricter internal config.
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        types: ['node'],
        typeRoots: [join(ROOT, 'node_modules', '@types')],
        paths: { zaileys: [join(ROOT, 'src', 'index.ts')], '~/*': [join(ROOT, 'src', '*')] },
      },
      // src ships ambient shims for optional deps (sharp, node-webpmux) that imports alone don't pull in.
      include: ['*.ts', join(DOCS, 'scripts', 'prelude.d.ts'), join(ROOT, 'src', '**', '*.d.ts')],
    },
    null,
    2,
  ),
)

const started = Date.now()
const tsc = snippets.length
  ? spawnSync(join(ROOT, 'node_modules', '.bin', 'tsc'), ['-p', join(OUT, 'tsconfig.json'), '--pretty', 'false'], {
      encoding: 'utf8',
    })
  : { stdout: '', stderr: '', status: 0 }
// spawnSync reports a missing binary through `error` and leaves stdout/stderr null.
if (tsc.error) {
  console.error(`✗ could not run tsc (${tsc.error.code ?? tsc.error.message}) — install dependencies with \`pnpm install\` first`)
  process.exit(1)
}
const foreign = []
for (const line of `${tsc.stdout}\n${tsc.stderr}`.split('\n')) {
  const m = line.match(/[\\/]s(\d+)\.ts\((\d+),(\d+)\): error (TS\d+): (.*)/)
  if (m) {
    const s = snippets[Number(m[1])]
    problems.push(`${relative(ROOT, s.file)}:${s.firstLine + Number(m[2]) - 2}  ${m[4]} ${m[5]}`)
  } else if (/error TS\d+/.test(line)) foreign.push(line.trim())
}
if (tsc.status !== 0 && !problems.length && !foreign.length) foreign.push(`tsc exited ${tsc.status}: ${tsc.stderr.trim()}`)

const secs = ((Date.now() - started) / 1000).toFixed(1)
rmSync(OUT, { recursive: true, force: true })
if (foreign.length) console.error(`Errors outside doc snippets (src or config):\n  ${foreign.join('\n  ')}\n`)
if (problems.length) {
  console.error(`✗ ${problems.length} problem(s) in ${snippets.length} snippet(s):\n  ${problems.join('\n  ')}`)
  process.exit(1)
}
if (foreign.length) process.exit(1)
console.log(`✓ ${snippets.length} snippet(s) type-check, ${skipped} skipped (${secs}s)`)
