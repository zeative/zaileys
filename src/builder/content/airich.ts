import { randomUUID } from 'node:crypto'
import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import { RELAY_CONTENT_KEY } from './buttons.js'

/**
 * A single rich-response section.
 *
 * EXPERIMENTAL: AIRich uses WhatsApp's reverse-engineered Meta AI rich-response
 * format (`botForwardedMessage` -> `richResponseMessage` with a base64 unified
 * response). It is NOT a documented WhatsApp protocol and may break with any
 * WhatsApp update. Renders as an AI-bot response on supporting clients.
 */
export type AIRichPart =
  | { type: 'text'; text: string }
  | { type: 'code'; language?: string; content: string }
  | { type: 'table'; rows: string[][] }

/** Decoration for an AIRich message: header disclaimer, footer note, and citation sources. */
export type AIRichOptions = {
  title?: string
  footer?: string
  sources?: Array<[profileUrl: string, url: string, text: string]>
}

type InlineEntity = { key: string; metadata: Record<string, unknown> }
type ExtractedIE = { text: string; ie: Array<{ type: string; ie: Record<string, string> }> }

const extractIE = (input: string): ExtractedIE => {
  const ie: ExtractedIE['ie'] = []
  let result = ''
  let last = 0
  let citationIndex = 1
  let hyperlinkIndex = 0
  const stack: number[] = []
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '[' && input[i - 1] !== '\\') {
      stack.push(i)
    } else if (input[i] === ']' && input[i + 1] === '(') {
      const start = stack.pop()
      if (start == null) continue
      let end = i + 2
      let depth = 1
      while (end < input.length && depth > 0) {
        if (input[end] === '(' && input[end - 1] !== '\\') depth++
        else if (input[end] === ')' && input[end - 1] !== '\\') depth--
        end++
      }
      if (depth > 0) continue
      const raw = input.slice(start + 1, i).trim()
      const url = input.slice(i + 2, end - 1).trim()
      let key: string
      let tag: string
      if (raw) {
        key = `NIXEL_HYPERLINK_${hyperlinkIndex++}`
        tag = `{{${key}}}${url}{{/${key}}}`
        ie.push({ type: 'hyperlink', ie: { key, text: raw, url } })
      } else {
        key = `NIXEL_CITATION_${citationIndex - 1}`
        tag = `{{${key}}}${url}{{/${key}}}`
        ie.push({ type: 'citation', ie: { key, reference_id: String(citationIndex++), url } })
      }
      result += input.slice(last, start) + tag
      last = end
      i = end - 1
    }
  }
  result += input.slice(last)
  return { text: result, ie }
}

const toInlineEntities = (extracted: ExtractedIE): InlineEntity[] =>
  extracted.ie.map(({ type, ie }) => {
    if (type === 'hyperlink') {
      return {
        key: ie['key']!,
        metadata: { display_name: ie['text'], is_trusted: true, url: ie['url'], __typename: 'GenAIInlineLinkItem' },
      }
    }
    return {
      key: ie['key']!,
      metadata: {
        reference_id: Number(ie['reference_id']),
        reference_url: ie['url'],
        reference_title: ie['url'],
        reference_display_name: ie['url'],
        sources: [],
        __typename: 'GenAISearchCitationItem',
      },
    }
  })

const toTableRows = (table: string[][]): Array<{ is_header: boolean; cells: string[] }> => {
  if (!Array.isArray(table) || table.length === 0 || !table.every((r) => Array.isArray(r))) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'table must be a non-empty array of string rows')
  }
  const [header, ...rows] = table as [string[], ...string[][]]
  const maxLen = Math.max(header.length, ...rows.map((r) => r.length))
  const normalize = (r: string[]): string[] => [...r, ...Array(maxLen - r.length).fill('')]
  return [
    { is_header: true, cells: normalize(header) },
    ...rows.map((r) => ({ is_header: false, cells: normalize(r) })),
  ]
}

const newLayout = (data: Record<string, unknown>): Record<string, unknown> => ({
  view_model: { primitive: data, __typename: 'GenAISingleLayoutViewModel' },
})

/**
 * Build an EXPERIMENTAL AIRich message (Meta AI rich-response format). Composes
 * text (with `[label](url)` hyperlinks and `[](url)` citations), code blocks, and
 * tables into a `botForwardedMessage` relayed as an AI response.
 *
 * @throws ZaileysBuilderError `INVALID_OPTIONS` on empty parts or malformed table.
 */
export const buildAIRichContent = (parts: AIRichPart[], opts?: AIRichOptions): AnyMessageContent => {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', 'aiRich() requires at least one part')
  }
  const sections: Array<Record<string, unknown>> = []
  const submessages: Array<Record<string, unknown>> = []

  for (const part of parts) {
    if (part.type === 'text') {
      const extracted = extractIE(part.text)
      const entities = toInlineEntities(extracted)
      submessages.push({ messageType: 2, messageText: extracted.text })
      sections.push(
        newLayout({
          text: extracted.text,
          ...(entities.length > 0 ? { inline_entities: entities } : {}),
          __typename: 'GenAIMarkdownTextUXPrimitive',
        }),
      )
    } else if (part.type === 'code') {
      const language = part.language ?? 'plaintext'
      submessages.push({
        messageType: 5,
        codeMetadata: { codeLanguage: language, codeBlocks: [{ codeContent: part.content, highlightType: 0 }] },
      })
      sections.push(
        newLayout({
          language,
          code_blocks: [{ content: part.content, type: 'DEFAULT' }],
          __typename: 'GenAICodeUXPrimitive',
        }),
      )
    } else {
      const rows = toTableRows(part.rows)
      submessages.push({
        messageType: 4,
        tableMetadata: { title: '', rows: rows.map((r) => ({ items: r.cells, ...(r.is_header ? { isHeading: true } : {}) })) },
      })
      sections.push(newLayout({ rows, __typename: 'GenATableUXPrimitive' }))
    }
  }

  if (opts?.footer && opts.footer.length > 0) {
    sections.push(newLayout({ text: opts.footer, __typename: 'GenAIMetadataTextPrimitive' }))
  }

  const richResponseSources = (opts?.sources ?? []).map(([profileUrl, url, text]) => ({
    source_type: 'THIRD_PARTY',
    source_display_name: text ?? '',
    source_subtitle: 'AI',
    source_url: url ?? '',
    favicon: { url: profileUrl ?? '', mime_type: 'image/jpeg', width: 16, height: 16 },
  }))

  const inner = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: opts?.title ?? '',
        richResponseSourcesMetadata: { sources: richResponseSources },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages,
          unifiedResponse: {
            data: Buffer.from(JSON.stringify({ response_id: randomUUID(), sections })).toString('base64'),
          },
          contextInfo: {},
        },
      },
    },
  }

  return { [RELAY_CONTENT_KEY]: inner } as unknown as AnyMessageContent
}
