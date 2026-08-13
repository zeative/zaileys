import type { Logger } from '../client/types.js'
import type { MessageContext } from '../events/context.js'
import { ZaileysCommandError } from './errors.js'
import { checkGuards, type GuardBlock } from './guards.js'
import { runMiddleware } from './middleware.js'
import { parseCommand } from './parser.js'
import type { CommandRegistry } from './registry.js'
import type { CommandContext, Middleware } from './types.js'

export interface ResolvedCommand {
  command: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  raw: string
}

export interface DispatcherDeps {
  registry: CommandRegistry
  middleware: Middleware[]
  prefixes: string[]
  onText: (handler: (msg: MessageContext) => void) => () => void
  buildContext: (resolved: ResolvedCommand, msg: MessageContext) => CommandContext
  logger: Logger
  isAdmin?: (groupJid: string, senderJid: string) => Promise<boolean>
  onBlocked?: (block: GuardBlock, ctx: CommandContext) => void
  /** Return `true` to claim the failure; otherwise the dispatcher logs it. */
  onError?: (error: unknown, ctx: CommandContext) => boolean
  onNotFound?: (name: string, msg: MessageContext) => void
}

export interface DispatcherHandle {
  detach(): void
}

export function attachCommandDispatcher(deps: DispatcherDeps): DispatcherHandle {
  if (deps.prefixes.length === 0) {
    return { detach() {} }
  }

  const handle = (msg: MessageContext): void => {
    const parsed = parseCommand(msg.text, deps.prefixes)
    if (!parsed.matched) return
    const resolution = deps.registry.resolve(parsed)
    if (resolution === undefined) {
      if (parsed.name !== undefined && parsed.name.length > 0) deps.onNotFound?.(parsed.name, msg)
      return
    }

    const resolved: ResolvedCommand = {
      command: resolution.def.name,
      args: resolution.args,
      flags: parsed.flags,
      json: parsed.json,
      raw: parsed.raw,
    }
    const ctx = deps.buildContext(resolved, msg)

    const run = async (): Promise<void> => {
      const block = await checkGuards(resolution.def.meta, ctx, {
        isAdmin: deps.isAdmin ?? (async () => false),
        now: () => Date.now(),
      })
      if (block !== null) {
        deps.onBlocked?.(block, ctx)
        return
      }
      await runMiddleware(deps.middleware, ctx, () => resolution.def.handler(ctx))
    }

    void run().catch((err) => {
      const wrapped =
        err instanceof ZaileysCommandError
          ? err
          : new ZaileysCommandError('HANDLER_ERROR', 'command handler failed', { cause: err })
      /** A listener takes ownership of the failure; without one it would vanish into the log. */
      if (deps.onError?.(wrapped, ctx) === true) return
      deps.logger.error(wrapped, 'command dispatch failed')
    })
  }

  const unsubscribe = deps.onText(handle)
  let detached = false
  return {
    detach() {
      if (detached) return
      detached = true
      unsubscribe()
    },
  }
}
