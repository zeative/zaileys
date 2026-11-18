import { LRUCache } from 'lru-cache'
import type { OperationGuard } from '../automation/operation-guard.js'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, ParticipantUpdateResult } from './types.js'

type RawParticipantResult = { status: string; jid: string; content?: unknown }

/** Baileys' README pattern: a short TTL, with group events invalidating entries as they change. */
const METADATA_TTL_MS = 5 * 60_000
const METADATA_MAX_GROUPS = 1_000

export interface GroupModuleOptions {
  /** Time source for the metadata cache TTL. Defaults to `performance`. */
  clock?: { now(): number }
}

export class GroupModule {
  private readonly metadataCache: LRUCache<string, GroupMetadata>
  private readonly metadataInflight = new Map<string, Promise<GroupMetadata>>()

  constructor(
    private readonly getSocket: () => DomainSocketLike | undefined,
    private readonly guard?: OperationGuard,
    options: GroupModuleOptions = {},
  ) {
    this.metadataCache = new LRUCache({
      max: METADATA_MAX_GROUPS,
      ttl: METADATA_TTL_MS,
      ttlResolution: 0,
      perf: options.clock ?? performance,
    })
  }

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
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async removeMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'remove'),
    )
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async promote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'promote'),
    )
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async demote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupParticipantsUpdate(groupId, jids, 'demote'),
    )
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async updateSubject(groupId: string, subject: string): Promise<void> {
    await this.requireSocket().groupUpdateSubject(groupId, subject)
    this.invalidateMetadata(groupId)
  }

  async updateDescription(groupId: string, description?: string): Promise<void> {
    await this.requireSocket().groupUpdateDescription(groupId, description)
    this.invalidateMetadata(groupId)
  }

  async leave(groupId: string): Promise<void> {
    await this.requireSocket().groupLeave(groupId)
    this.invalidateMetadata(groupId)
  }

  /** Always asks WhatsApp, and refreshes the copy `cachedMetadata()` serves. */
  async metadata(groupId: string): Promise<GroupMetadata> {
    const meta = await this.requireSocket().groupMetadata(groupId)
    this.metadataCache.set(groupId, meta)
    return meta
  }

  /**
   * Metadata up to five minutes old, refreshed when group events report a change. Concurrent lookups share
   * one request. Use `metadata()` when the answer must be current.
   */
  cachedMetadata(groupId: string): Promise<GroupMetadata> {
    const hit = this.metadataCache.get(groupId)
    if (hit !== undefined) return Promise.resolve(hit)
    const pending = this.metadataInflight.get(groupId)
    if (pending !== undefined) return pending
    const request = this.metadata(groupId).finally(() => {
      this.metadataInflight.delete(groupId)
    })
    this.metadataInflight.set(groupId, request)
    return request
  }

  /** Drops the cached metadata for one group, or for every group when `groupId` is omitted. */
  invalidateMetadata(groupId?: string): void {
    if (groupId === undefined) this.metadataCache.clear()
    else this.metadataCache.delete(groupId)
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
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async rejectJoin(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.run('group.participants', () =>
      this.requireSocket().groupRequestParticipantsUpdate(groupId, jids, 'reject'),
    )
    this.invalidateMetadata(groupId)
    return this.mapParticipants(raw)
  }

  async joinApproval(groupId: string, enabled: boolean): Promise<void> {
    await this.requireSocket().groupJoinApprovalMode(groupId, enabled ? 'on' : 'off')
  }

  async memberAddMode(groupId: string, adminsOnly: boolean): Promise<void> {
    await this.requireSocket().groupMemberAddMode(groupId, adminsOnly ? 'admin_add' : 'all_member_add')
  }
}
