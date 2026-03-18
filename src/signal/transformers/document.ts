import { cleanMediaObject } from '../../utils/media'

export async function documentTransformer(payload: any) {
  const source = payload.document
  if (!source) return payload

  const document = await cleanMediaObject(source)
  
  return {
    ...payload,
    document,
    mimetype: payload.mimetype || 'application/octet-stream',
    fileName: payload.fileName || 'file'
  }
}
