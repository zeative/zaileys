import { proto, type AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ListOptions } from '../types.js'
import { RELAY_CONTENT_KEY, type RelayContent } from './buttons.js'

const MAX_ROWS = 10

export type ListContentRow = { header: string; title: string; description: string; id: string }

export type ListContentSection = { title: string; highlight_label: string; rows: ListContentRow[] }

export const buildListContent = (opts: ListOptions): AnyMessageContent => {
  if (typeof opts?.buttonText !== 'string' || opts.buttonText.trim().length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'list() requires a non-empty buttonText')
  }
  if (!Array.isArray(opts.sections) || opts.sections.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'list() requires at least one section')
  }

  let rowCount = 0
  const seen = new Set<string>()
  const sections = opts.sections.map((section): ListContentSection => {
    if (!Array.isArray(section.rows) || section.rows.length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'each list section requires at least one row')
    }
    const rows = section.rows.map((row): ListContentRow => {
      if (typeof row.id !== 'string' || row.id.length === 0) {
        throw new ZaileysBuilderError('INVALID_OPTIONS', 'list row id must be a non-empty string')
      }
      if (typeof row.title !== 'string' || row.title.trim().length === 0) {
        throw new ZaileysBuilderError('INVALID_OPTIONS', 'list row title must be a non-empty string')
      }
      if (seen.has(row.id)) {
        throw new ZaileysBuilderError('INVALID_OPTIONS', `duplicate list row id: ${row.id}`)
      }
      seen.add(row.id)
      rowCount += 1
      return { header: '', title: row.title, description: row.description ?? '', id: row.id }
    })
    return { title: section.title, highlight_label: '', rows }
  })

  if (rowCount > MAX_ROWS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `list() accepts at most ${MAX_ROWS} rows total`)
  }

  const selectButton = {
    name: 'single_select',
    buttonParamsJson: JSON.stringify({ title: opts.buttonText, sections }),
  }
  const interactiveMessage: proto.Message.IInteractiveMessage = {
    body: { text: opts.description && opts.description.length > 0 ? opts.description : ' ' },
    nativeFlowMessage: { buttons: [selectButton], messageParamsJson: '' },
  }
  if (opts.footerText && opts.footerText.length > 0) {
    interactiveMessage.footer = { text: opts.footerText }
  }
  if (opts.title && opts.title.length > 0) {
    interactiveMessage.header = { title: opts.title, subtitle: '', hasMediaAttachment: false }
  }

  const relay: RelayContent = { [RELAY_CONTENT_KEY]: { interactiveMessage } }
  return relay as unknown as AnyMessageContent
}
