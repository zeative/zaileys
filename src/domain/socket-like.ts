import type {
  GroupMetadata,
  NewsletterMetadata,
  ParticipantAction,
  WAMediaUpload,
  WAPrivacyGroupAddValue,
  WAPrivacyOnlineValue,
  WAPrivacyValue,
  WAReadReceiptsValue,
} from 'baileys'
import type { LinkedGroup } from './types.js'

/**
 * Structural subset of the baileys socket consumed by the four domain modules
 * (group/privacy/newsletter/community). Declared independently of the Phase 3
 * `BaileysSocket` type so domain modules stay decoupled and Wave 2 plans share
 * a single, stable contract.
 */
export interface DomainSocketLike {
  groupCreate(subject: string, participants: string[]): Promise<GroupMetadata>
  groupParticipantsUpdate(
    jid: string,
    participants: string[],
    action: ParticipantAction,
  ): Promise<{ status: string; jid: string; content?: unknown }[]>
  groupUpdateSubject(jid: string, subject: string): Promise<void>
  groupUpdateDescription(jid: string, description?: string): Promise<void>
  groupLeave(id: string): Promise<void>
  groupMetadata(jid: string): Promise<GroupMetadata>
  groupInviteCode(jid: string): Promise<string | undefined>
  groupRevokeInvite(jid: string): Promise<string | undefined>
  groupAcceptInvite(code: string): Promise<string | undefined>
  groupToggleEphemeral(jid: string, ephemeralExpiration: number): Promise<void>
  groupSettingUpdate(
    jid: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked',
  ): Promise<void>
  updateMemberLabel(jid: string, memberLabel: string): Promise<unknown>

  updateLastSeenPrivacy(value: WAPrivacyValue): Promise<void>
  updateOnlinePrivacy(value: WAPrivacyOnlineValue): Promise<void>
  updateProfilePicturePrivacy(value: WAPrivacyValue): Promise<void>
  updateStatusPrivacy(value: WAPrivacyValue): Promise<void>
  updateReadReceiptsPrivacy(value: WAReadReceiptsValue): Promise<void>
  updateGroupsAddPrivacy(value: WAPrivacyGroupAddValue): Promise<void>
  updateDefaultDisappearingMode(duration: number): Promise<void>
  fetchPrivacySettings(force?: boolean): Promise<{ [_: string]: string }>
  updateBlockStatus(jid: string, action: 'block' | 'unblock'): Promise<void>
  fetchBlocklist(): Promise<string[]>

  newsletterCreate(name: string, description?: string): Promise<NewsletterMetadata>
  newsletterFollow(jid: string): Promise<unknown>
  newsletterUnfollow(jid: string): Promise<unknown>
  newsletterMetadata(type: 'invite' | 'jid', key: string): Promise<NewsletterMetadata | null>
  newsletterUpdateName(jid: string, name: string): Promise<unknown>
  newsletterUpdateDescription(jid: string, description: string): Promise<unknown>
  newsletterUpdatePicture(jid: string, content: WAMediaUpload): Promise<unknown>
  newsletterMute(jid: string): Promise<unknown>
  newsletterUnmute(jid: string): Promise<unknown>
  newsletterDelete(jid: string): Promise<void>

  communityCreate(subject: string, body: string): Promise<GroupMetadata>
  communityCreateGroup(
    subject: string,
    participants: string[],
    parentCommunityJid: string,
  ): Promise<GroupMetadata>
  communityLinkGroup(groupJid: string, parentCommunityJid: string): Promise<void>
  communityUnlinkGroup(groupJid: string, parentCommunityJid: string): Promise<void>
  communityFetchLinkedGroups(
    jid: string,
  ): Promise<{ communityJid: string; isCommunity: boolean; linkedGroups: LinkedGroup[] }>
  communityLeave(id: string): Promise<void>
  communityUpdateSubject(jid: string, subject: string): Promise<void>
  communityUpdateDescription(jid: string, description?: string): Promise<void>
  communityInviteCode(jid: string): Promise<string | undefined>
  communityRevokeInvite(jid: string): Promise<string | undefined>
  communityAcceptInvite(code: string): Promise<string | undefined>
}
