import { describe, it, expect } from 'vitest'
import { CommandRouter } from '../../src/command/router'
import { HelpGenerator } from '../../src/command/help'

describe('HelpGenerator', () => {
  it('should generate a menu with categories', () => {
    const router = new CommandRouter()
    router.register({ name: 'ping', description: 'pong', category: 'Utility' } as any)
    router.register({ name: 'help', description: 'menu', category: 'General' } as any)
    
    const generator = new HelpGenerator(router)
    const menu = generator.generate()
    
    expect(menu).toContain('[ Utility ]')
    expect(menu).toContain('• ping: pong')
    expect(menu).toContain('[ General ]')
    expect(menu).toContain('• help: menu')
  })
})
