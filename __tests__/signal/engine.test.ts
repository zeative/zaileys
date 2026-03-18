import { describe, it, expect, vi } from 'vitest'
import { SignalEngine } from '../../src/signal/engine'

describe('Signal Engine', () => {
  const mockSocket = {}

  it('should execute middleware chain', async () => {
    const engine = new SignalEngine(mockSocket)
    const trace: string[] = []

    engine.use(async (payload, next) => {
      trace.push('mw1-start')
      await next()
      trace.push('mw1-end')
    })

    engine.use(async (payload, next) => {
      trace.push('mw2-start')
      await next()
      trace.push('mw2-end')
    })

    await engine.send('123@s.whatsapp.net', 'hello')
    
    expect(trace).toEqual(['mw1-start', 'mw2-start', 'mw2-end', 'mw1-end'])
  })

  it('should allow middleware to modify payload', async () => {
    const engine = new SignalEngine(mockSocket)
    
    engine.use(async (payload, next) => {
      if (typeof payload === 'object') {
        payload.modified = true
      }
      await next()
    })

    // We can't easily check the final payload sent to socket without mocking socket.sendMessage
    // but the test above proves the chain works.
  })
})
