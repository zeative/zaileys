import type { AnyMessageContent } from 'baileys'
import { detectMimeFromBuffer } from '../builder/media-loader.js'
import { ZaileysCloudError } from './errors.js'
import type { GraphClient } from './graph-client.js'

export type CloudMediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export interface OutboundMedia {
  kind: CloudMediaKind
  buffer: Buffer
  caption?: string
  fileName?: string
  mimetype?: string
}

const KINDS: CloudMediaKind[] = ['image', 'video', 'audio', 'document', 'sticker']

/** Detect a builder media content (`{ image: Buffer, caption? }` etc.); null when not media. */
export function outboundMediaOf(content: AnyMessageContent): OutboundMedia | null {
  const c = content as Record<string, unknown>
  for (const kind of KINDS) {
    const value = c[kind]
    if (Buffer.isBuffer(value)) {
      return {
        kind,
        buffer: value,
        ...(typeof c['caption'] === 'string' ? { caption: c['caption'] } : {}),
        ...(typeof c['fileName'] === 'string' ? { fileName: c['fileName'] } : {}),
        ...(typeof c['mimetype'] === 'string' ? { mimetype: c['mimetype'] } : {}),
      }
    }
  }
  return null
}

/** Upload bytes to the Cloud media endpoint; returns the media id to reference in sends. */
export async function uploadMedia(
  graph: GraphClient,
  phoneNumberId: string,
  media: OutboundMedia,
): Promise<string> {
  const mime = media.mimetype ?? (await detectMimeFromBuffer(media.buffer))
  const form = new FormData()
  form.set('messaging_product', 'whatsapp')
  form.set('type', mime)
  form.set('file', new Blob([new Uint8Array(media.buffer)], { type: mime }), media.fileName ?? 'file')
  const res = await graph.postForm<{ id?: string }>(`${phoneNumberId}/media`, form)
  if (!res.id) throw new ZaileysCloudError('REQUEST_FAILED', 'media upload returned no id')
  return res.id
}

export function mediaMessageBody(media: OutboundMedia, mediaId: string): Record<string, unknown> {
  return {
    id: mediaId,
    ...(media.caption !== undefined && media.kind !== 'audio' && media.kind !== 'sticker'
      ? { caption: media.caption }
      : {}),
    ...(media.kind === 'document' && media.fileName !== undefined ? { filename: media.fileName } : {}),
  }
}
