import { SessionManager, Zaileys } from '../src'

const session = new SessionManager('./sessions')

async function startMultiple() {
  const sessions = session.list()
  
  for (const name of sessions) {
    console.log(`Starting bot for session: ${name}`)
    // In real usage, you'd initialize a socket per session
    const bot = new Zaileys({} as any)
    bot.on('message', (ctx) => {
      console.log(`[${name}] Message received`)
    })
  }
}

startMultiple()
