import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { GroupMetadata, LinkedGroup } from './types.js'

/**
 * Typed wrapper over the baileys communities socket methods. Exposed as
 * `client.community`. Bodies are filled by Wave 2 plan-005. Note the argument
 * order swap: `linkGroup(communityId, groupId)` maps to baileys
 * `communityLinkGroup(groupJid, parentCommunityJid)`.
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
    this.requireSocket()
    void subject
    void body
    throw new ZaileysDomainError('OPERATION_FAILED', 'create not yet implemented')
  }

  /** Create a group linked to a parent community. */
  async createGroup(subject: string, participants: string[], communityId: string): Promise<GroupMetadata> {
    this.requireSocket()
    void subject
    void participants
    void communityId
    throw new ZaileysDomainError('OPERATION_FAILED', 'createGroup not yet implemented')
  }

  /** Link an existing group into a community. */
  async linkGroup(communityId: string, groupId: string): Promise<void> {
    this.requireSocket()
    void communityId
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'linkGroup not yet implemented')
  }

  /** Unlink a group from a community. */
  async unlinkGroup(communityId: string, groupId: string): Promise<void> {
    this.requireSocket()
    void communityId
    void groupId
    throw new ZaileysDomainError('OPERATION_FAILED', 'unlinkGroup not yet implemented')
  }

  /** List the sub-groups linked to a community. */
  async subGroups(communityId: string): Promise<LinkedGroup[]> {
    this.requireSocket()
    void communityId
    throw new ZaileysDomainError('OPERATION_FAILED', 'subGroups not yet implemented')
  }

  /** Leave a community. */
  async leave(communityId: string): Promise<void> {
    this.requireSocket()
    void communityId
    throw new ZaileysDomainError('OPERATION_FAILED', 'leave not yet implemented')
  }

  /** Update a community subject. */
  async updateSubject(communityId: string, subject: string): Promise<void> {
    this.requireSocket()
    void communityId
    void subject
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateSubject not yet implemented')
  }

  /** Update a community description. */
  async updateDescription(communityId: string, description?: string): Promise<void> {
    this.requireSocket()
    void communityId
    void description
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateDescription not yet implemented')
  }

  /** Get a community invite code. */
  async inviteCode(communityId: string): Promise<string> {
    this.requireSocket()
    void communityId
    throw new ZaileysDomainError('OPERATION_FAILED', 'inviteCode not yet implemented')
  }

  /** Revoke and regenerate a community invite code. */
  async revokeInvite(communityId: string): Promise<string> {
    this.requireSocket()
    void communityId
    throw new ZaileysDomainError('OPERATION_FAILED', 'revokeInvite not yet implemented')
  }

  /** Accept a community invite by code. */
  async acceptInvite(code: string): Promise<string> {
    this.requireSocket()
    void code
    throw new ZaileysDomainError('OPERATION_FAILED', 'acceptInvite not yet implemented')
  }
}
