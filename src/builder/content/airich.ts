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
 *
 * Format reference (credit): https://gist.github.com/ValdazGT/3a1a10bb7017209ba6fa35d42d4d559d
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
        key = `zaileys_HYPERLINK_${hyperlinkIndex++}`
        tag = `{{${key}}}${url}{{/${key}}}`
        ie.push({ type: 'hyperlink', ie: { key, text: raw, url } })
      } else {
        key = `zaileys_CITATION_${citationIndex - 1}`
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

const TYPE_MAP: Record<number, string> = { 0: 'DEFAULT', 1: 'KEYWORD', 2: 'METHOD', 3: 'STR', 4: 'NUMBER', 5: 'COMMENT' }

const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'delete', 'do', 'else', 'finally', 'for', 'function',
  'if', 'in', 'instanceof', 'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'true', 'false', 'null', 'undefined', 'class', 'const', 'let', 'super', 'extends',
  'export', 'import', 'from', 'as', 'default', 'yield', 'static', 'constructor', 'async', 'await', 'get', 'set',
])

const KEYWORDS_BY_LANG: Record<string, Set<string>> = {
  javascript: JS_KEYWORDS, js: JS_KEYWORDS, typescript: JS_KEYWORDS, ts: JS_KEYWORDS,
}

type CodeToken = { codeContent: string; highlightType: number }

/** Tokenize source into highlight spans (keyword/method/string/number/comment/default). */
const tokenizeCode = (code: string, lang: string): CodeToken[] => {
  const keywords = KEYWORDS_BY_LANG[lang.toLowerCase()] ?? new Set<string>()
  const tokens: CodeToken[] = []
  const push = (content: string, type: number): void => {
    if (!content) return
    const last = tokens[tokens.length - 1]
    if (last && last.highlightType === type) last.codeContent += content
    else tokens.push({ codeContent: content, highlightType: type })
  }
  let i = 0
  while (i < code.length) {
    const c = code[i]!
    if (/\s/.test(c)) {
      const s = i
      while (i < code.length && /\s/.test(code[i]!)) i++
      push(code.slice(s, i), 0)
      continue
    }
    if (c === '/' && code[i + 1] === '/') {
      const s = i
      i += 2
      while (i < code.length && code[i] !== '\n') i++
      push(code.slice(s, i), 5)
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const s = i
      const q = c
      i++
      while (i < code.length) {
        if (code[i] === '\\' && i + 1 < code.length) i += 2
        else if (code[i] === q) { i++; break }
        else i++
      }
      push(code.slice(s, i), 3)
      continue
    }
    if (/[0-9]/.test(c)) {
      const s = i
      while (i < code.length && /[0-9.]/.test(code[i]!)) i++
      push(code.slice(s, i), 4)
      continue
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const s = i
      while (i < code.length && /[a-zA-Z0-9_$]/.test(code[i]!)) i++
      const word = code.slice(s, i)
      let type = 0
      if (keywords.has(word)) {
        type = 1
      } else {
        let j = i
        while (j < code.length && /\s/.test(code[j]!)) j++
        if (code[j] === '(') type = 2
      }
      push(word, type)
      continue
    }
    push(c, 0)
    i++
  }
  return tokens
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
      const codeTokens = tokenizeCode(part.content, language)
      submessages.push({
        messageType: 5,
        codeMetadata: { codeLanguage: language, codeBlocks: codeTokens },
      })
      sections.push(
        newLayout({
          language,
          code_blocks: codeTokens.map((t) => ({ content: t.codeContent, type: TYPE_MAP[t.highlightType] })),
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
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '0@bot' },
            forwardOrigin: 4,
          },
        },
      },
    },
  }

  return { [RELAY_CONTENT_KEY]: inner } as unknown as AnyMessageContent
}
