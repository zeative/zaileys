import type { Client } from 'zaileys'
import { registerPing } from './ping.js'

export function registerHandlers(client: Client): void {
  registerPing(client)
}
