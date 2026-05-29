import { ZaileysBuilderError } from '../errors.js'

/** Plain-text content shape produced by {@link buildTextContent}; merges with `Mentionable` downstream. */
export type TextContent = { text: string }

/**
 * Build a Baileys text-message content object from a raw string.
 *
 * @param text - The message body; rejected when empty or whitespace-only.
 * @throws ZaileysBuilderError `EMPTY_CONTENT` when `text` has no visible characters.
 */
export const buildTextContent = (text: string): TextContent => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'text() requires a non-empty string')
  }
  return { text }
}
