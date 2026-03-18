import type { MessageContext } from '../types/context'
import { MessageContextImpl } from './message-context'
import { extractContent } from './content-resolver'
import { ContextActionsImpl } from './context-actions'

import { parseRoom, parseSender } from './metadata-parser'
import { computeFlags } from './flag-system'
import { buildReplyChain } from './reply-chain'

export class MessageContextBuilder {
  static isValidMessage(raw: any): boolean {
    if (!raw.message) return false
    
    // Ignore protocol & internal stubs
    if (raw.message.protocolMessage) return false
    if (raw.message.senderKeyDistributionMessage) return false
    
    return true
  }

  static async build(raw: any, socket: any): Promise<MessageContext> {
    const content = extractContent(raw)
    const actions = new ContextActionsImpl(raw, socket)
    
    const room = parseRoom(raw.key.remoteJid)
    const sender = parseSender(raw.key.participant || raw.key.remoteJid, raw.pushName)
    const flags = computeFlags(raw)
    const replied = await buildReplyChain(raw, socket)

    return new MessageContextImpl(
      raw,
      content,
      room,
      sender,
      flags,
      actions,
      replied
    )
  }
}
