import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const SCRIPT = join(process.cwd(), 'scripts', 'audit-no-any.ts')

interface RunResult {
  status: number
  stdout: string
  stderr: string
}

const runAudit = (root: string): RunResult => {
  try {
    const stdout = execFileSync('pnpm', ['exec', 'tsx', SCRIPT, root], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout, stderr: '' }
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string }
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' }
  }
}

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'audit-no-any-'))
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('audit-no-any script', () => {
  it('rejects a `: any` annotation', () => {
    const f = join(dir, 'foo.ts')
    writeFileSync(f, 'export const foo = (x: any): void => { void x }\n')
    const r = runAudit(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('foo.ts')
    rmSync(f)
  })

  it('rejects an `as any` cast', () => {
    const f = join(dir, 'bar.ts')
    writeFileSync(f, 'export const bar = (JSON.parse("{}") as any)\n')
    const r = runAudit(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('bar.ts')
    rmSync(f)
  })

  it('rejects an angle-bracket `<any>` cast', () => {
    const f = join(dir, 'baz.ts')
    writeFileSync(f, 'export const baz = <any>({})\n')
    const r = runAudit(dir)
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('baz.ts')
    rmSync(f)
  })

  it('rejects generic `Promise<any>`', () => {
    const f = join(dir, 'gen.ts')
    writeFileSync(f, 'export const gen = (): Promise<any> => Promise.resolve()\n')
    const r = runAudit(dir)
    expect(r.status).toBe(1)
    rmSync(f)
  })

  it('accepts unknown / as unknown as / never', () => {
    const f = join(dir, 'clean.ts')
    writeFileSync(
      f,
      'export const a = (x: unknown): never => { throw x as unknown as Error }\n',
    )
    const r = runAudit(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('OK')
    rmSync(f)
  })

  it('honors the ignore-next-line escape hatch', () => {
    const f = join(dir, 'escape.ts')
    writeFileSync(
      f,
      '// audit-no-any: ignore-next-line\nexport const e = (x: any): void => { void x }\n',
    )
    const r = runAudit(dir)
    expect(r.status).toBe(0)
    rmSync(f)
  })

  it('passes on an empty tree', () => {
    const r = runAudit(dir)
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('OK')
  })

  it('passes on the real src/events tree', () => {
    const r = runAudit(join(process.cwd(), 'src', 'events'))
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('OK')
  })
})
