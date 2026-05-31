import type { Logger } from '../client/types.js'
import type { MessageContext } from '../events/context.js'
import { ZaileysCommandError } from './errors.js'
import { runMiddleware } from './middleware.js'
import { parseCommand } from './parser.js'
import type { CommandRegistry } from './registry.js'
import type { CommandContext, Middleware } from './types.js'

/** Resolved command shape handed to {@link DispatcherDeps.buildContext}. */
export interface ResolvedCommand {
  command: string
  args: string[]
  flags: Record<string, string | boolean>
  json: unknown
  raw: string
}

/**
 * Collaborators the dispatcher needs, supplied by the Client. Kept Client-free
 * so the dispatcher is a pure function testable with a mock emitter.
 */
export interface DispatcherDeps {
  registry: CommandRegistry
  middleware: Middleware[]
  prefixes: string[]
  onText: (handler: (msg: MessageContext) => void) => () => void
  buildContext: (resolved: ResolvedCommand, msg: MessageContext) => CommandContext
  logger: Logger
}

/** Handle returned by {@link attachCommandDispatcher} to release the listener. */
export interface DispatcherHandle {
  detach(): void
}

/**
 * Wire the command framework onto an inbound `text` stream. Subscribes to
 * `deps.onText`; per message it runs {@link parseCommand} against `deps.prefixes`,
 * resolves the registration via `deps.registry`, builds a {@link CommandContext},
 * then runs the middleware chain around the handler.
 *
 * Additive and non-consuming: non-command text (no prefix match) is ignored and
 * any co-registered `on('text')` listeners keep firing. A prefix match to an
 * unregistered command is silently dropped. Handler/middleware throws are wrapped
 * as `HANDLER_ERROR` and logged via `deps.logger.error` — never propagated.
 *
 * When `deps.prefixes` is empty the dispatcher does not subscribe and `detach()`
 * is a no-op (command framework effectively disabled).
 */
export function attachCommandDispatcher(deps: DispatcherDeps): DispatcherHandle {
  if (deps.prefixes.length === 0) {
    return { detach() {} }
  }

  const handle = (msg: MessageContext): void => {
    const parsed = parseCommand(msg.text, deps.prefixes)
    if (!parsed.matched) return
    const resolution = deps.registry.resolve(parsed)
    if (resolution === undefined) return

    const resolved: ResolvedCommand = {
      command: resolution.def.name,
      args: resolution.args,
      flags: parsed.flags,
      json: parsed.json,
      raw: parsed.raw,
    }
    const ctx = deps.buildContext(resolved, msg)

    void Promise.resolve(
      runMiddleware(deps.middleware, ctx, () => resolution.def.handler(ctx)),
    ).catch((err) => {
      const wrapped =
        err instanceof ZaileysCommandError
          ? err
          : new ZaileysCommandError('HANDLER_ERROR', 'command handler failed', { cause: err })
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
