import { cleanMediaObject } from '../../utils/media'

export async function audioTransformer(payload: any) {
  const source = payload.audio
  if (!source) return payload

  const audio = await cleanMediaObject(source)
  
  return {
    ...payload,
    audio,
    mimetype: payload.mimetype || 'audio/mp4',
    ptt: payload.ptt || false
  }
}
