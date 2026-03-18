import { describe, it, expect } from 'vitest'
import { CommandRegistry } from '../../src/command/registry'

describe('CommandRegistry', () => {
  it('should register and resolve commands', () => {
    const registry = new CommandRegistry()
    const cmd: any = { name: 'ping', aliases: ['p'] }
    
    registry.register(cmd)
    
    expect(registry.resolve('ping')).toBe(cmd)
    expect(registry.resolve('p')).toBe(cmd)
    expect(registry.resolve('unknown')).toBeUndefined()
  })

  it('should return all commands', () => {
    const registry = new CommandRegistry()
    registry.register({ name: 'a' } as any)
    registry.register({ name: 'b' } as any)
    
    expect(registry.all()).toHaveLength(2)
  })
})
