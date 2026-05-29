import { readFileSync, statSync, readdirSync } from 'node:fs'
import { join, extname } from 'node:path'

interface Violation {
  file: string
  line: number
  kind: 'inline' | 'block' | 'html'
  snippet: string
}

const SRC_ROOTS = ['src']
const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.session', '.temp', '.planning'])

const walk = (dir: string, out: string[]): void => {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, out)
      continue
    }
    if (entry.endsWith('.d.ts')) continue
    if (TS_EXTS.has(extname(entry))) out.push(full)
  }
}

const isInsideString = (line: string, idx: number): boolean => {
  let single = false
  let double = false
  let backtick = false
  for (let i = 0; i < idx; i++) {
    const ch = line[i]
    const prev = i > 0 ? line[i - 1] : ''
    if (prev === '\\') continue
    if (ch === "'" && !double && !backtick) single = !single
    else if (ch === '"' && !single && !backtick) double = !double
    else if (ch === '`' && !single && !double) backtick = !backtick
  }
  return single || double || backtick
}

const isTripleSlashDirective = (line: string): boolean => {
  return line.trimStart().startsWith('///')
}

const scanFile = (path: string): Violation[] => {
  const content = readFileSync(path, 'utf8')
  const lines = content.split('\n')
  const violations: Violation[] = []
  let inBlockTsDoc = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const trimmed = line.trimStart()
    if (trimmed.startsWith('/**')) {
      inBlockTsDoc = true
      if (trimmed.includes('*/')) inBlockTsDoc = false
      continue
    }
    if (inBlockTsDoc) {
      if (trimmed.includes('*/')) inBlockTsDoc = false
      continue
    }
    if (isTripleSlashDirective(line)) continue
    const inlineIdx = line.indexOf('//')
    if (inlineIdx >= 0 && !isInsideString(line, inlineIdx)) {
      violations.push({ file: path, line: i + 1, kind: 'inline', snippet: line.trim() })
      continue
    }
    const blockIdx = line.indexOf('/*')
    if (blockIdx >= 0 && !isInsideString(line, blockIdx) && !line.trimStart().startsWith('/**')) {
      violations.push({ file: path, line: i + 1, kind: 'block', snippet: line.trim() })
      continue
    }
    if (line.includes('<!--')) {
      violations.push({ file: path, line: i + 1, kind: 'html', snippet: line.trim() })
    }
  }
  return violations
}

const main = (): void => {
  const files: string[] = []
  for (const root of SRC_ROOTS) {
    try {
      walk(root, files)
    } catch (err) {
      console.error(`audit-comments: cannot read ${root}: ${(err as Error).message}`)
      process.exit(2)
    }
  }
  const violations: Violation[] = []
  for (const f of files) violations.push(...scanFile(f))
  if (violations.length === 0) {
    console.log(`audit-comments: OK (${files.length} files scanned, 0 violations)`)
    process.exit(0)
  }
  console.error(`audit-comments: FAIL (${violations.length} violations across ${files.length} files)`)
  for (const v of violations) console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.snippet}`)
  process.exit(1)
}

main()
