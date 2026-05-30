import { describe, expect, it, vi } from 'vitest'
import { CommandRegistry } from '../../src/command/registry.js'
import { ZaileysCommandError } from '../../src/command/errors.js'
import type { CommandContext, ParsedArgs } from '../../src/command/types.js'

const noop = (_ctx: CommandContext): void => {}

const parsed = (name: string, args: string[] = []): ParsedArgs => ({
  matched: true,
  name,
  args: [...args],
  flags: {},
  json: undefined,
  raw: `/${[name, ...args].join(' ')}`,
})

describe('CommandRegistry.register', () => {
  it('registers a single bare name', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    expect(reg.list()).toHaveLength(1)
    expect(reg.list()[0]?.name).toBe('ping')
  })

  it('lowercases the canonical name', () => {
    const reg = new CommandRegistry()
    reg.register('Ping', noop)
    expect(reg.list()[0]?.name).toBe('ping')
  })

  it('parses alias spec "help|h|?" into one definition with aliases', () => {
    const reg = new CommandRegistry()
    reg.register('help|h|?', noop)
    const def = reg.list()[0]
    expect(def?.name).toBe('help')
    expect(def?.aliases).toEqual(['h', '?'])
  })

  it('parses sub-command spec "group create" into parts', () => {
    const reg = new CommandRegistry()
    reg.register('group create', noop)
    const def = reg.list()[0]
    expect(def?.name).toBe('group create')
    expect(def?.parts).toEqual(['group', 'create'])
  })

  it('parses combined alias + sub-command spec "cfg set|c set"', () => {
    const reg = new CommandRegistry()
    reg.register('cfg set|c set', noop)
    const def = reg.list()[0]
    expect(def?.name).toBe('cfg set')
    expect(def?.aliases).toEqual(['c set'])
    expect(def?.parts).toEqual(['cfg', 'set'])
  })

  it('trims whitespace around alias segments', () => {
    const reg = new CommandRegistry()
    reg.register('help | h | ?', noop)
    const def = reg.list()[0]
    expect(def?.name).toBe('help')
    expect(def?.aliases).toEqual(['h', '?'])
  })

  it('throws DUPLICATE_COMMAND on duplicate name', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    try {
      reg.register('ping', noop)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(ZaileysCommandError)
      expect((err as ZaileysCommandError).code).toBe('DUPLICATE_COMMAND')
    }
  })

  it('throws DUPLICATE_COMMAND when an alias collides with an existing name', () => {
    const reg = new CommandRegistry()
    reg.register('help', noop)
    expect(() => reg.register('info|help', noop)).toThrow(ZaileysCommandError)
  })

  it('throws DUPLICATE_COMMAND when a name collides with an existing alias', () => {
    const reg = new CommandRegistry()
    reg.register('help|h', noop)
    try {
      reg.register('h', noop)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as ZaileysCommandError).code).toBe('DUPLICATE_COMMAND')
    }
  })

  it('throws DUPLICATE_COMMAND on duplicate sub-command path', () => {
    const reg = new CommandRegistry()
    reg.register('group create', noop)
    expect(() => reg.register('group create', noop)).toThrow(ZaileysCommandError)
  })

  it('throws INVALID_COMMAND_NAME on empty spec', () => {
    const reg = new CommandRegistry()
    try {
      reg.register('', noop)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as ZaileysCommandError).code).toBe('INVALID_COMMAND_NAME')
    }
  })

  it('throws INVALID_COMMAND_NAME on whitespace-only spec', () => {
    const reg = new CommandRegistry()
    expect(() => reg.register('   ', noop)).toThrow(ZaileysCommandError)
  })

  it('throws INVALID_COMMAND_NAME when an alias segment is empty', () => {
    const reg = new CommandRegistry()
    try {
      reg.register('help||h', noop)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as ZaileysCommandError).code).toBe('INVALID_COMMAND_NAME')
    }
  })
})

