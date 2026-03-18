import type { CommandDefinition } from '../types/command'

/**
 * Registry for storing and retrieving commands and sub-routers.
 */
export class CommandRegistry {
  private commands = new Map<string, CommandDefinition>()
  private aliases = new Map<string, string>()

  /**
   * Register a new command.
   */
  register(cmd: CommandDefinition) {
    this.commands.set(cmd.name, cmd)
    if (cmd.aliases) {
      cmd.aliases.forEach(alias => this.aliases.set(alias, cmd.name))
    }
  }

  /**
   * Resolve a command by name or alias.
   */
  resolve(name: string): CommandDefinition | undefined {
    const actualName = this.aliases.get(name) || name
    return this.commands.get(actualName)
  }

  /**
   * Get all registered commands.
   */
  all(): CommandDefinition[] {
    return Array.from(this.commands.values())
  }
}
