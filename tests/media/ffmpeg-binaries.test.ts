import { describe, expect, it, afterEach } from 'vitest'
import { promises as fs, constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { resolveExecutable } from '../../src/media/ffmpeg/core.js'

const tmpFiles: string[] = []
const tmpFile = async (mode: number): Promise<string> => {
  const file = path.join(os.tmpdir(), `zaileys-bin-${randomBytes(4).toString('hex')}`)
  await fs.writeFile(file, '#!/bin/sh\nexit 0\n', { mode })
  await fs.chmod(file, mode)
  tmpFiles.push(file)
  return file
}

afterEach(async () => {
  await Promise.all(tmpFiles.splice(0).map((f) => fs.rm(f, { force: true })))
})

const isExecutable = async (file: string): Promise<boolean> =>
  fs.access(file, constants.X_OK).then(() => true, () => false)

describe('resolveExecutable', () => {
  it('uses the bundled binary when it is already executable', async () => {
    if (process.platform === 'win32') return
    const bin = await tmpFile(0o755)
    await expect(resolveExecutable(bin, 'ffprobe')).resolves.toBe(bin)
  })

  it('repairs a bundled binary whose postinstall chmod never ran (pnpm 10 blocks it)', async () => {
    if (process.platform === 'win32') return
    const bin = await tmpFile(0o644)
    expect(await isExecutable(bin)).toBe(false)
    await expect(resolveExecutable(bin, 'ffprobe')).resolves.toBe(bin)
    expect(await isExecutable(bin)).toBe(true)
  })

  it('falls back to the PATH name when the bundled binary is missing', async () => {
    await expect(resolveExecutable('/nonexistent/zaileys/ffprobe', 'ffprobe')).resolves.toBe('ffprobe')
  })

  it('falls back to the PATH name when no bundled binary is known', async () => {
    await expect(resolveExecutable(undefined, 'ffmpeg')).resolves.toBe('ffmpeg')
  })
})
