import { randomBytes } from 'node:crypto'

const pending = new WeakSet<object>()

/**
 * Marks a media message to be wrapped into a group status envelope at send time.
 *
 * baileys reads `getMediaType()` from the raw message to set the stanza's `mediatype` attribute, and
 * only calls `patchMessageBeforeSending` afterwards. A media message nested inside
 * `groupStatusMessageV2` is therefore invisible to that check and the server drops it. Relaying the
 * media at the top level and wrapping it in the patch hook gets both the attribute and the envelope.
 */
export const markAsGroupStatus = (message: object): void => {
  pending.add(message)
}

/** Wraps a marked message into the group status envelope; returns it untouched otherwise. */
export const applyGroupStatusWrap = <T extends object>(message: T): T => {
  if (!pending.has(message)) return message
  pending.delete(message)
  const secret = randomBytes(32)
  const inner = { ...(message as Record<string, unknown>), messageContextInfo: { messageSecret: secret } }
  return {
    messageContextInfo: { messageSecret: secret },
    groupStatusMessageV2: { message: inner },
  } as unknown as T
}
