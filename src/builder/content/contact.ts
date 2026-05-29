import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'

/** Optional decoration for {@link buildContactContent}. */
export type ContactContentOptions = {
  displayName?: string
}

/** Contact content shape passed to `sendMessage`; wraps a single vcard. */
export type ContactContent = {
  contacts: {
    displayName?: string
    contacts: Array<{ vcard: string }>
  }
}

/**
 * Build Baileys contact content from a raw vcard string.
 *
 * @param vcard - a vcard payload; must begin with `BEGIN:VCARD`.
 * @param opts - optional `displayName` shown for the contact card.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` when the vcard is malformed.
 */
export const buildContactContent = (vcard: string, opts?: ContactContentOptions): AnyMessageContent => {
  if (typeof vcard !== 'string' || !vcard.trimStart().startsWith('BEGIN:VCARD')) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'contact() requires a vcard string starting with BEGIN:VCARD')
  }
  const contacts: ContactContent['contacts'] = { contacts: [{ vcard }] }
  if (opts?.displayName !== undefined) contacts.displayName = opts.displayName
  return { contacts } as unknown as AnyMessageContent
}
