import type { WAMessage } from 'baileys'
import type { Logger } from '../../client/types.js'
import type { ButtonClickPayload, ListSelectPayload, SenderInfo } from '../types.js'
import { extractSender, safeNumber } from './_shared.js'

export interface InteractiveContext {
  selfJid: string
  logger?: Logger
}

const BUTTON_FLOW_NAMES = ['quick_reply', 'cta_url', 'cta_call', 'button_click'] as const
const LIST_FLOW_NAMES = ['list_select', 'single_select'] as const

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const resolveSender = (msg: WAMessage): SenderInfo | null => {
  const pushName = typeof msg.pushName === 'string' ? msg.pushName : undefined
  return extractSender(msg.key, pushName)
}

const resolveTimestamp = (msg: WAMessage): number => {
  const ts = safeNumber(msg.messageTimestamp)
  return ts ?? 0
}

const parseParams = (
  paramsJson: string | null | undefined,
  logger: Logger | undefined,
): Record<string, unknown> | null => {
  if (!nonEmpty(paramsJson)) return null
  try {
    const parsed: unknown = JSON.parse(paramsJson)
    if (parsed !== null && typeof parsed === 'object') return parsed as Record<string, unknown>
    return null
  } catch {
    logger?.debug({ paramsJson }, 'interactive: failed to parse nativeFlow paramsJson')
    return null
  }
}

const pickString = (source: Record<string, unknown>, keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = source[key]
    if (nonEmpty(value)) return value
  }
  return undefined
}

export const decodeButtonClick = (
  msg: WAMessage,
  ctx: InteractiveContext,
): ButtonClickPayload | null => {
  const message = msg.message
  if (!message) return null

  const buttons = message.buttonsResponseMessage
  if (buttons && nonEmpty(buttons.selectedButtonId)) {
    return build(msg, buttons.selectedButtonId, buttons.selectedDisplayText)
  }

  const template = message.templateButtonReplyMessage
  if (template && nonEmpty(template.selectedId)) {
    return build(msg, template.selectedId, template.selectedDisplayText)
  }

  const flow = message.interactiveResponseMessage?.nativeFlowResponseMessage
  if (flow && nonEmpty(flow.name) && (BUTTON_FLOW_NAMES as readonly string[]).includes(flow.name)) {
    const params = parseParams(flow.paramsJson, ctx.logger)
    if (!params) return null
    const buttonId = pickString(params, ['id', 'button_id'])
    if (buttonId === undefined) return null
    return build(msg, buttonId, pickString(params, ['display_text']) ?? null)
  }

  return null
}

const build = (
  msg: WAMessage,
  buttonId: string,
  buttonText: string | null | undefined,
): ButtonClickPayload | null => {
  const sender = resolveSender(msg)
  if (!sender || !msg.key) return null
  const payload: ButtonClickPayload = {
    key: msg.key,
    buttonId,
    sender,
    timestamp: resolveTimestamp(msg),
  }
  if (nonEmpty(buttonText)) payload.buttonText = buttonText
  return payload
}

export const decodeListSelect = (
  msg: WAMessage,
  ctx: InteractiveContext,
): ListSelectPayload | null => {
  const message = msg.message
  if (!message) return null

  const list = message.listResponseMessage
  const rowId = list?.singleSelectReply?.selectedRowId
  if (nonEmpty(rowId)) {
    return buildList(msg, rowId, list?.title)
  }

  const flow = message.interactiveResponseMessage?.nativeFlowResponseMessage
  if (flow && nonEmpty(flow.name) && (LIST_FLOW_NAMES as readonly string[]).includes(flow.name)) {
    const params = parseParams(flow.paramsJson, ctx.logger)
    if (!params) return null
    const parsedRowId = pickString(params, ['row_id', 'id'])
    if (parsedRowId === undefined) return null
    return buildList(msg, parsedRowId, pickString(params, ['title']) ?? null)
  }

  return null
}

const buildList = (
  msg: WAMessage,
  rowId: string,
  title: string | null | undefined,
): ListSelectPayload | null => {
  const sender = resolveSender(msg)
  if (!sender || !msg.key) return null
  const payload: ListSelectPayload = {
    key: msg.key,
    rowId,
    sender,
    timestamp: resolveTimestamp(msg),
  }
  if (nonEmpty(title)) payload.title = title
  return payload
}
