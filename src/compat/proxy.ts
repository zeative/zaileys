import { warnOnce } from './warning'
import type { MessageContext } from '../types/context'

/**
 * Wraps a MessageContext in a Proxy to support legacy V3 properties.
 */
export function createCompatContext(ctx: MessageContext): any {
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      // Legacy property mappings
      switch (prop) {
        case 'roomId':
          warnOnce('ctx.roomId', 'ctx.roomId is deprecated. Use ctx.room.id instead.')
          return target.room.id
        case 'senderId':
          warnOnce('ctx.senderId', 'ctx.senderId is deprecated. Use ctx.sender.id instead.')
          return target.sender.id
        case 'isGroup':
          warnOnce('ctx.isGroup', 'ctx.isGroup is deprecated. Use ctx.room.type === "group" instead.')
          return target.room.type === 'group'
        case 'isNewsletter':
          warnOnce('ctx.isNewsletter', 'ctx.isNewsletter is deprecated. Use ctx.room.type === "newsletter" instead.')
          return target.room.type === 'newsletter'
        case 'message':
          warnOnce('ctx.message', 'ctx.message is deprecated. Use ctx.content instead.')
          return target.content
      }

      return Reflect.get(target, prop, receiver)
    }
  })
}
