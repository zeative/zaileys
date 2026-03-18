import type { MessageFlags } from '../types/context'

export function computeFlags(raw: any): MessageFlags {
  const msg = raw.message || {}
  const jid = raw.key.remoteJid || ''
  
  return {
    isGroup: jid.endsWith('@g.us'),
    isFromMe: raw.key.fromMe || false,
    isBot: !!raw.participant || false, // Simple bot detection (needs socket for thorough)
    isEphemeral: !!msg.ephemeralMessage,
    isViewOnce: !!(msg.viewOnceMessage || msg.viewOnceMessageV2),
    isForwarded: !!(msg.extendedTextMessage?.contextInfo?.isForwarded || 
                   msg.imageMessage?.contextInfo?.isForwarded || 
                   msg.videoMessage?.contextInfo?.isForwarded),
    isLid: jid.endsWith('@lid'),
    isNewsletter: jid.endsWith('@newsletter')
  }
}
