import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

interface Violation {
  file: string
  line: number
  col: number
  snippet: string
}

const DEFAULT_ROOT = 'src/events'
const TS_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.session', '.temp', '.planning'])
const IGNORE_MARKER = 'audit-no-any: ignore-next-line'

const ANY_PATTERNS: RegExp[] = [
  /:\s*any\b/g,
  /\bas\s+any\b/g,
  /<any>/g,
  /<\s*any\s*[,>]/g,
  /,\s*any\s*>/g,
]

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

const stripCommentLike = (line: string): string => {
  const idx = line.indexOf('//')
  if (idx >= 0 && !isInsideString(line, idx)) return line.slice(0, idx)
  return line
}

const scanFile = (path: string): Violation[] => {
  const content = readFileSync(path, 'utf8')
  const lines = content.split('\n')
  const violations: Violation[] = []
  for (let i = 0; i < lines.length; i++) {
    const prev = i > 0 ? (lines[i - 1] ?? '') : ''
    if (prev.includes(IGNORE_MARKER)) continue
    const code = stripCommentLike(lines[i] ?? '')
    for (const pattern of ANY_PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = pattern.exec(code)) !== null) {
        const col = match.index + 1
        if (isInsideString(code, match.index)) continue
        violations.push({ file: path, line: i + 1, col, snippet: (lines[i] ?? '').trim() })
      }
    }
  }
  return violations
}

const main = (): void => {
  const root = process.argv[2] ?? DEFAULT_ROOT
  const files: string[] = []
  try {
    walk(root, files)
  } catch (err) {
    console.error(`audit-no-any: cannot read ${root}: ${(err as Error).message}`)
    process.exit(2)
  }
  const violations: Violation[] = []
  for (const f of files) violations.push(...scanFile(f))
  if (violations.length === 0) {
    console.log(`audit-no-any: OK (${files.length} files scanned, 0 violations)`)
    process.exit(0)
  }
  console.error(`audit-no-any: FAIL (${violations.length} violations across ${files.length} files)`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}:${v.col}: literal 'any' found -> ${v.snippet}`)
  }
  process.exit(1)
}

main()
