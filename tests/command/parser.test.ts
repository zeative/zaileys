import { describe, expect, it } from 'vitest'
import { parseCommand } from '../../src/command/parser.js'

const P = ['/', '!', '.']

describe('parseCommand — prefix matching', () => {
  it('returns matched:false when no prefix matches', () => {
    const r = parseCommand('hello world', P)
    expect(r.matched).toBe(false)
    expect(r.args).toEqual([])
    expect(r.flags).toEqual({})
    expect(r.json).toBeUndefined()
    expect(r.raw).toBe('hello world')
    expect(r.name).toBeUndefined()
  })

  it('matches the first prefix in the list', () => {
    const r = parseCommand('/ping', P)
    expect(r.matched).toBe(true)
    expect(r.name).toBe('ping')
  })

  it('matches an alternate prefix from the array', () => {
    const r = parseCommand('!ping', P)
    expect(r.matched).toBe(true)
    expect(r.name).toBe('ping')
  })

  it('matches a dot prefix', () => {
    const r = parseCommand('.help', P)
    expect(r.matched).toBe(true)
    expect(r.name).toBe('help')
  })

  it('does not match when prefix is a substring not at start', () => {
    const r = parseCommand('say /ping', P)
    expect(r.matched).toBe(false)
  })

  it('supports a multi-character prefix', () => {
    const r = parseCommand('!!menu', ['!!'])
    expect(r.matched).toBe(true)
    expect(r.name).toBe('menu')
  })

  it('ignores empty-string prefixes', () => {
    const r = parseCommand('ping', [''])
    expect(r.matched).toBe(false)
  })

  it('uses the first matching prefix when several could match', () => {
    const r = parseCommand('!!x', ['!', '!!'])
    expect(r.matched).toBe(true)
    expect(r.name).toBe('!x')
  })
})

describe('parseCommand — name normalization', () => {
  it('lowercases the command name', () => {
    const r = parseCommand('/PING', P)
    expect(r.name).toBe('ping')
  })

  it('keeps name empty but matched for prefix-only input', () => {
    const r = parseCommand('/', P)
    expect(r.matched).toBe(true)
    expect(r.name).toBe('')
    expect(r.args).toEqual([])
  })

  it('treats whitespace-only body as empty name', () => {
    const r = parseCommand('/   ', P)
    expect(r.matched).toBe(true)
    expect(r.name).toBe('')
    expect(r.args).toEqual([])
  })
})

describe('parseCommand — positional args', () => {
  it('collects positional args after the name', () => {
    const r = parseCommand('/echo a b c', P)
    expect(r.name).toBe('echo')
    expect(r.args).toEqual(['a', 'b', 'c'])
  })

  it('returns no args for a bare command', () => {
    const r = parseCommand('/ping', P)
    expect(r.args).toEqual([])
  })

  it('collapses repeated whitespace between tokens', () => {
    const r = parseCommand('/echo   a    b', P)
    expect(r.args).toEqual(['a', 'b'])
  })

  it('handles leading and trailing whitespace', () => {
    const r = parseCommand('/echo   a b   ', P)
    expect(r.name).toBe('echo')
    expect(r.args).toEqual(['a', 'b'])
  })

  it('preserves the original text in raw', () => {
    const r = parseCommand('/echo  hi ', P)
    expect(r.raw).toBe('/echo  hi ')
  })
})

describe('parseCommand — flags', () => {
  it('parses --key value as a string flag', () => {
    const r = parseCommand('/set --name alice', P)
    expect(r.flags).toEqual({ name: 'alice' })
    expect(r.args).toEqual([])
  })

  it('parses --bool at end as boolean true', () => {
    const r = parseCommand('/set --force', P)
    expect(r.flags).toEqual({ force: true })
  })

  it('parses --bool followed by another flag as boolean true', () => {
    const r = parseCommand('/set --force --name bob', P)
    expect(r.flags).toEqual({ force: true, name: 'bob' })
  })

  it('parses --key=value form', () => {
    const r = parseCommand('/set --name=alice', P)
    expect(r.flags).toEqual({ name: 'alice' })
  })

  it('parses --key=value with empty value', () => {
    const r = parseCommand('/set --name=', P)
    expect(r.flags).toEqual({ name: '' })
  })

  it('handles multiple flags', () => {
    const r = parseCommand('/set --a 1 --b 2 --c', P)
    expect(r.flags).toEqual({ a: '1', b: '2', c: true })
  })

  it('mixes flags and positional args (value flag consumes next token)', () => {
    const r = parseCommand('/move file --force dest', P)
    expect(r.args).toEqual(['file'])
    expect(r.flags).toEqual({ force: 'dest' })
  })

  it('keeps a bool flag boolean when followed by another flag', () => {
    const r = parseCommand('/move file --force --verbose', P)
    expect(r.args).toEqual(['file'])
    expect(r.flags).toEqual({ force: true, verbose: true })
  })

  it('value flag consumes the next token', () => {
    const r = parseCommand('/set --to bob extra', P)
    expect(r.flags).toEqual({ to: 'bob' })
    expect(r.args).toEqual(['extra'])
  })

  it('treats a lone -- as a positional arg', () => {
    const r = parseCommand('/echo --', P)
    expect(r.args).toEqual(['--'])
    expect(r.flags).toEqual({})
  })

  it('bool flag before positional keeps positional', () => {
    const r = parseCommand('/run --verbose task', P)
    expect(r.flags).toEqual({ verbose: 'task' })
  })
})

