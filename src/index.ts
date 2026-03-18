import { Zaileys } from './core/zaileys'
import { definePlugin } from './core/plugins'
import { guards } from './command/guards'
import { SessionManager } from './managers/session'

export {
  Zaileys,
  definePlugin,
  guards,
  SessionManager
}

export * from './types/command'
export * from './types/context'

/**
 * Shorthand for creating a new bot instance.
 */
export function createBot(socket: any) {
  return new Zaileys(socket)
}
