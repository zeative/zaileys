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

export interface ParticipantUpdateResult {
  jid: string
  status: string
}

export interface PrivacyConfig {
  lastSeen?: WAPrivacyValue
  online?: WAPrivacyOnlineValue
  profile?: WAPrivacyValue
  status?: WAPrivacyValue
  readReceipts?: WAReadReceiptsValue
  groupAdd?: WAPrivacyGroupAddValue
}

export type PrivacySettings = { [key: string]: string }

export interface LinkedGroup {
  id?: string
  subject: string
  creation?: number
  owner?: string
  size?: number
}
