import { cleanMediaObject } from '../../utils/media'

export async function stickerTransformer(payload: any) {
  const source = payload.sticker
  if (!source) return payload

  const sticker = await cleanMediaObject(source)
  
  return {
    ...payload,
    sticker
  }
}
