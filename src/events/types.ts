import type { WAMessageKey } from 'baileys'
import type { MentionAllContext, MentionContext, MessageContext } from './context.js'

export interface SenderInfo {
  jid: string
  deviceJid?: string
  lid?: string
  pn?: string
  username?: string
  pushName?: string
  isMe?: boolean
}

export interface GroupParticipantInfo {
  jid: string
  participantAlt?: string
  authorPn?: string
  authorUsername?: string
  isAdmin?: boolean
}

export interface QuotedRef {
  key: WAMessageKey
  content?: string
  sender?: SenderInfo
}

export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

export interface MediaDownloadResult {
  buffer: Buffer
  mime: string
  size: number
}

export interface MediaDescriptor {
  mimetype: string
  size?: number
  caption?: string
  fileName?: string
  ptt?: boolean
}

export interface ReactionPayload {
  key: WAMessageKey
  emoji: string | null
  sender: SenderInfo
  timestamp: number
}

export interface EditPayload {
  key: WAMessageKey
  newContent: string
  editedAt: number
  sender: SenderInfo
}

export interface DeletePayload {
  key: WAMessageKey
  deletedFor: 'everyone' | 'me'
  sender: SenderInfo
  timestamp: number
}

export interface PollVotePayload {
  pollKey: WAMessageKey
  /** Raw SHA-256 hashes WhatsApp sends. Use {@link PollVotePayload.options} for readable text. */
  selectedOptions: string[]
  /** The option text the voter picked. Needs the original poll in the store; empty when unavailable. */
  options(): Promise<string[]>
  voter: SenderInfo
  timestamp: number
}

export interface ButtonClickPayload {
  key: WAMessageKey
  buttonId: string
  buttonText?: string
  sender: SenderInfo
  timestamp: number
}

export interface ListSelectPayload {
  key: WAMessageKey
  rowId: string
  title?: string
  sender: SenderInfo
  timestamp: number
}

export interface GroupUpdatePayload {
  groupId: string
  update: Partial<{
    subject: string
    description: string
    announce: boolean
    restrict: boolean
    ephemeralDuration: number
  }>
  timestamp: number
}

export interface GroupJoinPayload {
  groupId: string
  participants: GroupParticipantInfo[]
  action: 'add' | 'invite' | 'invite-link'
  by?: string
  timestamp: number
}

export interface GroupLeavePayload {
  groupId: string
  participants: GroupParticipantInfo[]
  action: 'remove' | 'leave'
  by?: string
  timestamp: number
}

export interface MemberTagPayload {
  groupId: string
  participant: string
  participantAlt?: string
  label: string
  timestamp: number
}

export type CallPayload =
  | (CallBase & { kind: 'incoming' })
  | (CallBase & { kind: 'ended' })

export interface CallerInfo {
  /** Caller platform as WhatsApp reports it, e.g. `iphone`, `android`, `smba`. More reliable than a jid device index. */
  platform?: string
  /** Caller's WhatsApp app version, e.g. `2.26.30.78`. */
  appVersion?: string
  /** Caller's pushname carried on the call stanza. */
  name?: string
  /** ISO 3166 country the caller is dialling from, e.g. `ID`. */
  countryCode?: string
  /** Caller's phone-number jid — present even when the call itself is addressed by LID. */
  phoneJid?: string
  /** Raw network medium code the caller's device reported. */
  networkMedium?: number
  /** Screen size the caller's device advertised. Video calls only. */
  screen?: { width: number; height: number }
}

export interface CallBase {
  callId: string
  from: string
  isGroup: boolean
  isVideo: boolean
  timestamp: number
  status?: string
  /** Extra caller details from the raw call stanza. Absent when WhatsApp did not send them. */
  caller?: CallerInfo
}

export interface HistorySyncPayload {
  syncType: string
  status: 'complete' | 'paused'
  explicit: boolean
}

export type LimitedPayload =
  | { reason: 'reachout-timelock'; retryAt: number }
  | { reason: 'chat-limit-reached'; usedQuota?: number; totalQuota?: number }

export interface PresencePayload {
  jid: string
  participant?: string
  status: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
}

export type NewsletterPayload = {
  newsletterId: string
  timestamp: number
} & (
  | { action: 'reaction'; serverId?: string; emoji?: string }
  | { action: 'view'; serverId?: string; count?: number }
  | { action: 'participants'; count?: number }
  | { action: 'settings'; update?: Record<string, unknown> }
)

export type InboundEventMap = {
  message: MessageContext
  text: MessageContext
  image: MessageContext
  video: MessageContext
  audio: MessageContext
  document: MessageContext
  sticker: MessageContext
  reaction: ReactionPayload
  edit: EditPayload
  delete: DeletePayload
  'poll-vote': PollVotePayload
  'button-click': ButtonClickPayload
  'list-select': ListSelectPayload
  mention: MentionContext
  'mention-all': MentionAllContext
  'group-update': GroupUpdatePayload
  'group-join': GroupJoinPayload
  'group-leave': GroupLeavePayload
  'member-tag': MemberTagPayload
  'call-incoming': Extract<CallPayload, { kind: 'incoming' }>
  'call-ended': Extract<CallPayload, { kind: 'ended' }>
  'history-sync': HistorySyncPayload
  limited: LimitedPayload
  presence: PresencePayload
  newsletter: NewsletterPayload
}

export type InboundEventName = keyof InboundEventMap
