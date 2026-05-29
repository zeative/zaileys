import type { AnyMessageContent, MiscMessageGenerationOptions, WAMessage, WAMessageKey } from 'baileys'
import type { BuilderSocketLike } from './builder.js'
import { buildImageContent } from './content/image.js'
import { buildVideoContent } from './content/video.js'
import { ZaileysBuilderError } from './errors.js'
import type { AlbumItem, BuilderContext } from './types.js'

const MIN_ITEMS = 2
const MAX_ITEMS = 30

const buildChildContent = async (item: AlbumItem): Promise<AnyMessageContent> => {
  if (item.type === 'image') {
    return buildImageContent(item.src, item.caption !== undefined ? { caption: item.caption } : undefined)
  }
  if (item.type === 'video') {
    return buildVideoContent(item.src, item.caption !== undefined ? { caption: item.caption } : undefined)
  }
  throw new ZaileysBuilderError('INVALID_OPTIONS', `album() item type must be 'image' or 'video', got ${String((item as { type: unknown }).type)}`)
}

/**
 * Orchestrate an rc11+ album send.
 *
 * Sends a parent placeholder carrying `{ album: { expectedImageCount,
 * expectedVideoCount } }` first, captures its key, then forwards that key as
 * `albumParentKey` to each child media send. Baileys translates `albumParentKey`
 * into `messageContextInfo.messageAssociation` on the wire. Children are sent
 * sequentially (rc13-safe ordering) so the WA UI fills the placeholder in order.
 *
 * @param socket - structural Baileys socket.
 * @param recipient - target jid.
 * @param items - 2..30 album entries.
 * @param context - resolved quote/mention context applied to the parent send.
 * @returns the PARENT {@link WAMessageKey}; child keys are surfaced only in debug logs.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on item count out of range,
 *   `SEND_FAILED` when the parent or any child send rejects (cause carries the
 *   parent key and the failing child index).
 */
export const sendAlbum = async (
  socket: BuilderSocketLike,
  recipient: string,
  items: AlbumItem[],
  context: BuilderContext,
): Promise<WAMessageKey> => {
  if (!Array.isArray(items) || items.length < MIN_ITEMS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `album() requires a minimum of ${MIN_ITEMS} items`)
  }
  if (items.length > MAX_ITEMS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `album() accepts a maximum of ${MAX_ITEMS} items`)
  }
  let expectedImageCount = 0
  let expectedVideoCount = 0
  for (const item of items) {
    if (item.type === 'image') expectedImageCount += 1
    else if (item.type === 'video') expectedVideoCount += 1
    else {
      throw new ZaileysBuilderError('INVALID_OPTIONS', `album() item type must be 'image' or 'video', got ${String((item as { type: unknown }).type)}`)
    }
  }

  const parentContent = { album: { expectedImageCount, expectedVideoCount } } as unknown as AnyMessageContent & {
    mentions?: string[]
    mentionAll?: boolean
  }
  if (context.mentions && context.mentions.length > 0) parentContent.mentions = context.mentions
  if (context.mentionAll) parentContent.mentionAll = true

  const parentOptions: MiscMessageGenerationOptions = {}
  if (context.quoted) parentOptions.quoted = context.quoted as WAMessage
  if (context.disappearingSeconds !== undefined) parentOptions.ephemeralExpiration = context.disappearingSeconds

  let parent: WAMessage | undefined
  try {
    parent = await socket.sendMessage(recipient, parentContent, parentOptions)
  } catch (err) {
    throw new ZaileysBuilderError('SEND_FAILED', 'album parent send rejected', { cause: err })
  }
  const parentKey = parent?.key
  if (!parentKey) {
    throw new ZaileysBuilderError('SEND_FAILED', 'album parent returned no message key')
  }

  let index = 0
  for (const item of items) {
    const child = (await buildChildContent(item)) as AnyMessageContent & { albumParentKey?: WAMessageKey }
    child.albumParentKey = parentKey
    try {
      await socket.sendMessage(recipient, child)
    } catch (err) {
      throw new ZaileysBuilderError('SEND_FAILED', 'album child send rejected', {
        cause: { parentKey, index, error: err },
      })
    }
    index += 1
  }

  return parentKey
}
