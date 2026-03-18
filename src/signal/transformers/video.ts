import { cleanMediaObject } from '../../utils/media'

export async function videoTransformer(payload: any) {
  const source = payload.video
  if (!source) return payload

  const video = await cleanMediaObject(source)
  
  // Handle PTV (Video Note) shorthand
  if (payload.ptv) {
    return {
      ...payload,
      video,
      ptv: true
    }
  }

  return {
    ...payload,
    video
  }
}
