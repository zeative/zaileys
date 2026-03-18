import type { ArgDefinition } from '../types/command'

/**
 * Advanced argument parser with tokenizer and flag support.
 */
export class ArgParser {
  /**
   * Tokenize input string handling quoted parts.
   */
  static tokenize(text: string): string[] {
    const tokens: string[] = []
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g
    let match
    while ((match = regex.exec(text)) !== null) {
      tokens.push(match[1] ?? match[2] ?? match[0])
    }
    return tokens
  }

  /**
   * Parse tokens into positional args and flags.
   */
  static parse(tokens: string[]): { args: string[]; parsedFlags: Record<string, any> } {
    const args: string[] = []
    const parsedFlags: Record<string, any> = {}

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      if (token.startsWith('--')) {
        const key = token.slice(2)
        const next = tokens[i + 1]
        if (next && !next.startsWith('--')) {
          parsedFlags[key] = this.coerce(next)
          i++
        } else {
          parsedFlags[key] = true
        }
      } else {
        args.push(token)
      }
    }

    return { args, parsedFlags }
  }

  /**
   * Map raw args and flags to a schema.
   */
  static mapToSchema(
    positional: string[],
    parsedFlags: Record<string, any>,
    schema: Record<string, ArgDefinition>
  ): Record<string, any> {
    const result: Record<string, any> = {}
    const schemaEntries = Object.entries(schema)

    schemaEntries.forEach(([key, def], index) => {
      let val = parsedFlags[key] ?? positional[index] ?? def.default

      if (def.required && val === undefined) {
        throw new Error(`Missing required argument: ${key}`)
      }

      if (val !== undefined) {
        result[key] = this.cast(val, def.type)
      }
    })

    return result
  }

  private static coerce(val: string): any {
    if (val === 'true') return true
    if (val === 'false') return false
    if (!isNaN(Number(val))) return Number(val)
    return val
  }

  private static cast(val: any, type: string): any {
    switch (type) {
      case 'number': return Number(val)
      case 'boolean': return val === 'true' || val === true
      case 'json': return typeof val === 'string' ? JSON.parse(val) : val
      default: return val
    }
  }
}
