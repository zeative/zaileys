/**
 * JID utilities for Zaileys V4.
 * Handles conversion and validation of WhatsApp JIDs (User, Group, Newsletter, etc.).
 */

/**
 * Normalizes a JID by ensuring it has the correct suffix or removing it.
 * @param jid The JID to clean.
 * @returns The cleaned JID string.
 */
export function cleanJid(jid: string): string {
  if (!jid) return ''
  if (jid.includes('@')) {
    return jid.trim().toLowerCase()
  }
  // Default to user JID if no suffix provided
  return `${jid.trim()}@s.whatsapp.net`
}

/**
 * Resolves one or more JIDs into a standard format.
 * @param input A single JID or an array of JIDs.
 * @returns An array of normalized JID strings.
 */
export function resolveJids(input: string | string[]): string[] {
  if (!input) return []
  const jids = Array.isArray(input) ? input : [input]
  return jids
    .map(j => cleanJid(j))
    .filter(j => j.length > 0)
}

/**
 * Extracts the numerical ID from a JID.
 * @param jid The JID (e.g., '62812345678@s.whatsapp.net').
 * @returns The numerical ID string (e.g., '62812345678').
 */
export function getJidId(jid: string): string {
  return jid.split('@')[0] || jid
}

/**
 * Checks if a JID is a group JID.
 */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us')
}

/**
 * Checks if a JID is a private chat JID.
 */
export function isUserJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net')
}

/**
 * Checks if a JID is a newsletter JID.
 */
export function isNewsletterJid(jid: string): boolean {
  return jid.endsWith('@newsletter')
}
