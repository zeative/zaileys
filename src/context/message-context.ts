import type { MessageContext, MessageType } from '../types/context'

export class MessageContextImpl implements MessageContext {
  constructor(
    public raw: any,
    public content: any,
    public room: any,
    public sender: any,
    public flags: any,
    public actions: any,
    public replied?: MessageContext
  ) {}

  get text(): string | undefined {
    return this.content.text || this.content.caption || undefined
  }

  get type(): MessageType {
    return this.content.type
  }

  get jid(): string {
    return this.room.id
  }
}
