import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, ParticipantUpdateResult } from './types.js'

type RawParticipantResult = { status: string; jid: string; content?: unknown }

/**
 * Typed wrapper over the baileys group socket methods. Exposed as
 * `client.group`. Every method funnels through {@link GroupModule.requireSocket}
 * which throws `NOT_CONNECTED` when the client socket is absent.
 */
export class GroupModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

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

  /** Create a group with the given subject and initial participants. */
  async create(subject: string, participants: string[]): Promise<GroupMetadata> {
    return this.requireSocket().groupCreate(subject, participants)
  }

  /** Add members to a group. */
  async addMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.requireSocket().groupParticipantsUpdate(groupId, jids, 'add')
    return this.mapParticipants(raw)
  }

  /** Remove members from a group. */
  async removeMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.requireSocket().groupParticipantsUpdate(groupId, jids, 'remove')
    return this.mapParticipants(raw)
  }

  /** Promote members to admin. */
  async promote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.requireSocket().groupParticipantsUpdate(groupId, jids, 'promote')
    return this.mapParticipants(raw)
  }

  /** Demote admins to members. */
  async demote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    const raw = await this.requireSocket().groupParticipantsUpdate(groupId, jids, 'demote')
    return this.mapParticipants(raw)
  }

  /** Update a group subject. */
  async updateSubject(groupId: string, subject: string): Promise<void> {
    await this.requireSocket().groupUpdateSubject(groupId, subject)
  }

  /** Update a group description. Omit `description` to clear it. */
  async updateDescription(groupId: string, description?: string): Promise<void> {
    await this.requireSocket().groupUpdateDescription(groupId, description)
  }

  /** Leave a group. */
  async leave(groupId: string): Promise<void> {
    await this.requireSocket().groupLeave(groupId)
  }

  /** Fetch fresh group metadata. */
  async metadata(groupId: string): Promise<GroupMetadata> {
    return this.requireSocket().groupMetadata(groupId)
  }

  /**
   * Apply a member label to a group (rc13 member-tag). The baileys
   * `updateMemberLabel(jid, label)` relays a `GROUP_MEMBER_LABEL_CHANGE`
   * protocol message to the group jid, so `groupId` is forwarded as the relay
   * target; `jid` identifies the tagged member for the round-trip `member-tag`
   * event but is not a baileys argument.
   */
  async tagMember(groupId: string, jid: string, label: string): Promise<void> {
    void jid
    await this.requireSocket().updateMemberLabel(groupId, label)
  }

  /** Get a group invite code. */
  async inviteCode(groupId: string): Promise<string> {
    const code = await this.requireSocket().groupInviteCode(groupId)
    if (!code) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite code unavailable')
    }
    return code
  }

  /** Revoke and regenerate a group invite code. */
  async revokeInvite(groupId: string): Promise<string> {
    const code = await this.requireSocket().groupRevokeInvite(groupId)
    if (!code) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite code unavailable')
    }
    return code
  }

  /** Accept a group invite by code. Returns the joined group jid. */
  async acceptInvite(code: string): Promise<string> {
    const groupJid = await this.requireSocket().groupAcceptInvite(code)
    if (!groupJid) {
      throw new ZaileysDomainError('OPERATION_FAILED', 'invite acceptance failed')
    }
    return groupJid
  }

  /** Toggle disappearing messages for a group. Pass `0` to disable. */
  async toggleEphemeral(groupId: string, seconds: number): Promise<void> {
    await this.requireSocket().groupToggleEphemeral(groupId, seconds)
  }

  /** Update a group setting (announcement/locked). */
  async setting(
    groupId: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked',
  ): Promise<void> {
    await this.requireSocket().groupSettingUpdate(groupId, setting)
  }
}
