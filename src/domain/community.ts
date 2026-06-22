import type { OperationGuard } from '../automation/operation-guard.js'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, LinkedGroup } from './types.js'

export class CommunityModule {
  constructor(
    private readonly getSocket: () => DomainSocketLike | undefined,
    private readonly guard?: OperationGuard,
  ) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  private run<T>(category: Parameters<OperationGuard['run']>[0], op: () => Promise<T>): Promise<T> {
    return this.guard ? this.guard.run(category, op) : op()
  }

  async create(subject: string, body: string): Promise<GroupMetadata> {
    return this.run('community.create', () => this.requireSocket().communityCreate(subject, body))
  }

  async createGroup(subject: string, participants: string[], communityId: string): Promise<GroupMetadata> {
    return this.run('community.create', () =>
      this.requireSocket().communityCreateGroup(subject, participants, communityId),
    )
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
    return this.run('community.join', () => this.requireSocket().communityAcceptInvite(code))
  }

  async metadata(communityId: string): Promise<GroupMetadata> {
    return this.requireSocket().communityMetadata(communityId)
  }

  async list(): Promise<GroupMetadata[]> {
    return Object.values(await this.requireSocket().communityFetchAllParticipating())
  }

  async inviteInfo(code: string): Promise<GroupMetadata> {
    return this.requireSocket().communityGetInviteInfo(code)
  }

  async toggleEphemeral(communityId: string, seconds: number): Promise<void> {
    await this.requireSocket().communityToggleEphemeral(communityId, seconds)
  }

  async setting(communityId: string, setting: 'announcement' | 'not_announcement'): Promise<void> {
    await this.requireSocket().communitySettingUpdate(communityId, setting)
  }

  async memberAddMode(communityId: string, adminsOnly: boolean): Promise<void> {
    await this.requireSocket().communityMemberAddMode(communityId, adminsOnly ? 'admin_add' : 'all_member_add')
  }

  async joinApproval(communityId: string, enabled: boolean): Promise<void> {
    await this.requireSocket().communityJoinApprovalMode(communityId, enabled ? 'on' : 'off')
  }
}
