import type { Client } from 'zaileys'
import { registerMenu } from './menu.js'

export function registerCommands(client: Client): void {
  registerMenu(client)
}
