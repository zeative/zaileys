import type { CommandContext, CommandDefinition } from '../types/command'

/**
 * Executes a command through its middleware pipeline.
 */
export async function executeCommand(ctx: CommandContext, cmd: CommandDefinition) {
  const middlewares = [...(cmd.middleware || [])]
  let index = -1

  const next = async () => {
    index++
    if (index < middlewares.length) {
      await middlewares[index](ctx, next)
    } else {
      await cmd.execute(ctx)
    }
  }

  await next()
}
