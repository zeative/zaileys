import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'

export type ContactContentOptions = {
  displayName?: string
}

export type ContactContent = {
  contacts: {
    displayName?: string
    contacts: Array<{ vcard: string }>
  }
}

export const buildContactContent = (vcard: string, opts?: ContactContentOptions): AnyMessageContent => {
  if (typeof vcard !== 'string' || !vcard.trimStart().startsWith('BEGIN:VCARD')) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'contact() requires a vcard string starting with BEGIN:VCARD')
  }
  const contacts: ContactContent['contacts'] = { contacts: [{ vcard }] }
  if (opts?.displayName !== undefined) contacts.displayName = opts.displayName
  return { contacts } as unknown as AnyMessageContent
}
