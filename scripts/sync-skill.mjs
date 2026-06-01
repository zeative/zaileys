// Syncs the canonical skills (skills/*) into the plugin copy
// (plugins/zaileys-official/skills/*). Two copies are required because:
//   - `npx skills add zeative/zaileys` discovers skills at repo-root `skills/`.
//   - The Claude Code plugin marketplace needs the skills INSIDE the plugin dir
//     (`plugins/zaileys-official/`), and cached plugins cannot reference files via `../`.
// Edit the canonical `skills/<name>/` then run `npm run skill:sync`.
import { cpSync, rmSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcRoot = join(root, 'skills')
const destRoot = join(root, 'plugins', 'zaileys-official', 'skills')

if (!existsSync(srcRoot)) {
  console.error('[sync-skill] canonical skills/ not found')
  process.exit(1)
}

rmSync(destRoot, { recursive: true, force: true })
mkdirSync(destRoot, { recursive: true })

const skills = readdirSync(srcRoot, { withFileTypes: true }).filter((d) => d.isDirectory())
for (const skill of skills) {
  cpSync(join(srcRoot, skill.name), join(destRoot, skill.name), { recursive: true })
}
console.log(`[sync-skill] synced ${skills.length} skill(s): ${skills.map((s) => s.name).join(', ')} -> plugins/zaileys-official/skills/`)
