export type RoomType = 'user' | 'group' | 'status' | 'newsletter' | 'unknown'
export type DeviceType = 'ios' | 'android' | 'web' | 'desktop' | 'unknown'
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'location' | 'contact' | 'poll' | 'reaction' | 'view_once' | 'button' | 'list' | 'edited' | 'deleted' | 'interactive' | 'unknown'

export interface MessageRoom {
  id: string
  type: RoomType
  name?: string
}

export interface MessageSender {
  id: string
  pushName?: string
  device?: DeviceType
}

export interface MessageContent {
  type: MessageType
  text?: string
  caption?: string
  raw: any
}

export interface MessageFlags {
  isGroup: boolean
  isFromMe: boolean
  isBot: boolean
  isEphemeral: boolean
  isViewOnce: boolean
  isForwarded: boolean
  isLid: boolean
  isNewsletter: boolean
}

export interface MessageActions {
  send: (payload: any) => Promise<any>
  reply: (payload: any) => Promise<any>
  react: (emoji: string) => Promise<any>
  delete: () => Promise<any>
}

export interface MessageContext {
  raw: any
  content: MessageContent
  room: MessageRoom
  sender: MessageSender
  flags: MessageFlags
  actions: MessageActions
  replied?: MessageContext
  
  // Shorthands
  readonly text: string | undefined
  readonly type: MessageType
  readonly jid: string
}
