import type { MessageRoom, MessageSender, DeviceType, RoomType } from '../types/context'
import { isGroupJid, isNewsletterJid, isUserJid } from '../utils/jid'

export function parseRoom(jid: string): MessageRoom {
  let type: RoomType = 'unknown'
  
  if (isGroupJid(jid)) type = 'group'
  else if (isNewsletterJid(jid)) type = 'newsletter'
  else if (isUserJid(jid)) type = 'user'
  else if (jid === 'status@broadcast') type = 'status'

  return { id: jid, type }
}

export function parseSender(jid: string, pushName?: string): MessageSender {
  return {
    id: jid,
    pushName,
    device: getDeviceType(jid)
  }
}

function getDeviceType(jid: string): DeviceType {
  // Baileys specific device detection logic usually involves .@p notation
  // For now we'll use a placeholder until socket integration.
  return 'unknown'
}
