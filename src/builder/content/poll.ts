import type { AnyMessageContent } from 'baileys'
import { ZaileysBuilderError } from '../errors.js'
import type { PollOptions } from '../types.js'

const MIN_OPTIONS = 2
const MAX_OPTIONS = 12

export type PollContent = {
  poll: { name: string; values: string[]; selectableCount: number }
}

export const buildPollContent = (
  question: string,
  options: string[],
  opts?: PollOptions,
): AnyMessageContent => {
  if (typeof question !== 'string' || question.trim().length === 0) {
    throw new ZaileysBuilderError('EMPTY_CONTENT', 'poll() requires a non-empty question')
  }
  if (!Array.isArray(options) || options.length < MIN_OPTIONS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `poll() requires a minimum of ${MIN_OPTIONS} options`)
  }
  if (options.length > MAX_OPTIONS) {
    throw new ZaileysBuilderError('INVALID_OPTIONS', `poll() accepts a maximum of ${MAX_OPTIONS} options`)
  }
  const seen = new Set<string>()
  for (const option of options) {
    if (typeof option !== 'string' || option.trim().length === 0) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', 'poll options must be non-empty strings')
    }
    if (seen.has(option)) {
      throw new ZaileysBuilderError('INVALID_OPTIONS', `duplicate poll options: ${option}`)
    }
    seen.add(option)
  }

  const content: PollContent = {
    poll: {
      name: question,
      values: options,
      selectableCount: opts?.multipleChoice ? options.length : 1,
    },
  }
  return content as unknown as AnyMessageContent
}
