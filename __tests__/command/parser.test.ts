import { describe, it, expect } from 'vitest'
import { ArgParser } from '../../src/command/parser'

describe('ArgParser', () => {
  it('should tokenize strings with quotes correctly', () => {
    const input = 'greet "Zalgo Dev" --loud'
    const tokens = ArgParser.tokenize(input)
    expect(tokens).toEqual(['greet', 'Zalgo Dev', '--loud'])
  })

  it('should parse positional args and flags', () => {
    const tokens = ['greet', 'Zalgo', '--loud', '--repeat', '3']
    const { args, parsedFlags } = ArgParser.parse(tokens)
    expect(args).toEqual(['greet', 'Zalgo'])
    expect(parsedFlags).toEqual({ loud: true, repeat: 3 })
  })

  it('should map to schema with type casting', () => {
    const positional = ['Zalgo']
    const parsedFlags = { repeat: '5', silent: 'true' }
    const schema: any = {
      name: { type: 'string', required: true },
      repeat: { type: 'number' },
      silent: { type: 'boolean' }
    }

    const typed = ArgParser.mapToSchema(positional, parsedFlags, schema)
    expect(typed.name).toBe('Zalgo')
    expect(typed.repeat).toBe(5)
    expect(typed.silent).toBe(true)
  })

  it('should throw error on missing required args', () => {
    const schema: any = {
      id: { type: 'string', required: true }
    }
    expect(() => ArgParser.mapToSchema([], {}, schema)).toThrow(/Missing required argument/)
  })
})
