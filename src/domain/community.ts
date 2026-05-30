import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, LinkedGroup } from './types.js'

/**
 * Typed wrapper over the baileys communities socket methods. Exposed as
 * `client.community`. Note the argument order swap: `linkGroup(communityId,
 * groupId)` maps to baileys `communityLinkGroup(groupJid, parentCommunityJid)`.
 */
export class CommunityModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  /** Create a community with subject and body (description). */
  async create(subject: string, body: string): Promise<GroupMetadata> {
    return this.requireSocket().communityCreate(subject, body)
  }

  /** Create a group linked to a parent community. */
  async createGroup(subject: string, participants: string[], communityId: string): Promise<GroupMetadata> {
    return this.requireSocket().communityCreateGroup(subject, participants, communityId)
  }

  /** Link an existing group into a community. */
  async linkGroup(communityId: string, groupId: string): Promise<void> {
    await this.requireSocket().communityLinkGroup(groupId, communityId)
  }

  /** Unlink a group from a community. */
  async unlinkGroup(communityId: string, groupId: string): Promise<void> {
    await this.requireSocket().communityUnlinkGroup(groupId, communityId)
  }

  /** List the sub-groups linked to a community. */
  async subGroups(communityId: string): Promise<LinkedGroup[]> {
    const result = await this.requireSocket().communityFetchLinkedGroups(communityId)
    return result.linkedGroups
  }

  /** Leave a community. */
  async leave(communityId: string): Promise<void> {
    await this.requireSocket().communityLeave(communityId)
  }

  /** Update a community subject. */
  async updateSubject(communityId: string, subject: string): Promise<void> {
    await this.requireSocket().communityUpdateSubject(communityId, subject)
  }

  /** Update a community description. */
  async updateDescription(communityId: string, description?: string): Promise<void> {
    await this.requireSocket().communityUpdateDescription(communityId, description)
  }

  /** Get a community invite code. */
  async inviteCode(communityId: string): Promise<string | undefined> {
    return this.requireSocket().communityInviteCode(communityId)
  }

  /** Revoke and regenerate a community invite code. */
  async revokeInvite(communityId: string): Promise<string | undefined> {
    return this.requireSocket().communityRevokeInvite(communityId)
  }

  /** Accept a community invite by code. */
  async acceptInvite(code: string): Promise<string | undefined> {
    return this.requireSocket().communityAcceptInvite(code)
  }
}
