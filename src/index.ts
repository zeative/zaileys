import { Zaileys } from './core/zaileys'
import { definePlugin } from './core/plugins'
import { guards } from './command/guards'

export {
  Zaileys,
  definePlugin,
  guards
}

export * from './types/command'
export * from './types/context'

/**
 * Shorthand for creating a new bot instance.
 */
export function createBot(socket: any) {
  return new Zaileys(socket)
}
