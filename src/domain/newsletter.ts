import type { OperationGuard } from '../automation/operation-guard.js'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { NewsletterMetadata } from './types.js'

export class NewsletterModule {
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

  async create(name: string, opts?: { description?: string; picture?: Buffer }): Promise<NewsletterMetadata> {
    return this.run('newsletter.create', async () => {
      const socket = this.requireSocket()
      const metadata = await socket.newsletterCreate(name, opts?.description)
      if (opts?.picture) {
        await socket.newsletterUpdatePicture(metadata.id, opts.picture)
      }
      return metadata
    })
  }

  async follow(jid: string): Promise<void> {
    await this.run('newsletter.follow', () => this.requireSocket().newsletterFollow(jid))
  }

  async unfollow(jid: string): Promise<void> {
    await this.run('newsletter.follow', () => this.requireSocket().newsletterUnfollow(jid))
  }

  async metadata(jid: string): Promise<NewsletterMetadata> {
    const socket = this.requireSocket()
    const metadata = await socket.newsletterMetadata('jid', jid)
    if (!metadata) {
      throw new ZaileysDomainError('NEWSLETTER_NOT_FOUND', `newsletter ${jid} not found`)
    }
    return metadata
  }

  async updateName(jid: string, name: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdateName(jid, name)
  }

  async updateDescription(jid: string, description: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdateDescription(jid, description)
  }

  async updatePicture(jid: string, picture: Buffer): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUpdatePicture(jid, picture)
  }

  async mute(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterMute(jid)
  }

  async unmute(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterUnmute(jid)
  }

  async delete(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.newsletterDelete(jid)
  }

  async removePicture(jid: string): Promise<void> {
    await this.requireSocket().newsletterRemovePicture(jid)
  }

  async react(jid: string, serverId: string, emoji: string): Promise<void> {
    await this.requireSocket().newsletterReactMessage(jid, serverId, emoji)
  }

  /** Remove a reaction from a newsletter message. */
  async unreact(jid: string, serverId: string): Promise<void> {
    await this.requireSocket().newsletterReactMessage(jid, serverId)
  }

  async subscribers(jid: string): Promise<unknown> {
    return this.requireSocket().newsletterSubscribers(jid)
  }

  async messages(jid: string, count = 50, opts?: { since?: number; after?: number }): Promise<unknown> {
    return this.requireSocket().newsletterFetchMessages(jid, count, opts?.since, opts?.after)
  }

  async adminCount(jid: string): Promise<number> {
    return this.requireSocket().newsletterAdminCount(jid)
  }

  async changeOwner(jid: string, newOwnerJid: string): Promise<void> {
    await this.requireSocket().newsletterChangeOwner(jid, newOwnerJid)
  }

  async demote(jid: string, userJid: string): Promise<void> {
    await this.requireSocket().newsletterDemote(jid, userJid)
  }
}
