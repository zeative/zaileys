import { jidDecode } from 'baileys'

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

/**
 * Same principal, same namespace. baileys' `areJidsSameUser` compares only the local part, so
 * `12345@lid` and `12345@s.whatsapp.net` collide there — two different address spaces that both
 * hold digits. Device suffixes (`:12`) are ignored, as they should be.
 */
export const sameUser = (a: string, b: string): boolean => {
  const left = jidDecode(a)
  const right = jidDecode(b)
  if (left === undefined || right === undefined) return false
  if (!left.user || !right.user) return false
  return left.user === right.user && left.server === right.server
}

/**
 * Allow/deny list matching. A domainless entry (`628111`) is taken as a phone number, which is
 * unambiguous and can never satisfy a LID sender. Anything with a domain must match namespace too.
 */
export const matchesUser = (entry: string, jid: string): boolean => {
  if (entry === jid) return true
  const normalized = entry.includes('@') ? entry : phoneToJid(entry)
  return sameUser(normalized, jid)
}

/** Digits-only phone number from a JID (e.g. `628xx@s.whatsapp.net` → `628xx`). Empty for groups/lids. */
export const jidToPhone = (jid: string): string => {
  const user = jid.split('@')[0] ?? ''
  const digits = user.split(':')[0]?.replace(/\D/g, '') ?? ''
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us') ? digits : ''
}

/** Build a user JID from a phone number or digits (e.g. `+62 812` → `62812@s.whatsapp.net`). */
export const phoneToJid = (phone: string): string => `${phone.replace(/\D/g, '')}@s.whatsapp.net`
