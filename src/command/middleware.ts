import { ZaileysCommandError } from './errors.js'
import type { CommandContext, Middleware } from './types.js'

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
