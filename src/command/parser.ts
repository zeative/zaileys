import type { ParsedArgs } from './types.js'

const isJsonToken = (token: string): boolean => {
  const head = token[0]
  return head === '{' || head === '['
}

const tryJson = (token: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(token) }
  } catch {
    return { ok: false }
  }
}

const isWhitespace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'

const tokenize = (input: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false
  let started = false
  let atTokenStart = true

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i] as string

    if (escaped) {
      current += ch
      escaped = false
      started = true
      atTokenStart = false
      continue
    }

    if (ch === '\\' && quote !== null) {
      escaped = true
      continue
    }

    if (quote !== null) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      atTokenStart = false
      continue
    }

    if ((ch === '"' || ch === "'") && atTokenStart) {
      quote = ch
      started = true
      atTokenStart = false
      continue
    }

    if (isWhitespace(ch)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
      atTokenStart = true
      continue
    }

    current += ch
    started = true
    atTokenStart = false
  }

  if (started) tokens.push(current)
  return tokens
}

const matchPrefix = (text: string, prefixes: string[]): string | null => {
  for (const prefix of prefixes) {
    if (prefix.length > 0 && text.startsWith(prefix)) return prefix
  }
  return null
}

const emptyResult = (raw: string): ParsedArgs => ({
  matched: false,
  args: [],
  flags: {},
  json: undefined,
  raw,
})

export function parseCommand(text: string, prefixes: string[]): ParsedArgs {
  const prefix = matchPrefix(text, prefixes)
  if (prefix === null) return emptyResult(text)

  const body = text.slice(prefix.length)
  const tokens = tokenize(body)

  const result: ParsedArgs = {
    matched: true,
    args: [],
    flags: {},
    json: undefined,
    raw: text,
  }

  if (tokens.length === 0) {
    result.name = ''
    return result
  }

  result.name = (tokens[0] ?? '').toLowerCase()

  let jsonSet = false

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token === undefined) continue

    if (token.startsWith('--')) {
      const flagBody = token.slice(2)
      if (flagBody.length === 0) {
        result.args.push(token)
        continue
      }

      const eq = flagBody.indexOf('=')
      if (eq !== -1) {
        const key = flagBody.slice(0, eq)
        const value = flagBody.slice(eq + 1)
        result.flags[key] = value
        continue
      }

      const next = tokens[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        result.flags[flagBody] = next
        i += 1
      } else {
        result.flags[flagBody] = true
      }
      continue
    }

    if (!jsonSet && isJsonToken(token)) {
      const parsed = tryJson(token)
      if (parsed.ok) {
        result.json = parsed.value
        jsonSet = true
      }
    }

    result.args.push(token)
  }

  return result
}
