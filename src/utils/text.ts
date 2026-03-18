/**
 * Optimized text normalization for Zaileys V4.
 * Compiled regex patterns are stored as constants to avoid re-compilation on every call.
 */

const COMPILED_PATTERNS = [
  // 1. RTL override characters (requires functional replacer)
  { pattern: /\u202E(.*?)(\u202C|$)/gu, replace: (_: string, c: string) => [...c].reverse().join('') },
  { pattern: /\u202D(.*?)(\u202C|$)/gu, replace: (_: string, c: string) => [...c].reverse().join('') },

  // 2. Invisible & directional marks
  { pattern: /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u200B\u200C\u200D\uFEFF]/gu, replace: '' },

  // 3. Zero-width & special chars
  { pattern: /[\u00AD\u034F\u115F\u1160\u17B4\u17B5\u180B-\u180E\u2060-\u2064\u206A-\u206F\u2800\uFFFC\uFFFD]/gu, replace: '' },

  // 4. Variation selectors
  { pattern: /[\uFE00-\uFE0F]/gu, replace: '' },

  // 5. Combining marks
  { pattern: /[\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F]/gu, replace: '' },

  // 6. Control & format categories
  { pattern: /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/gu, replace: '' },

  // 7. Non-standard whitespace -> regular space
  { pattern: /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u2028\u2029\t\r\n\f\v]/gu, replace: ' ' },

  // 8. Multiple spaces
  { pattern: /\s+/g, replace: ' ' },
] as const

/**
 * Normalizes text by removing non-printable characters, 
 * resolving directional overrides, and streamlining whitespace.
 */
export function normalizeText(text: string | null | undefined): string | null {
  if (!text?.length) return null

  let result = text

  // RTL handlers (functional replacers for index 0 and 1)
  result = result
    .replace(COMPILED_PATTERNS[0].pattern, COMPILED_PATTERNS[0].replace)
    .replace(COMPILED_PATTERNS[1].pattern, COMPILED_PATTERNS[1].replace)

  // String replacers for the rest
  for (let i = 2; i < COMPILED_PATTERNS.length; i++) {
    result = result.replace(
      COMPILED_PATTERNS[i].pattern,
      COMPILED_PATTERNS[i].replace as string
    )
  }

  // Final normalization chain
  result = result
    .normalize('NFKD')
    .normalize('NFKC')
    .normalize('NFC')
    .trim()

  return result.length ? result : null
}