describe('parseCommand — quoted strings', () => {
  it('joins double-quoted tokens into one', () => {
    const r = parseCommand('/echo "hello world"', P)
    expect(r.args).toEqual(['hello world'])
  })

  it('joins single-quoted tokens into one', () => {
    const r = parseCommand("/echo 'hello world'", P)
    expect(r.args).toEqual(['hello world'])
  })

  it('strips the surrounding quotes', () => {
    const r = parseCommand('/echo "abc"', P)
    expect(r.args).toEqual(['abc'])
  })

  it('produces an empty token for empty quotes', () => {
    const r = parseCommand('/echo ""', P)
    expect(r.args).toEqual([''])
  })

  it('respects escaped double quote inside quotes', () => {
    const r = parseCommand('/echo "she said \\"hi\\""', P)
    expect(r.args).toEqual(['she said "hi"'])
  })

  it('respects escaped single quote inside quotes', () => {
    const r = parseCommand("/echo 'it\\'s ok'", P)
    expect(r.args).toEqual(["it's ok"])
  })

  it('accepts a quoted flag value with spaces', () => {
    const r = parseCommand('/set --msg "hello world"', P)
    expect(r.flags).toEqual({ msg: 'hello world' })
  })
})

describe('parseCommand — JSON detection', () => {
  it('parses a JSON object arg into json and keeps raw in args', () => {
    const r = parseCommand('/cfg {"a":1}', P)
    expect(r.json).toEqual({ a: 1 })
    expect(r.args).toEqual(['{"a":1}'])
  })

  it('parses a JSON array arg into json', () => {
    const r = parseCommand('/cfg [1,2,3]', P)
    expect(r.json).toEqual([1, 2, 3])
    expect(r.args).toEqual(['[1,2,3]'])
  })

  it('first JSON arg wins when multiple present', () => {
    const r = parseCommand('/cfg {"a":1} {"b":2}', P)
    expect(r.json).toEqual({ a: 1 })
    expect(r.args).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('falls back to plain string on malformed JSON', () => {
    const r = parseCommand('/cfg {bad}', P)
    expect(r.json).toBeUndefined()
    expect(r.args).toEqual(['{bad}'])
  })

  it('treats a quoted brace token as JSON candidate', () => {
    const r = parseCommand('/cfg "{\\"x\\":true}"', P)
    expect(r.json).toEqual({ x: true })
    expect(r.args).toEqual(['{"x":true}'])
  })

  it('does not set json for non-JSON positional', () => {
    const r = parseCommand('/echo plain', P)
    expect(r.json).toBeUndefined()
  })
})

describe('parseCommand — unicode and emoji', () => {
  it('handles unicode positional args', () => {
    const r = parseCommand('/echo héllo wörld', P)
    expect(r.args).toEqual(['héllo', 'wörld'])
  })

  it('handles emoji args', () => {
    const r = parseCommand('/echo 🔥 ✨', P)
    expect(r.args).toEqual(['🔥', '✨'])
  })

  it('handles emoji inside quotes', () => {
    const r = parseCommand('/echo "🔥 fire"', P)
    expect(r.args).toEqual(['🔥 fire'])
  })
})

describe('parseCommand — edge cases', () => {
  it('handles empty string input', () => {
    const r = parseCommand('', P)
    expect(r.matched).toBe(false)
    expect(r.raw).toBe('')
  })

  it('handles a complex mixed command', () => {
    const r = parseCommand('/deploy app {"v":2} --env prod --force', P)
    expect(r.name).toBe('deploy')
    expect(r.args).toEqual(['app', '{"v":2}'])
    expect(r.flags).toEqual({ env: 'prod', force: true })
    expect(r.json).toEqual({ v: 2 })
  })

  it('positional preceding flags are preserved', () => {
    const r = parseCommand('/deploy app staging {"v":2}', P)
    expect(r.name).toBe('deploy')
    expect(r.args).toEqual(['app', 'staging', '{"v":2}'])
    expect(r.json).toEqual({ v: 2 })
  })
})