describe('CommandRegistry.resolve — alias', () => {
  it('resolves all aliases of "help|h|?" to the same definition', () => {
    const reg = new CommandRegistry()
    const handler = vi.fn()
    reg.register('help|h|?', handler)
    const a = reg.resolve(parsed('help'))
    const b = reg.resolve(parsed('h'))
    const c = reg.resolve(parsed('?'))
    expect(a?.def).toBe(b?.def)
    expect(b?.def).toBe(c?.def)
    expect(a?.def.handler).toBe(handler)
  })

  it('resolves a bare command with leftover args as positional', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    const out = reg.resolve(parsed('ping', ['foo', 'bar']))
    expect(out?.def.name).toBe('ping')
    expect(out?.args).toEqual(['foo', 'bar'])
  })

  it('is case-insensitive on resolution', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    expect(reg.resolve(parsed('PING'))?.def.name).toBe('ping')
  })
})

describe('CommandRegistry.resolve — sub-command longest-match', () => {
  it('resolves "group create foo" to the "group create" definition with remaining args', () => {
    const reg = new CommandRegistry()
    reg.register('group create', noop)
    const out = reg.resolve(parsed('group', ['create', 'foo']))
    expect(out?.def.parts).toEqual(['group', 'create'])
    expect(out?.args).toEqual(['foo'])
  })

  it('prefers sub-command over bare command when both registered (longest match)', () => {
    const reg = new CommandRegistry()
    const bare = vi.fn()
    const sub = vi.fn()
    reg.register('group', bare)
    reg.register('group create', sub)
    const out = reg.resolve(parsed('group', ['create', 'x']))
    expect(out?.def.handler).toBe(sub)
    expect(out?.args).toEqual(['x'])
  })

  it('falls back to bare "group" when the sub-command does not match', () => {
    const reg = new CommandRegistry()
    const bare = vi.fn()
    const sub = vi.fn()
    reg.register('group', bare)
    reg.register('group create', sub)
    const out = reg.resolve(parsed('group', ['list']))
    expect(out?.def.handler).toBe(bare)
    expect(out?.args).toEqual(['list'])
  })

  it('resolves a three-token sub-command over a two-token one', () => {
    const reg = new CommandRegistry()
    const two = vi.fn()
    const three = vi.fn()
    reg.register('group create', two)
    reg.register('group create admin', three)
    const out = reg.resolve(parsed('group', ['create', 'admin', 'rest']))
    expect(out?.def.handler).toBe(three)
    expect(out?.args).toEqual(['rest'])
  })

  it('resolves bare "group" with no args', () => {
    const reg = new CommandRegistry()
    reg.register('group', noop)
    const out = reg.resolve(parsed('group'))
    expect(out?.def.name).toBe('group')
    expect(out?.args).toEqual([])
  })

  it('resolves a sub-command via its alias path "c set"', () => {
    const reg = new CommandRegistry()
    reg.register('cfg set|c set', noop)
    const viaName = reg.resolve(parsed('cfg', ['set', 'k', 'v']))
    const viaAlias = reg.resolve(parsed('c', ['set', 'k', 'v']))
    expect(viaName?.def).toBe(viaAlias?.def)
    expect(viaAlias?.args).toEqual(['k', 'v'])
  })
})

describe('CommandRegistry.resolve — misses', () => {
  it('returns undefined for an unknown command', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    expect(reg.resolve(parsed('pong'))).toBeUndefined()
  })

  it('returns undefined when parsed did not match a prefix', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    const out = reg.resolve({ matched: false, args: [], flags: {}, json: undefined, raw: 'hi' })
    expect(out).toBeUndefined()
  })

  it('returns undefined for an empty name', () => {
    const reg = new CommandRegistry()
    reg.register('ping', noop)
    expect(reg.resolve(parsed(''))).toBeUndefined()
  })
})

describe('CommandRegistry.list', () => {
  it('dedupes aliases — one definition per registration', () => {
    const reg = new CommandRegistry()
    reg.register('help|h|?', noop)
    reg.register('ping', noop)
    expect(reg.list()).toHaveLength(2)
  })

  it('returns definitions for all distinct registrations', () => {
    const reg = new CommandRegistry()
    reg.register('group', noop)
    reg.register('group create', noop)
    const names = reg.list().map((d) => d.name)
    expect(names).toContain('group')
    expect(names).toContain('group create')
    expect(names).toHaveLength(2)
  })

  it('returns an empty array for an empty registry', () => {
    const reg = new CommandRegistry()
    expect(reg.list()).toEqual([])
  })
})
