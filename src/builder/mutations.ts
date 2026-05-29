import type { WAMessage, WAMessageKey } from 'baileys'
import type { MessageStore } from '../store/types.js'
import type { BuilderSocketLike } from './builder.js'
import { ZaileysBuilderError } from './errors.js'

/** Options for {@link deleteMessage}. */
export type DeleteOptions = {
  /** Delete for all chat members (default) vs. delete only the local copy. */
  forEveryone?: boolean
}

const requireRemoteJid = (key: WAMessageKey): string => {
  const jid = key.remoteJid
  if (typeof jid !== 'string' || jid.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'message key is missing remoteJid')
  }
  return jid
}

const requireKey = (result: WAMessage | undefined): WAMessageKey => {
  if (!result?.key) {
    throw new ZaileysBuilderError('SEND_FAILED', 'socket returned no message key')
  }
  return result.key
}

/**
 * Revoke a message via Baileys' `{ delete }` content. `forEveryone: false`
 * targets only the sender's own copy via the `me` revoke variant.
 */
export const deleteMessage = async (
  socket: BuilderSocketLike,
  key: WAMessageKey,
  opts: DeleteOptions = {},
): Promise<void> => {
  const remoteJid = requireRemoteJid(key)
  const forEveryone = opts.forEveryone ?? true
  const target: WAMessageKey = forEveryone ? key : { ...key, fromMe: true }
  await socket.sendMessage(remoteJid, { delete: target })
}

/**
 * React to a message with `emoji`; an empty string removes the reaction.
 * Resolves with the reaction message's {@link WAMessageKey}.
 */
export const reactToMessage = async (
  socket: BuilderSocketLike,
  key: WAMessageKey,
  emoji: string,
): Promise<WAMessageKey> => {
  const remoteJid = requireRemoteJid(key)
  const result = await socket.sendMessage(remoteJid, { react: { text: emoji, key } })
  return requireKey(result)
}

/**
 * Forward a stored message to `to`. The source is looked up via
 * `store.getMessage` (no network re-fetch); a missing source throws
 * `MESSAGE_NOT_FOUND`.
 */
export const forwardMessage = async (
  socket: BuilderSocketLike,
  store: Pick<MessageStore, 'getMessage'>,
  key: WAMessageKey,
  to: string,
): Promise<WAMessageKey> => {
  const message = await store.getMessage(key)
  if (!message) {
    throw new ZaileysBuilderError('MESSAGE_NOT_FOUND', 'message not found in store for forward')
  }
  const result = await socket.sendMessage(to, { forward: message })
  return requireKey(result)
}
