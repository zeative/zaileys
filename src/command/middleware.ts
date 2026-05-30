import { ZaileysCommandError } from './errors.js'
import type { CommandContext, Middleware } from './types.js'

/**
 * Run a middleware chain koa-style around a final handler. Each middleware
 * receives `(ctx, next)`; calling `next()` advances to the next middleware and
 * ultimately to `final`. Not calling `next()` short-circuits the chain: `final`
 * and all downstream middleware are skipped while upstream after-logic still runs.
 *
 * A middleware that throws is wrapped as a `MIDDLEWARE_ERROR` (the original kept
 * as `cause`; an existing {@link ZaileysCommandError} passes through unwrapped)
 * and the rejection propagates. Errors thrown by `final` propagate as-is — the
 * dispatcher owns `HANDLER_ERROR` wrapping. Calling `next()` twice in a single
 * middleware throws a `MIDDLEWARE_ERROR`.
 */
export async function runMiddleware(
  chain: Middleware[],
  ctx: CommandContext,
  final: () => Promise<void> | void,
): Promise<void> {
  let lastIndex = -1
  const finalFault = { error: undefined as unknown, thrown: false }

  const dispatch = async (index: number): Promise<void> => {
    if (index <= lastIndex) {
      throw new ZaileysCommandError('MIDDLEWARE_ERROR', 'next() called multiple times')
    }
    lastIndex = index

    if (index === chain.length) {
      try {
        await final()
      } catch (err) {
        finalFault.error = err
        finalFault.thrown = true
        throw err
      }
      return
    }

    const middleware = chain[index] as Middleware
    try {
      await middleware(ctx, () => dispatch(index + 1))
    } catch (err) {
      if (finalFault.thrown) throw err
      if (err instanceof ZaileysCommandError) throw err
      throw new ZaileysCommandError('MIDDLEWARE_ERROR', 'middleware threw during execution', { cause: err })
    }
  }

  await dispatch(0)
}
