import { describe, expect, expectTypeOf, it } from 'vitest'
import * as command from '../../src/command/index.js'
import {
  CommandRegistry,
  ZaileysCommandError,
  attachCommandDispatcher,
  parseCommand,
  runMiddleware,
  type CommandContext,
  type CommandDefinition,
  type CommandHandler,
  type Middleware,
  type ParsedArgs,
} from '../../src/command/index.js'

describe('command barrel surface', () => {
  it('re-exports parseCommand', () => {
    expect(typeof command.parseCommand).toBe('function')
  })

  it('re-exports CommandRegistry', () => {
    expect(typeof command.CommandRegistry).toBe('function')
  })

  it('re-exports runMiddleware', () => {
    expect(typeof command.runMiddleware).toBe('function')
  })

  it('re-exports attachCommandDispatcher', () => {
    expect(typeof command.attachCommandDispatcher).toBe('function')
  })

  it('re-exports ZaileysCommandError', () => {
    expect(typeof command.ZaileysCommandError).toBe('function')
    expect(new ZaileysCommandError('INVALID_COMMAND_NAME', 'x')).toBeInstanceOf(Error)
  })

  it('exposes the CommandContext type shape', () => {
    expectTypeOf<CommandContext>().toHaveProperty('args')
    expectTypeOf<CommandContext>().toHaveProperty('flags')
    expectTypeOf<CommandContext>().toHaveProperty('json')
    expectTypeOf<CommandContext['reply']>().toBeFunction()
  })

  it('exposes Middleware + CommandHandler types', () => {
    const mw: Middleware = async (_ctx, next) => {
      await next()
    }
    const handler: CommandHandler = () => undefined
    expectTypeOf(mw).toBeFunction()
    expectTypeOf(handler).toBeFunction()
  })
})

describe('command smoke roundtrip', () => {
  it('parseCommand → registry.resolve resolves an aliased command', () => {
    const registry = new CommandRegistry()
    const handler: CommandHandler = () => undefined
    registry.register('a|b', handler)
    const parsed: ParsedArgs = parseCommand('/b one two', ['/'])
    expect(parsed.matched).toBe(true)
    const resolved = registry.resolve(parsed)
    expect(resolved?.def.handler).toBe(handler)
    expect(resolved?.args).toEqual(['one', 'two'])
  })

  it('registry.list returns one definition per registration', () => {
    const registry = new CommandRegistry()
    registry.register('a|b', () => undefined)
    const defs: CommandDefinition[] = registry.list()
    expect(defs).toHaveLength(1)
    expect(defs[0]?.aliases).toContain('b')
  })

  it('parseCommand parses flags and json in one pass', () => {
    const parsed = parseCommand('/x --unit metric {"a":1}', ['/'])
    expect(parsed.flags.unit).toBe('metric')
    expect(parsed.json).toEqual({ a: 1 })
  })

  it('runMiddleware runs the chain then the final handler in order', async () => {
    const order: string[] = []
    const ctx = {} as CommandContext
    const chain: Middleware[] = [
      async (_c, next) => {
        order.push('mw1')
        await next()
      },
    ]
    await runMiddleware(chain, ctx, () => {
      order.push('final')
    })
    expect(order).toEqual(['mw1', 'final'])
  })

  it('runMiddleware short-circuits when next() is skipped', async () => {
    const order: string[] = []
    const ctx = {} as CommandContext
    const chain: Middleware[] = [() => void order.push('mw-skip')]
    await runMiddleware(chain, ctx, () => order.push('final'))
    expect(order).toEqual(['mw-skip'])
  })

  it('CommandRegistry rejects duplicate registration', () => {
    const registry = new CommandRegistry()
    registry.register('dup', () => undefined)
    expect(() => registry.register('dup', () => undefined)).toThrow(ZaileysCommandError)
  })
})
