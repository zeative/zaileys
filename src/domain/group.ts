import type { OperationGuard } from '../automation/operation-guard.js'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, ParticipantUpdateResult } from './types.js'

type RawParticipantResult = { status: string; jid: string; content?: unknown }

export class GroupModule {
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

  private mapParticipants(raw: RawParticipantResult[]): ParticipantUpdateResult[] {
    return raw.map((entry) => ({ jid: entry.jid, status: entry.status }))
  }

  private run<T>(category: Parameters<OperationGuard['run']>[0], op: () => Promise<T>): Promise<T> {
    return this.guard ? this.guard.run(category, op) : op()
  }

  async create(subject: string, participants: string[]): Promise<GroupMetadata> {
    return this.run('group.create', () => this.requireSocket().groupCreate(subject, participants))
  }

  async addMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'add'),
    )
    return this.mapParticipants(raw)
  }

  async removeMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'remove'),
    )
    return this.mapParticipants(raw)
  }

  async promote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'promote'),
    )
    return this.mapParticipants(raw)
  }

  async demote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'demote'),
    )
    return this.mapParticipants(raw)
  }

  async updateSubject(groupId: string, subject: string): Promise<void> {
    await this.requireSocket().groupUpdateSubject(groupId, subject)
  }

  async updateDescription(groupId: string, description?: string): Promise<void> {
    await this.requireSocket().groupUpdateDescription(groupId, description)
  }

  async leave(groupId: string): Promise<void> {
    await this.requireSocket().groupLeave(groupId)
  }

  async metadata(groupId: string): Promise<GroupMetadata> {
    return this.requireSocket().groupMetadata(groupId)
  }

  async tagMember(groupId: string, jid: string, label: string): Promise<void> {
    void jid
    await this.requireSocket().updateMemberLabel(groupId, label)
  }

  async inviteCode(groupId: string): Promise<string> {
    const code = await this.requireSocket().groupInviteCode(groupId)
    if (!code) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite code unavailable')
    }
    return code
  }

  async revokeInvite(groupId: string): Promise<string> {
    const code = await this.requireSocket().groupRevokeInvite(groupId)
    if (!code) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite code unavailable')
    }
    return code
  }

  async acceptInvite(code: string): Promise<string> {
    const groupJid = await this.run('group.join', () => this.requireSocket().groupAcceptInvite(code))
    if (!groupJid) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite acceptance failed')
    }
    return groupJid
  }

  async toggleEphemeral(groupId: string, seconds: number): Promise<void> {
    await this.requireSocket().groupToggleEphemeral(groupId, seconds)
  }

  async setting(
    groupId: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked',
  ): Promise<void> {
    await this.requireSocket().groupSettingUpdate(groupId, setting)
  }

  async list(): Promise<GroupMetadata[]> {
    const all = await this.requireSocket().groupFetchAllParticipating()
    return Object.values(all)
  }

  async inviteInfo(code: string): Promise<GroupMetadata> {
    return this.requireSocket().groupGetInviteInfo(code)
  }

  async joinRequests(groupId: string): Promise<Array<{ [k: string]: string }>> {
    return this.requireSocket().groupRequestParticipantsList(groupId)
  }

  async approveJoin(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupRequestParticipantsUpdate(groupId, jids, 'approve'),
    )
    return this.mapParticipants(raw)
  }

  async rejectJoin(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupRequestParticipantsUpdate(groupId, jids, 'reject'),
    )
    return this.mapParticipants(raw)
  }

  async joinApproval(groupId: string, enabled: boolean): Promise<void> {
    await this.requireSocket().groupJoinApprovalMode(groupId, enabled ? 'on' : 'off')
  }

  async memberAddMode(groupId: string, adminsOnly: boolean): Promise<void> {
    await this.requireSocket().groupMemberAddMode(groupId, adminsOnly ? 'admin_add' : 'all_member_add')
  }
}
