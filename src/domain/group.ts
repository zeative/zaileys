import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, ParticipantUpdateResult } from './types.js'

/**
 * Typed wrapper over the baileys group socket methods. Exposed as
 * `client.group`. Bodies are filled by Wave 2 plan-002; the skeleton only
 * declares the locked signatures and the {@link GroupModule.requireSocket} guard.
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

  /** Create a group with the given subject and initial participants. */
  async create(subject: string, participants: string[]): Promise<GroupMetadata> {
    this.requireSocket()
    void subject
    void participants
    throw new ZaileysDomainError('OPERATION_FAILED', 'create not yet implemented')
  }

  /** Add members to a group. */
  async addMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    this.requireSocket()
    void groupId
    void jids
    throw new ZaileysDomainError('OPERATION_FAILED', 'addMember not yet implemented')
  }

  /** Remove members from a group. */
  async removeMember(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    this.requireSocket()
    void groupId
    void jids
    throw new ZaileysDomainError('OPERATION_FAILED', 'removeMember not yet implemented')
  }

  /** Promote members to admin. */
  async promote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    this.requireSocket()
    void groupId
    void jids
    throw new ZaileysDomainError('OPERATION_FAILED', 'promote not yet implemented')
  }

  /** Demote admins to members. */
  async demote(groupId: string, jids: string[]): Promise<ParticipantUpdateResult[]> {
    this.requireSocket()
    void groupId
    void jids
    throw new ZaileysDomainError('OPERATION_FAILED', 'demote not yet implemented')
  }

  /** Update a group subject. */
  async updateSubject(groupId: string, subject: string): Promise<void> {
    this.requireSocket()
    void groupId
    void subject
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateSubject not yet implemented')
  }

  /** Update a group description. */
  async updateDescription(groupId: string, description: string): Promise<void> {
    this.requireSocket()
    void groupId
    void description
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateDescription not yet implemented')
  }

  /** Leave a group. */
  async leave(groupId: string): Promise<void> {
    this.requireSocket()
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'leave not yet implemented')
  }

  /** Fetch fresh group metadata. */
  async metadata(groupId: string): Promise<GroupMetadata> {
    this.requireSocket()
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'metadata not yet implemented')
  }

  /** Apply a member label (rc10+ member tag). */
  async tagMember(groupId: string, jid: string, label: string): Promise<void> {
    this.requireSocket()
    void groupId
    void jid
    void label
    throw new ZaileysDomainError('OPERATION_FAILED', 'tagMember not yet implemented')
  }

  /** Get a group invite code. */
  async inviteCode(groupId: string): Promise<string> {
    this.requireSocket()
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'inviteCode not yet implemented')
  }

  /** Revoke and regenerate a group invite code. */
  async revokeInvite(groupId: string): Promise<string> {
    this.requireSocket()
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'revokeInvite not yet implemented')
  }

  /** Accept a group invite by code. */
  async acceptInvite(code: string): Promise<string> {
    this.requireSocket()
    void code
    throw new ZaileysDomainError('OPERATION_FAILED', 'acceptInvite not yet implemented')
  }

  /** Toggle disappearing messages for a group. */
  async toggleEphemeral(groupId: string, seconds: number): Promise<void> {
    this.requireSocket()
    void groupId
    void seconds
    throw new ZaileysDomainError('OPERATION_FAILED', 'toggleEphemeral not yet implemented')
  }

  /** Update a group setting (announcement/locked). */
  async setting(
    groupId: string,
    setting: 'announcement' | 'not_announcement' | 'locked' | 'unlocked',
  ): Promise<void> {
    this.requireSocket()
    void groupId
    void setting
    throw new ZaileysDomainError('OPERATION_FAILED', 'setting not yet implemented')
  }
}
