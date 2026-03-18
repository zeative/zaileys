import { Resolver } from './resolver'
import { SentMessage } from './sent-message'
import type { MessageActions } from '../types/context'

/**
 * The Signal Engine manages the outgoing message pipeline.
 * It resolves payload types and executes the transformer chain.
 */
export class SignalEngine {
  private transformers = new Map<string, any>()
  private middlewarres: ((payload: any, next: () => Promise<void>) => Promise<void>)[] = []

  constructor(private socket: any) {}

  async send(jid: string, payload: any, options: any = {}): Promise<SentMessage> {
    const type = Resolver.detect(payload)
    
    // 1. Transformer logic (Phase 3.2+)
    let finalPayload = payload
    const transformer = this.transformers.get(type)
    if (transformer) {
      finalPayload = await transformer(payload)
    }

    // 2. Middleware logic (Phase 3.4)
    await this.runMiddleware(finalPayload)

    // 3. Transmit via socket (Phase 6 mockup)
    console.log(`[Signal] Sending ${type} to ${jid}`)
    const result = { key: { id: 'v4-msg-' + Date.now() } }

    // 4. Return fluent abstraction
    const mockActions: any = {
      send: (p: any) => this.send(jid, p)
    }

    return new SentMessage(jid, result.key.id, mockActions)
  }

  use(mw: (payload: any, next: () => Promise<void>) => Promise<void>) {
    this.middlewarres.push(mw)
  }

  private async runMiddleware(payload: any) {
    let index = -1
    const next = async (): Promise<void> => {
      index++
      if (index < this.middlewarres.length) {
        await this.middlewarres[index](payload, next)
      }
    }
    await next()
  }

  registerTransformer(type: string, fn: any) {
    this.transformers.set(type, fn)
  }
}
