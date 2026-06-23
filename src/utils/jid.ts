export { extractJid as normalizeJid, isLidJid, isPnJid } from '../events/decoders/_shared.js'
export {
  jidDecode,
  jidEncode,
  jidNormalizedUser,
  areJidsSameUser,
  isJidGroup,
  isJidBroadcast,
  isJidNewsletter,
  isLidUser,
  isPnUser,
  getDevice,
} from 'baileys'

/** Digits-only phone number from a JID (e.g. `628xx@s.whatsapp.net` → `628xx`). Empty for groups/lids. */
export const jidToPhone = (jid: string): string => {
  const user = jid.split('@')[0] ?? ''
  const digits = user.split(':')[0]?.replace(/\D/g, '') ?? ''
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us') ? digits : ''
}

/** Build a user JID from a phone number or digits (e.g. `+62 812` → `62812@s.whatsapp.net`). */
export const phoneToJid = (phone: string): string => `${phone.replace(/\D/g, '')}@s.whatsapp.net`
