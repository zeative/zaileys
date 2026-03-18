import { CommandRegistry } from './registry'
import type { CommandDefinition } from '../types/command'

/**
 * Router for nested command execution.
 */
export class CommandRouter {
  public registry = new CommandRegistry()
  private subRouters = new Map<string, CommandRouter>()

  constructor(public prefix: string = '') {}

  /**
   * Register a command to this router.
   */
  register(cmd: CommandDefinition) {
    this.registry.register(cmd)
  }

  /**
   * Get or create a sub-router.
   */
  route(name: string): CommandRouter {
    if (!this.subRouters.has(name)) {
      this.subRouters.set(name, new CommandRouter(`${this.prefix} ${name}`.trim()))
    }
    return this.subRouters.get(name)!
  }

  /**
   * Find a command or sub-router based on tokens.
   */
  match(tokens: string[]): { command?: CommandDefinition; remaining: string[]; router: CommandRouter } {
    const sub = this.subRouters.get(tokens[0])
    if (sub && tokens.length > 1) {
      return sub.match(tokens.slice(1))
    }

    const cmd = this.registry.resolve(tokens[0])
    return { command: cmd, remaining: tokens.slice(1), router: this }
  }
}
