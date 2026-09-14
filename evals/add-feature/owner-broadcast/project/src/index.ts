import { Client } from 'zaileys'
import { config } from './config.js'
import { registerCommands } from './commands/index.js'

const client = new Client({ sessionId: config.sessionId, commandPrefix: config.prefix })

registerCommands(client)
