import type { MessageActions } from '../types/context'

export class ContextActionsImpl implements MessageActions {
  constructor(
    private raw: any,
    private socket: any // Will be specialized in Phase 6
  ) {}

  async send(payload: any): Promise<any> {
    // Transformer pipeline integration will happen in Phase 3
    console.log('Sending message:', payload)
    return { id: 'mock-id' }
  }

  async reply(payload: any): Promise<any> {
    const quoted = {
      key: this.raw.key,
      message: this.raw.message
    }
    
    const finalPayload = typeof payload === 'string' 
      ? { text: payload, quoted } 
      : { ...payload, quoted }

    return this.send(finalPayload)
  }

  async react(emoji: string): Promise<any> {
    return this.send({
      react: {
        text: emoji,
        key: this.raw.key
      }
    })
  }

  async delete(): Promise<any> {
    return this.send({
      delete: this.raw.key
    })
  }
}
