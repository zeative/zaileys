import { normalizeText } from '../../utils/text'

export async function textTransformer(payload: any) {
  const text = typeof payload === 'string' ? payload : payload.text
  if (!text) return payload

  const normalized = normalizeText(text)
  
  // Auto-mentions regex: @628xxx
  const mentions = normalized.match(/@\d+/g)?.map(m => m.slice(1) + '@s.whatsapp.net') || []

  return typeof payload === 'string' 
    ? { text: normalized, mentions }
    : { ...payload, text: normalized, mentions }
}
