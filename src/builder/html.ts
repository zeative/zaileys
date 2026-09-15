const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
}

/** Markup that `html` inserts verbatim. Build it with `html`, `rawHtml` or `htmlJson`, never from user input. */
export class SafeHtml {
  readonly value: string

  constructor(value: string) {
    this.value = value
  }

  toString(): string {
    return this.value
  }
}

/** Escapes the characters that can open a tag or close an attribute. */
export const escapeHtml = (value: string): string => value.replace(/[&<>"'`]/g, (ch) => ESCAPES[ch] ?? ch)

/** Marks trusted markup so `html` does not escape it. */
export const rawHtml = (markup: string): SafeHtml => new SafeHtml(markup)

/** Serialises a value for `<script>`, escaping the sequences that could close the tag early. */
export const htmlJson = (value: unknown): SafeHtml =>
  new SafeHtml(
    (JSON.stringify(value) ?? 'null')
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029'),
  )

const render = (value: unknown): string => {
  if (value instanceof SafeHtml) return value.value
  if (Array.isArray(value)) return value.map(render).join('')
  if (value === null || value === undefined || value === false) return ''
  return escapeHtml(String(value))
}

/** Escapes interpolated values; `SafeHtml` and arrays of it pass through, `null`/`undefined`/`false` vanish. */
export const html = (strings: TemplateStringsArray, ...values: unknown[]): SafeHtml => {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? '')
  }
  return new SafeHtml(out)
}
