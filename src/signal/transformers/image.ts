import { cleanMediaObject } from '../../utils/media'

export async function imageTransformer(payload: any) {
  const source = payload.image
  if (!source) return payload

  const image = await cleanMediaObject(source)
  
  return {
    ...payload,
    image
  }
}
