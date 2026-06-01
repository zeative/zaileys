import { ZaileysBuilderError } from '../errors.js'

export type TextContent = { text: string }

export const buildTextContent = (text: string): TextContent => {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'text() requires a non-empty string')
  }
  return { text }
}
