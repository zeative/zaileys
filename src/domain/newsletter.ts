import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { NewsletterMetadata } from './types.js'

/**
 * Typed wrapper over the baileys newsletter v2 socket methods. Exposed as
 * `client.newsletter`. Every method requires a live socket via
 * {@link NewsletterModule.requireSocket} and maps to a single baileys WMex call.
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

  /** Create a newsletter channel, optionally setting its picture afterwards. */
  async create(name: string, opts?: { description?: string; picture?: Buffer }): Promise<NewsletterMetadata> {
    const socket = this.requireSocket()
    const metadata = await socket.newsletterCreate(name, opts?.description)
    if (opts?.picture) {
      await socket.newsletterUpdatePicture(metadata.id, opts.picture)
    }
    return metadata
  }

  /** Follow (join) a newsletter. */
  async follow(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterFollow(jid)
  }

  /** Unfollow (leave) a newsletter. */
  async unfollow(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUnfollow(jid)
  }

  /** Fetch newsletter metadata by jid. Throws when the jid resolves to nothing. */
  async metadata(jid: string): Promise<NewsletterMetadata> {
    const socket = this.requireSocket()
    const metadata = await socket.newsletterMetadata('jid', jid)
    if (!metadata) {
      throw new ZaileysDomainError('NEWSLETTER_NOT_FOUND', `newsletter ${jid} not found`)
    }
    return metadata
  }

  /** Update a newsletter name. */
  async updateName(jid: string, name: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdateName(jid, name)
  }

  /** Update a newsletter description. */
  async updateDescription(jid: string, description: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdateDescription(jid, description)
  }

  /** Update a newsletter picture from a raw image buffer. */
  async updatePicture(jid: string, picture: Buffer): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdatePicture(jid, picture)
  }

  /** Mute a newsletter. */
  async mute(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterMute(jid)
  }

  /** Unmute a newsletter. */
  async unmute(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUnmute(jid)
  }

  /** Delete a newsletter. */
  async delete(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterDelete(jid)
  }
}
