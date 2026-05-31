import type { WAMessageKey } from 'baileys'
import type { MentionAllContext, MentionContext, MessageContext } from './context.js'

/** Resolved sender identity normalized across PN and LID addressing modes. */
export interface SenderInfo {
  jid: string
  lid?: string
  pn?: string
  username?: string
  pushName?: string
  isMe?: boolean
}

/** Group participant identity carrying LID-aware aliases and admin flag. */
export interface GroupParticipantInfo {
  jid: string
  participantAlt?: string
  authorPn?: string
  authorUsername?: string
  isAdmin?: boolean
}

/** Lightweight reference to a quoted (replied-to) message. */
export interface QuotedRef {
  key: WAMessageKey
  content?: string
  sender?: SenderInfo
}

/** Discriminator over downloadable media content types. */
export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker'

/** Result of a lazy media download: raw bytes plus resolved metadata. */
export interface MediaDownloadResult {
  buffer: Buffer
  mime: string
  size: number
}

/** Media descriptor attached to image, video, audio, document, and sticker events. */
export interface MediaDescriptor {
  mimetype: string
  size?: number
  caption?: string
  fileName?: string
  ptt?: boolean
}

/** Reaction add/remove event; a `null` emoji denotes an unreact. */
export interface ReactionPayload {
  key: WAMessageKey
  emoji: string | null
  sender: SenderInfo
  timestamp: number
}

/** Message-edit event carrying the replacement text and edit time. */
export interface EditPayload {
  key: WAMessageKey
  newContent: string
  editedAt: number
  sender: SenderInfo
}

/** Message-deletion (revoke) event scoped to everyone or self. */
export interface DeletePayload {
  key: WAMessageKey
  deletedFor: 'everyone' | 'me'
  sender: SenderInfo
  timestamp: number
}

/** Poll vote update listing the options the voter currently selected. */
export interface PollVotePayload {
  pollKey: WAMessageKey
  selectedOptions: string[]
  voter: SenderInfo
  timestamp: number
}

/** Template/interactive button click reply event. */
export interface ButtonClickPayload {
  key: WAMessageKey
  buttonId: string
  buttonText?: string
  sender: SenderInfo
  timestamp: number
}

/** List message row selection reply event. */
export interface ListSelectPayload {
  key: WAMessageKey
  rowId: string
  title?: string
  sender: SenderInfo
  timestamp: number
}

/** Group metadata change event carrying only the mutated fields. */
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

/** Participants added to a group via add, invite, or invite-link. */
export interface GroupJoinPayload {
  groupId: string
  participants: GroupParticipantInfo[]
  action: 'add' | 'invite' | 'invite-link'
  by?: string
  timestamp: number
}

/** Participants removed from a group via removal or voluntary leave. */
export interface GroupLeavePayload {
  groupId: string
  participants: GroupParticipantInfo[]
  action: 'remove' | 'leave'
  by?: string
  timestamp: number
}

/** Member-label tag applied to a group participant (rc13 member-tag.update). */
export interface MemberTagPayload {
  groupId: string
  participant: string
  participantAlt?: string
  label: string
  timestamp: number
}

/** Call event discriminated by `kind` into incoming and ended variants. */
export type CallPayload =
  | (CallBase & { kind: 'incoming' })
  | (CallBase & { kind: 'ended' })

/** Shared fields for every {@link CallPayload} variant. */
export interface CallBase {
  callId: string
  from: string
  isGroup: boolean
  isVideo: boolean
  timestamp: number
  status?: string
}

/** History-sync status re-emit; carries no message bodies (handled by the store). */
export interface HistorySyncPayload {
  syncType: string
  status: 'complete' | 'paused'
  explicit: boolean
}

/** Account-limitation event discriminated by `reason` (reachout timelock vs chat quota). */
export type LimitedPayload =
  | { reason: 'reachout-timelock'; retryAt: number }
  | { reason: 'chat-limit-reached'; usedQuota?: number; totalQuota?: number }

/** Presence update for a chat or a specific group participant. */
export interface PresencePayload {
  jid: string
  participant?: string
  status: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'
}

/** Consolidated newsletter event discriminated by `action`. */
export type NewsletterPayload = {
  newsletterId: string
  timestamp: number
} & (
  | { action: 'reaction'; serverId?: string; emoji?: string }
  | { action: 'view'; serverId?: string; count?: number }
  | { action: 'participants'; count?: number }
  | { action: 'settings'; update?: Record<string, unknown> }
)

/**
 * Typed contract for every decoded inbound event (EVT-01..24). Composed with
 * `ConnectionEventMap` into `ClientEventMap` at the client boundary.
 */
export type InboundEventMap = {
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

/** Discriminator union over every inbound event key. */
export type InboundEventName = keyof InboundEventMap
