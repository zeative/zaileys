export type {
  GroupMetadata,
  GroupParticipant,
  ParticipantAction,
  WAPrivacyValue,
  WAPrivacyOnlineValue,
  WAReadReceiptsValue,
  WAPrivacyGroupAddValue,
  NewsletterMetadata,
  WAMediaUpload,
} from 'baileys'

import type {
  WAPrivacyValue,
  WAPrivacyOnlineValue,
  WAReadReceiptsValue,
  WAPrivacyGroupAddValue,
} from 'baileys'

/**
 * Per-participant result of a group membership mutation. `status` mirrors the
 * baileys participant status code (e.g. `'200'`).
 */
export interface ParticipantUpdateResult {
  jid: string
  status: string
}

/**
 * Partial privacy configuration applied by `PrivacyModule.set`. Only the
 * provided keys are applied; each maps to a dedicated baileys privacy method.
 */
export interface PrivacyConfig {
  lastSeen?: WAPrivacyValue
  online?: WAPrivacyOnlineValue
  profile?: WAPrivacyValue
  status?: WAPrivacyValue
  readReceipts?: WAReadReceiptsValue
  groupAdd?: WAPrivacyGroupAddValue
}

/**
 * Raw privacy settings map returned by `fetchPrivacySettings`.
 */
export type PrivacySettings = { [key: string]: string }

/**
 * Element shape of `communityFetchLinkedGroups().linkedGroups`, surfaced by
 * `CommunityModule.subGroups`.
 */
export interface LinkedGroup {
  id?: string
  subject: string
  creation?: number
  owner?: string
  size?: number
}
