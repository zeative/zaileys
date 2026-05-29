import type {
  GroupJoinPayload,
  GroupLeavePayload,
  GroupParticipantInfo,
  GroupUpdatePayload,
  MemberTagPayload,
} from '../types.js'

/** Partial group-metadata shape emitted by baileys `groups.update`. */
export interface GroupMetadataUpdate {
  id?: string
  subject?: string
  desc?: string
  announce?: boolean
  restrict?: boolean
  ephemeralDuration?: number
}

/** Single participant entry from a baileys `group-participants.update` batch. */
export interface RawGroupParticipant {
  id: string
  lid?: string
  pn?: string
  phoneNumber?: string
  username?: string
  admin?: 'admin' | 'superadmin' | null
}

/** Baileys `group-participants.update` payload (object-array participants). */
export interface GroupParticipantsUpdate {
  id?: string
  author?: string
  authorPn?: string
  authorUsername?: string
  participants: RawGroupParticipant[]
  action: string
}

/** Baileys `group.member-tag.update` payload (rc13+). */
export interface MemberTagUpdate {
  groupId?: string
  participant?: string
  participantAlt?: string
  label?: string
  messageTimestamp?: number
}

const isNonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0

const pickDefined = (item: GroupMetadataUpdate): GroupUpdatePayload['update'] => {
  const update: GroupUpdatePayload['update'] = {}
  if (typeof item.subject === 'string') update.subject = item.subject
  if (typeof item.desc === 'string') update.description = item.desc
  if (typeof item.announce === 'boolean') update.announce = item.announce
  if (typeof item.restrict === 'boolean') update.restrict = item.restrict
  if (typeof item.ephemeralDuration === 'number') update.ephemeralDuration = item.ephemeralDuration
  return update
}

const mapParticipants = (
  raw: RawGroupParticipant[],
  authorPn: string | undefined,
  authorUsername: string | undefined,
): GroupParticipantInfo[] =>
  raw
    .filter((p): p is RawGroupParticipant => isNonEmpty(p?.id))
    .map((p) => {
      const info: GroupParticipantInfo = { jid: p.id }
      const alt = p.lid ?? p.pn ?? p.phoneNumber
      if (isNonEmpty(alt)) info.participantAlt = alt
      if (isNonEmpty(authorPn)) info.authorPn = authorPn
      if (isNonEmpty(authorUsername)) info.authorUsername = authorUsername
      info.isAdmin = p.admin === 'admin' || p.admin === 'superadmin'
      return info
    })

/** Decode a baileys `groups.update` item into a {@link GroupUpdatePayload}, or `null`. */
export const decodeGroupUpdate = (item: GroupMetadataUpdate): GroupUpdatePayload | null => {
  if (!isNonEmpty(item?.id)) return null
  return { groupId: item.id, update: pickDefined(item), timestamp: Date.now() }
}

/** Decode a `group.member-tag.update` payload into a {@link MemberTagPayload}, or `null`. */
export const decodeMemberTag = (item: MemberTagUpdate): MemberTagPayload | null => {
  if (!isNonEmpty(item?.groupId) || !isNonEmpty(item?.participant)) return null
  const payload: MemberTagPayload = {
    groupId: item.groupId,
    participant: item.participant,
    label: typeof item.label === 'string' ? item.label : '',
    timestamp: typeof item.messageTimestamp === 'number' ? item.messageTimestamp : Date.now(),
  }
  if (isNonEmpty(item.participantAlt)) payload.participantAlt = item.participantAlt
  return payload
}

const JOIN_ACTIONS = new Set(['add', 'invite', 'invite-link'])
const LEAVE_ACTIONS = new Set(['remove', 'leave'])

/** Decode an add/invite `group-participants.update` into a {@link GroupJoinPayload}, or `null`. */
export const decodeGroupJoin = (item: GroupParticipantsUpdate): GroupJoinPayload | null => {
  if (!isNonEmpty(item?.id)) return null
  if (!JOIN_ACTIONS.has(item.action)) return null
  if (!Array.isArray(item.participants) || item.participants.length === 0) return null
  const participants = mapParticipants(item.participants, item.authorPn, item.authorUsername)
  if (participants.length === 0) return null
  const payload: GroupJoinPayload = {
    groupId: item.id,
    participants,
    action: item.action as GroupJoinPayload['action'],
    timestamp: Date.now(),
  }
  if (isNonEmpty(item.author)) payload.by = item.author
  return payload
}

/** Decode a remove/leave `group-participants.update` into a {@link GroupLeavePayload}, or `null`. */
export const decodeGroupLeave = (item: GroupParticipantsUpdate): GroupLeavePayload | null => {
  if (!isNonEmpty(item?.id)) return null
  if (!LEAVE_ACTIONS.has(item.action)) return null
  if (!Array.isArray(item.participants) || item.participants.length === 0) return null
  const participants = mapParticipants(item.participants, item.authorPn, item.authorUsername)
  if (participants.length === 0) return null
  const payload: GroupLeavePayload = {
    groupId: item.id,
    participants,
    action: item.action as GroupLeavePayload['action'],
    timestamp: Date.now(),
  }
  if (isNonEmpty(item.author)) payload.by = item.author
  return payload
}
