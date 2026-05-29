import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { ListOptions } from '../types.js'

const MAX_ROWS = 10

/** A single list row in the emitted content; `rowId` is the round-trip field. */
export type ListContentRow = { rowId: string; title: string; description?: string }

/** A list section in the emitted content. */
export type ListContentSection = { title: string; rows: ListContentRow[] }

/** Interactive list-message content; carried structurally past the Baileys public `AnyMessageContent` type. */
export type ListContent = {
  text: string
  footer?: string
  title?: string
  buttonText: string
  sections: ListContentSection[]
}

/**
 * Build list-message content from declarative {@link ListOptions}.
 *
 * rc13 decision: as with buttons, the public `AnyMessageContent` union no longer
 * exposes a `listMessage` branch. The legacy list shape is still accepted by the
 * relay layer and is what `decodeListSelect` round-trips against, so it is emitted
 * here and cast at the builder boundary.
 *
 * Each `ListSection.rows[].id` is mapped to `rowId` and returns unchanged as
 * `ListSelectPayload.rowId` when a user picks a row (Phase 4 EVT-12).
 *
 * @param opts - sections (≥1, ≤10 total rows) plus `buttonText` and optional decoration.
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on blank button text, no sections,
 *   empty/over-limit rows, or blank row id/title.
 */
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
      const built: ListContentRow = { rowId: row.id, title: row.title }
      if (row.description !== undefined) built.description = row.description
      return built
    })
    return { title: section.title, rows }
  })

  if (rowCount > MAX_ROWS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `list() accepts at most ${MAX_ROWS} rows total`)
  }

  const content: ListContent = {
    text: opts.description && opts.description.length > 0 ? opts.description : ' ',
    buttonText: opts.buttonText,
    sections,
  }
  if (opts.title && opts.title.length > 0) content.title = opts.title
  if (opts.footerText && opts.footerText.length > 0) content.footer = opts.footerText
  return content as unknown as AnyMessageContent
}
