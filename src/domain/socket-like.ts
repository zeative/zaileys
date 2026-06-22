import type {
  ChatModification,
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
  groupFetchAllParticipating(): Promise<{ [jid: string]: GroupMetadata }>
  groupGetInviteInfo(code: string): Promise<GroupMetadata>
  groupRequestParticipantsList(jid: string): Promise<Array<{ [k: string]: string }>>
  groupRequestParticipantsUpdate(
    jid: string,
    participants: string[],
    action: 'approve' | 'reject',
  ): Promise<{ status: string; jid: string }[]>
  groupJoinApprovalMode(jid: string, mode: 'on' | 'off'): Promise<void>
  groupMemberAddMode(jid: string, mode: 'admin_add' | 'all_member_add'): Promise<void>

  onWhatsApp(...jids: string[]): Promise<Array<{ jid: string; exists: boolean; lid?: string }> | undefined>
  addOrEditContact(jid: string, contact: { firstName?: string; lastName?: string; fullName?: string }): Promise<unknown>
  removeContact(jid: string): Promise<unknown>

  getBusinessProfile(jid: string): Promise<unknown>
  getCatalog(opts: { jid?: string; limit?: number; cursor?: string }): Promise<unknown>
  getCollections(jid?: string, limit?: number): Promise<unknown>
  getOrderDetails(orderId: string, tokenBase64: string): Promise<unknown>
  productCreate(create: Record<string, unknown>): Promise<unknown>
  productUpdate(productId: string, update: Record<string, unknown>): Promise<unknown>
  productDelete(productIds: string[]): Promise<{ deleted: number }>

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

  updateProfileName(name: string): Promise<void>
  updateProfileStatus(status: string): Promise<void>
  updateProfilePicture(jid: string, content: WAMediaUpload): Promise<void>
  removeProfilePicture(jid: string): Promise<void>
  profilePictureUrl(jid: string, type?: 'image' | 'preview', timeoutMs?: number): Promise<string | undefined>
  fetchStatus(jid: string): Promise<unknown>
  chatModify(mod: ChatModification, jid: string): Promise<void>

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
  newsletterSubscribers(jid: string): Promise<unknown>
  newsletterRemovePicture(jid: string): Promise<unknown>
  newsletterReactMessage(jid: string, serverId: string, reaction?: string): Promise<void>
  newsletterFetchMessages(jid: string, count: number, since?: number, after?: number): Promise<unknown>
  newsletterAdminCount(jid: string): Promise<number>
  newsletterChangeOwner(jid: string, newOwnerJid: string): Promise<void>
  newsletterDemote(jid: string, userJid: string): Promise<void>

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
  communityMetadata(jid: string): Promise<GroupMetadata>
  communityFetchAllParticipating(): Promise<{ [jid: string]: GroupMetadata }>
  communityGetInviteInfo(code: string): Promise<GroupMetadata>
  communityToggleEphemeral(jid: string, ephemeralExpiration: number): Promise<void>
  communitySettingUpdate(jid: string, setting: 'announcement' | 'not_announcement'): Promise<void>
  communityMemberAddMode(jid: string, mode: 'admin_add' | 'all_member_add'): Promise<void>
  communityJoinApprovalMode(jid: string, mode: 'on' | 'off'): Promise<void>
}
