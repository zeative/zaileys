// Syncs the canonical skill (skills/zaileys) into the plugin copy
// (plugins/zaileys/skills/zaileys). Two copies are required because:
//   - `npx skills add zeative/zaileys` discovers skills at repo-root `skills/`.
//   - The Claude Code plugin marketplace needs the skill INSIDE the plugin dir
//     (`plugins/zaileys/`), and cached plugins cannot reference files via `../`.
// Edit the canonical `skills/zaileys/` then run `npm run skill:sync`.
import { cpSync, rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'skills', 'zaileys-official')
const dest = join(root, 'plugins', 'zaileys', 'skills', 'zaileys-official')

if (!existsSync(src)) {
  console.error('[sync-skill] canonical skills/zaileys not found')
  process.exit(1)
}

rmSync(dest, { recursive: true, force: true })
cpSync(src, dest, { recursive: true })
console.log('[sync-skill] synced skills/zaileys-official -> plugins/zaileys/skills/zaileys-official')
