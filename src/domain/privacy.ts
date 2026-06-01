import { ZaileysDomainError } from './errors.js'
import type { DomainSocketLike } from './socket-like.js'
import type { PrivacyConfig, PrivacySettings, WAReadReceiptsValue } from './types.js'

export class PrivacyModule {
  constructor(private readonly getSocket: () => DomainSocketLike | undefined) {}

  protected requireSocket(): DomainSocketLike {
    const socket = this.getSocket()
    if (!socket) {
      throw new ZaileysDomainError('NOT_CONNECTED', 'client not connected')
    }
    return socket
  }

  async set(config: PrivacyConfig & { readReceipts?: WAReadReceiptsValue | boolean }): Promise<void> {
    const socket = this.requireSocket()

    if (config.lastSeen !== undefined) {
      await socket.updateLastSeenPrivacy(config.lastSeen)
    }
    if (config.online !== undefined) {
      await socket.updateOnlinePrivacy(config.online)
    }
    if (config.profile !== undefined) {
      await socket.updateProfilePicturePrivacy(config.profile)
    }
    if (config.status !== undefined) {
      await socket.updateStatusPrivacy(config.status)
    }
    if (config.readReceipts !== undefined) {
      const value: WAReadReceiptsValue =
        typeof config.readReceipts === 'boolean'
          ? config.readReceipts
            ? 'all'
            : 'none'
          : config.readReceipts
      await socket.updateReadReceiptsPrivacy(value)
    }
    if (config.groupAdd !== undefined) {
      await socket.updateGroupsAddPrivacy(config.groupAdd)
    }
  }

  async get(): Promise<PrivacySettings> {
    const socket = this.requireSocket()
    return socket.fetchPrivacySettings()
  }

  async block(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateBlockStatus(jid, 'block')
  }

  async unblock(jid: string): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateBlockStatus(jid, 'unblock')
  }

  async blocklist(): Promise<string[]> {
    const socket = this.requireSocket()
    return socket.fetchBlocklist()
  }

  async disappearingMode(seconds: number): Promise<void> {
    const socket = this.requireSocket()
    await socket.updateDefaultDisappearingMode(seconds)
  }
}
