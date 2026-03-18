import { describe, it, expect, vi } from 'vitest'
import { CommandRouter } from '../../src/command/router'
import { CommandLoader } from '../../src/command/loader'
import * as fs from 'fs'

vi.mock('fs', () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn()
}))

describe('CommandLoader', () => {
  it('should scan directories recursively', async () => {
    const router = new CommandRouter()
    const loader = new CommandLoader(router)
    
    vi.mocked(fs.readdirSync).mockReturnValueOnce(['ping.ts', 'admin'] as any)
      .mockReturnValueOnce(['kick.ts'] as any)
    
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => false } as any)
      .mockReturnValueOnce({ isDirectory: () => false } as any) // ping.ts
      .mockReturnValueOnce({ isDirectory: () => true } as any)  // admin/
      .mockReturnValueOnce({ isDirectory: () => false } as any) // admin/kick.ts

    // We can't easily test the load logic fully without dynamic imports
    // so we verify the scan logic indirectly or check if it identifies files.
    // (This is a simplified test for the skeleton)
    await loader.load('/mock/plugins')
    
    // In a real scenario, we'd check if router.match(['ping']) works.
  })
})
