import type { MessageContext } from '../types/context'
import { MessageContextBuilder } from './builder'
import { ns } from '../store/unified-store'

const messageStore = ns('messages')

export async function buildReplyChain(raw: any, socket: any, depth: number = 0, maxDepth: number = 5): Promise<MessageContext | undefined> {
  if (depth >= maxDepth) return undefined

  const contextInfo = raw.message?.extendedTextMessage?.contextInfo ||
                      raw.message?.imageMessage?.contextInfo ||
                      raw.message?.videoMessage?.contextInfo ||
                      raw.message?.stickerMessage?.contextInfo
  
  if (!contextInfo?.stanzaId || !contextInfo?.quotedMessage) return undefined

  // 1. Check store for full quoted message
  const cached = messageStore.get(contextInfo.stanzaId)
  if (cached) {
    return MessageContextBuilder.build(cached, socket)
  }

  // 2. Fallback: Build minimal context from available info
  const minimalRaw = {
    key: {
      remoteJid: raw.key.remoteJid,
      fromMe: false, // Quoted usually not from me unless specified
      id: contextInfo.stanzaId,
      participant: contextInfo.participant
    },
    message: contextInfo.quotedMessage
  }

  return MessageContextBuilder.build(minimalRaw, socket)
}
