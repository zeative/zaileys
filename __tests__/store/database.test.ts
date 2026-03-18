import { describe, it, expect, beforeAll } from 'vitest'
import { Database, db } from '../../src/store/database'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'

describe('Database Abstraction', () => {
  let tempDir: string

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'zaileys-test-'))
    await Database.init(tempDir)
    return () => {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should support scoped access', async () => {
    const pluginA = db('plugin-a')
    const pluginB = db('plugin-b')

    await pluginA.set('key', 'val-a')
    await pluginB.set('key', 'val-b')

    expect(await pluginA.get('key')).toBe('val-a')
    expect(await pluginB.get('key')).toBe('val-b')
  })

  it('should list keys in scope', async () => {
    const scope = db('list-test')
    await scope.set('item1', 1)
    await scope.set('item2', 2)
    
    const keys = await scope.keys()
    expect(keys).toContain('item1')
    expect(keys).toContain('item2')
    expect(keys.length).toBe(2)
  })
})
