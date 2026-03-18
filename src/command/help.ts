import { CommandRouter } from './router'

/**
 * Generates help menu from the registry.
 */
export class HelpGenerator {
  constructor(private router: CommandRouter) {}

  /**
   * Generate a formatted menu string.
   */
  generate(): string {
    const commands = this.router.registry.all()
    const categories = new Map<string, string[]>()

    commands.forEach(cmd => {
      const cat = cmd.category || 'General'
      if (!categories.has(cat)) categories.set(cat, [])
      categories.get(cat)!.push(`• ${cmd.name}: ${cmd.description || 'No description'}`)
    })

    let output = 'Zaileys V4 — Command Menu\n\n'
    categories.forEach((cmds, cat) => {
      output += `[ ${cat} ]\n${cmds.join('\n')}\n\n`
    })

    return output.trim()
  }
}
