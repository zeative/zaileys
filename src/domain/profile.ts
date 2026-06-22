import type { WAMediaUpload } from 'baileys'
import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'

export class ProfileModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  async setName(name: string): Promise<void> {
    await this.requireSocket().updateProfileName(name)
  }

  async setStatus(status: string): Promise<void> {
    await this.requireSocket().updateProfileStatus(status)
  }

  /** Set the profile/group picture. `jid` defaults to self; pass a group jid to set a group avatar. */
  async setPicture(jid: string, image: WAMediaUpload): Promise<void> {
    await this.requireSocket().updateProfilePicture(jid, image)
  }

  async removePicture(jid: string): Promise<void> {
    await this.requireSocket().removeProfilePicture(jid)
  }

  async getPicture(jid: string, hd = false): Promise<string | null> {
    const url = await this.requireSocket().profilePictureUrl(jid, hd ? 'image' : 'preview')
    return url ?? null
  }

  async getStatus(jid: string): Promise<unknown> {
    return this.requireSocket().fetchStatus(jid)
  }
}
