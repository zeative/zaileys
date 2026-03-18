import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SessionManager } from '../../src/managers/session'
import * as fs from 'fs'

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  rmSync: vi.fn()
}))

describe('SessionManager', () => {
  const dir = '/tmp/sessions'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create directory if not exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)
    new SessionManager(dir)
    expect(fs.mkdirSync).toHaveBeenCalledWith(dir, { recursive: true })
  })

  it('should list sessions', () => {
    vi.mocked(fs.readdirSync).mockReturnValue(['s1', 's2'] as any)
    const sm = new SessionManager(dir)
    expect(sm.list()).toEqual(['s1', 's2'])
  })

  it('should delete sessions', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true)
    const sm = new SessionManager(dir)
    sm.delete('s1')
    expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('s1'), { recursive: true })
  })
})
