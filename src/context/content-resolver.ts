import type { MessageContent, MessageType } from '../types/context'

/**
 * Extracts the primary content from a nested Baileys message structure.
 * Handles viewOnce, ephemeral, and multi-layered payloads.
 */
export function extractContent(raw: any): MessageContent {
  const msg = raw.message || {}
  
  // 1. Unwrap layers
  const content = msg.ephemeralMessage?.message ||
                  msg.viewOnceMessage?.message ||
                  msg.viewOnceMessageV2?.message ||
                  msg.documentWithCaptionMessage?.message ||
                  msg

  // 2. Identify type and extract payload
  const type = getMessageType(content)
  
  const result: MessageContent = {
    type,
    raw: content
  }

  // 3. Extract text
  if (type === 'text') {
    result.text = content.conversation || content.extendedTextMessage?.text
  } else {
    result.caption = content[Object.keys(content)[0]]?.caption || undefined
  }

  return result
}

function getMessageType(content: any): MessageType {
  if (content.conversation || content.extendedTextMessage) return 'text'
  if (content.imageMessage) return 'image'
  if (content.videoMessage) return 'video'
  if (content.audioMessage) return 'audio'
  if (content.stickerMessage) return 'sticker'
  if (content.documentMessage) return 'document'
  if (content.locationMessage) return 'location'
  if (content.contactMessage || content.contactsArrayMessage) return 'contact'
  if (content.pollCreationMessage || content.pollCreationMessageV2 || content.pollCreationMessageV3) return 'poll'
  if (content.reactionMessage) return 'reaction'
  if (content.buttonsMessage || content.viewOnceMessage?.message?.buttonsMessage) return 'button'
  if (content.listMessage || content.viewOnceMessage?.message?.listMessage) return 'list'
  
  return 'unknown'
}
