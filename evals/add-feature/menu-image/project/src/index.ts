import { Client } from 'zaileys'
import { config } from './config.js'
import { registerHandlers } from './handlers/index.js'

const client = new Client({ sessionId: config.sessionId })

registerHandlers(client)
