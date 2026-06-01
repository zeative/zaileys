import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, LinkedGroup } from './types.js'

export class CommunityModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  async create(subject: string, body: string): Promise<GroupMetadata> {
    return this.requireSocket().communityCreate(subject, body)
  }

  async createGroup(subject: string, participants: string[], communityId: string): Promise<GroupMetadata> {
    return this.requireSocket().communityCreateGroup(subject, participants, communityId)
  }

  async linkGroup(communityId: string, groupId: string): Promise<void> {
    await this.requireSocket().communityLinkGroup(groupId, communityId)
  }

  async unlinkGroup(communityId: string, groupId: string): Promise<void> {
    await this.requireSocket().communityUnlinkGroup(groupId, communityId)
  }

  async subGroups(communityId: string): Promise<LinkedGroup[]> {
    const result = await this.requireSocket().communityFetchLinkedGroups(communityId)
    return result.linkedGroups
  }

  async leave(communityId: string): Promise<void> {
    await this.requireSocket().communityLeave(communityId)
  }

  async updateSubject(communityId: string, subject: string): Promise<void> {
    await this.requireSocket().communityUpdateSubject(communityId, subject)
  }

  async updateDescription(communityId: string, description?: string): Promise<void> {
    await this.requireSocket().communityUpdateDescription(communityId, description)
  }

  async inviteCode(communityId: string): Promise<string | undefined> {
    return this.requireSocket().communityInviteCode(communityId)
  }

  async revokeInvite(communityId: string): Promise<string | undefined> {
    return this.requireSocket().communityRevokeInvite(communityId)
  }

  async acceptInvite(code: string): Promise<string | undefined> {
    return this.requireSocket().communityAcceptInvite(code)
  }
}
