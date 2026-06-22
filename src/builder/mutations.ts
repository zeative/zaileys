import type { WAMessage, WAMessageKey } from 'baileys'
import type { MessageStore } from '../store/types.js'
import type { BuilderSocketLike } from './builder.js'
import { ZaileysBuilderError } from './errors.js'

export type DeleteOptions = {
  forEveryone?: boolean
}

export type PinOptions = {
  /** Pin duration in seconds (WhatsApp offers 86400 / 604800 / 2592000). Defaults to 24h. */
  duration?: number
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

export const deleteMessage = async (
  socket: BuilderSocketLike,
  key: WAMessageKey,
  opts: DeleteOptions = {},
): Promise<void> => {
  const remoteJid = requireRemoteJid(key)
  const forEveryone = opts.forEveryone ?? true
  if (forEveryone) {
    await socket.sendMessage(remoteJid, { delete: key })
    return
  }
  if (typeof socket.chatModify !== 'function') {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'delete-for-me is not supported by this socket')
  }
  await socket.chatModify(
    { deleteForMe: { deleteMedia: false, key, timestamp: Date.now() } },
    remoteJid,
  )
}

export const reactToMessage = async (
  socket: BuilderSocketLike,
  key: WAMessageKey,
  emoji: string,
): Promise<WAMessageKey> => {
  const remoteJid = requireRemoteJid(key)
  const result = await socket.sendMessage(remoteJid, { react: { text: emoji, key } })
  return requireKey(result)
}

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

export const pinMessage = async (
  socket: BuilderSocketLike,
  key: WAMessageKey,
  pin: boolean,
  opts: PinOptions = {},
): Promise<WAMessageKey> => {
  const remoteJid = requireRemoteJid(key)
  const content = { pin: key, type: pin ? 1 : 2, time: opts.duration ?? 86400 }
  const result = await socket.sendMessage(remoteJid, content as never)
  return requireKey(result)
}
