import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { NewsletterMetadata } from './types.js'

/**
 * Typed wrapper over the baileys newsletter v2 socket methods. Exposed as
 * `client.newsletter`. Bodies are filled by Wave 2 plan-004.
 */
export class NewsletterModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  /** Create a newsletter channel. */
  async create(name: string, opts?: { description?: string; picture?: Buffer }): Promise<NewsletterMetadata> {
    this.requireSocket()
    void name
    void opts
    throw new ZaileysDomainError('OPERATION_FAILED', 'create not yet implemented')
  }

  /** Follow (join) a newsletter. */
  async follow(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'follow not yet implemented')
  }

  /** Unfollow (leave) a newsletter. */
  async unfollow(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'unfollow not yet implemented')
  }

  /** Fetch newsletter metadata by jid. */
  async metadata(jid: string): Promise<NewsletterMetadata> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'metadata not yet implemented')
  }

  /** Update a newsletter name. */
  async updateName(jid: string, name: string): Promise<void> {
    this.requireSocket()
    void jid
    void name
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateName not yet implemented')
  }

  /** Update a newsletter description. */
  async updateDescription(jid: string, description: string): Promise<void> {
    this.requireSocket()
    void jid
    void description
    throw new ZaileysDomainError('OPERATION_FAILED', 'updateDescription not yet implemented')
  }

  /** Update a newsletter picture. */
  async updatePicture(jid: string, picture: Buffer): Promise<void> {
    this.requireSocket()
    void jid
    void picture
    throw new ZaileysDomainError('OPERATION_FAILED', 'updatePicture not yet implemented')
  }

  /** Mute a newsletter. */
  async mute(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'mute not yet implemented')
  }

  /** Unmute a newsletter. */
  async unmute(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'unmute not yet implemented')
  }

  /** Delete a newsletter. */
  async delete(jid: string): Promise<void> {
    this.requireSocket()
    void jid
    throw new ZaileysDomainError('OPERATION_FAILED', 'delete not yet implemented')
  }
}
