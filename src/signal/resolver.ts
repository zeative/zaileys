import type { MessageType } from '../types/context'

/**
 * Intelligent payload type detector.
 * Priority-based logic to determine the primary intent of a send payload.
 */
export class Resolver {
  static detect(payload: any): MessageType {
    if (typeof payload === 'string') return 'text'
    if (!payload || typeof payload !== 'object') return 'unknown'

    // Priority 1: Direct type indicators
    if (payload.text) return 'text'
    if (payload.image) return 'image'
    if (payload.video) return 'video'
    if (payload.audio) return 'audio'
    if (payload.sticker) return 'sticker'
    if (payload.document) return 'document'
    if (payload.location) return 'location'
    if (payload.contact || payload.contacts) return 'contact'
    if (payload.poll) return 'poll'
    if (payload.react) return 'reaction'
    if (payload.delete) return 'deleted'
    if (payload.edit) return 'edited'

    // Priority 2: Buttons & Lists (Advanced)
    if (payload.buttons || payload.templateButtons || payload.sections) return 'interactive'

    return 'unknown'
  }
}
