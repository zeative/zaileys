import { describe, it, expect } from 'vitest'
import { CommandRouter } from '../../src/command/router'

describe('CommandRouter', () => {
  it('should match simple commands', () => {
    const router = new CommandRouter()
    const cmd: any = { name: 'ping' }
    router.register(cmd)
    
    const { command, remaining } = router.match(['ping', 'arg1'])
    expect(command).toBe(cmd)
    expect(remaining).toEqual(['arg1'])
  })

  it('should route to sub-routers', () => {
    const root = new CommandRouter()
    const admin = root.route('admin')
    const kick: any = { name: 'kick' }
    admin.register(kick)
    
    const { command, router } = root.match(['admin', 'kick', 'user1'])
    expect(command).toBe(kick)
    expect(router).toBe(admin)
  })

  it('should match partial paths if command found', () => {
    const root = new CommandRouter()
    const admin = root.route('admin')
    const config: any = { name: 'config' }
    admin.register(config)
    
    const { command } = root.match(['admin', 'config', 'set', 'key'])
    expect(command).toBe(config)
  })
})
