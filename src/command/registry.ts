import { ZaileysCommandError } from './errors.js'
import type {
  CommandDefinition,
  CommandGuards,
  CommandHandler,
  CommandMeta,
  CommandSpec,
  ParsedArgs,
  RegisteredCommand,
} from './types.js'

const parseSegment = (segment: string): string[] => {
  const parts = segment
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase())
  if (parts.length === 0) {
    throw new ZaileysCommandError('INVALID_COMMAND_NAME', `empty command segment in spec`)
  }
  return parts
}

const keyOf = (parts: string[]): string => parts.join(' ')

/** The object form is sugar over the pipe syntax, so both paths share one registration routine. */
const specToString = (spec: CommandSpec): string =>
  [spec.name, ...(spec.aliases ?? [])].join('|')

const metaOf = (spec: CommandSpec): CommandMeta & CommandGuards => {
  const out: CommandMeta & CommandGuards = {}
  if (spec.description !== undefined) out.description = spec.description
  if (spec.usage !== undefined) out.usage = spec.usage
  if (spec.category !== undefined) out.category = spec.category
  if (spec.hidden !== undefined) out.hidden = spec.hidden
  if (spec.metadata !== undefined) out.metadata = spec.metadata
  if (spec.group !== undefined) out.group = spec.group
  if (spec.private !== undefined) out.private = spec.private
  if (spec.admin !== undefined) out.admin = spec.admin
  if (spec.cooldown !== undefined) out.cooldown = spec.cooldown
  return out
}

export class CommandRegistry {
  private readonly paths = new Map<string, CommandDefinition>()
  private readonly defs: CommandDefinition[] = []
  private maxDepth = 1

  register(spec: string | CommandSpec, handler: CommandHandler): void {
    const source = typeof spec === 'string' ? spec : specToString(spec)
    if (source.trim().length === 0) {
      throw new ZaileysCommandError('INVALID_COMMAND_NAME', 'command spec must not be empty')
    }

    const segments = source.split('|').map((segment) => parseSegment(segment))
    const canonicalParts = segments[0] as string[]
    const aliases = segments.slice(1).map((parts) => keyOf(parts))

    const def: CommandDefinition = {
      name: keyOf(canonicalParts),
      aliases,
      parts: canonicalParts,
      handler,
      meta: typeof spec === 'string' ? {} : metaOf(spec),
    }

    for (const parts of segments) {
      const key = keyOf(parts)
      if (this.paths.has(key)) {
        throw new ZaileysCommandError('DUPLICATE_COMMAND', `command "${key}" is already registered`)
      }
    }

    for (const parts of segments) {
      this.paths.set(keyOf(parts), def)
      if (parts.length > this.maxDepth) this.maxDepth = parts.length
    }
    this.defs.push(def)
  }

  resolve(parsed: ParsedArgs): { def: CommandDefinition; args: string[] } | undefined {
    if (!parsed.matched || parsed.name === undefined || parsed.name.length === 0) {
      return undefined
    }

    const tokens = [parsed.name.toLowerCase(), ...parsed.args.map((arg) => arg.toLowerCase())]
    const limit = Math.min(this.maxDepth, tokens.length)

    for (let depth = limit; depth >= 1; depth -= 1) {
      const key = tokens.slice(0, depth).join(' ')
      const def = this.paths.get(key)
      if (def !== undefined) {
        return { def, args: parsed.args.slice(depth - 1) }
      }
    }

    return undefined
  }

  unregister(spec: string | CommandSpec): void {
    const source = typeof spec === 'string' ? spec : specToString(spec)
    const segments = source.split('|').map((segment) => parseSegment(segment))
    const canonicalKey = keyOf(segments[0] as string[])
    const def = this.paths.get(canonicalKey)
    if (def === undefined) return
    for (const parts of [def.parts, ...def.aliases.map((a) => a.split(' '))]) {
      this.paths.delete(keyOf(parts))
    }
    const idx = this.defs.indexOf(def)
    if (idx >= 0) this.defs.splice(idx, 1)
    this.maxDepth = this.defs.reduce((max, d) => Math.max(max, d.parts.length), 1)
  }

  list(): CommandDefinition[] {
    return [...this.defs]
  }

  /** The registered commands without their handlers — what a help menu is built from. */
  describe(): RegisteredCommand[] {
    return this.defs.map((def) => ({ name: def.name, aliases: [...def.aliases], ...def.meta }))
  }
}
