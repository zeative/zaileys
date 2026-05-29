import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const probe = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim()
  } catch (err) {
    return `ERROR: ${(err as Error).message}`
  }
}

const report = {
  timestamp: new Date().toISOString(),
  tsgoVersion: probe('pnpm exec tsgo --version'),
  tscVersion: probe('pnpm exec tsc --version'),
  tsgoHelp: probe('pnpm exec tsgo --help 2>&1 | head -60'),
  nodeVersion: process.version,
  flagsAudit: {
    strict: 'planned in tsconfig.json — verify tsgo accepts',
    exactOptionalPropertyTypes: 'verify with: tsgo --noEmit --exactOptionalPropertyTypes',
    noUncheckedIndexedAccess: 'verify with: tsgo --noEmit --noUncheckedIndexedAccess',
    verbatimModuleSyntax: 'verify with: tsgo --noEmit --verbatimModuleSyntax',
    isolatedModules: 'tsup requirement',
  },
  knownLimitations: [
    'tsgo declaration emit (--declaration) — pending verification; tsup may fall back to internal rollup-plugin-dts which uses tsc',
    'Decorator emit — tsgo support pending stable',
    'JSX transform — not needed for zaileys (no JSX)',
  ],
  fallbackPlan: 'If tsgo blocks any required flag, set TYPESCRIPT=tsc env and use typecheck:legacy. Document blocker in DEPENDENCIES.md and summary.',
}

const outPath = '.planning/phases/01-foundation-cleanup/tsgo-audit.json'
mkdirSync(dirname(outPath), { recursive: true })
const json = JSON.stringify(report, null, 2)
writeFileSync(outPath, json)
console.log(json)
console.log(`\nAudit written to ${outPath}`)
